import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {prepararPlano,linhasDoPlano,parcelaProtegida} from '../src/plano-parcelas.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=nome=>readFileSync(new URL(`../supabase/operacoes/${nome}.sql`,import.meta.url),'utf8');
test('prévia preserva pagas, parciais, entrada e boletos; não redistribui valores por suposição',()=>{
 const parcelas=[{id:id(1),status:'Pago',valor_liquidado:50},{id:id(2),status:'Parcial'}, {id:id(3),nosso_numero:'banco'},{id:id(4),tipo:'Entrada'}, {id:id(5),versao:1,status:'Pendente',vencimento:'2026-11-01',valor_previsto:100}];
 assert.equal(parcelas.filter(parcelaProtegida).length,4);
 const linhas=linhasDoPlano(parcelas,2);assert.equal(linhas[0].id,id(5));assert.equal(linhas[1].valor_previsto,'');
 assert.throws(()=>prepararPlano(parcelas,linhas,'Revisão solicitada'));
 linhas[1]={vencimento:'2026-12-01',valor_previsto:123.45};
 const plano=prepararPlano(parcelas,linhas,'Revisão solicitada');assert.equal(plano.totalNovoCentavos,22345);assert.equal(plano.protegidas.length,4);
 assert.throws(()=>prepararPlano(parcelas,[{...linhas[0],id:id(1)}],'Revisão solicitada'));
 assert.equal(prepararPlano(parcelas,[],'Cancelamento solicitado').canceladas.length,1);
});
async function banco(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create table profiles(id uuid primary key,ativo boolean,tipo text,setor text);insert into profiles values('${id(1)}',true,'Financeiro','Financeiro'),('${id(2)}',true,'Comercial','Comercial'),('${id(3)}',false,'Administrador','Diretoria');
 create table fin_receb_municipios(id uuid primary key);create table fin_receb_remessas(id uuid primary key);create table fin_receb_clientes(id uuid primary key,municipio_id uuid,remessa_id uuid,ativo boolean,valor_entrada numeric);
 create table fin_receb_importacoes(id bigint generated always as identity,arquivo_nome text,total_registros int,conciliados int,pendentes int,created_by uuid);
 create table fin_receb_parcelas(id uuid primary key default gen_random_uuid(),cliente_id uuid references fin_receb_clientes(id),numero int,vencimento date,valor_previsto numeric,nosso_numero text,documento text,status text,pago_em date,valor_liquidado numeric,diferenca numeric,ativo boolean);
 create table integracao_moradores(referencia_id uuid,registro_id text,colecao text,dados jsonb);create table integracao_revisoes(modulo text primary key,versao bigint);
 create schema integracao_crm_privado;create function integracao_crm_privado.sinalizar_revisao() returns trigger language plpgsql security definer as $$begin update public.integracao_revisoes set versao=versao+1 where modulo=tg_argv[0];return null;end$$;
 grant select on profiles,integracao_moradores to authenticated;grant all on fin_receb_parcelas,fin_receb_importacoes to authenticated;grant select on fin_receb_municipios,fin_receb_remessas,fin_receb_clientes to authenticated;grant usage on all sequences in schema public to authenticated;
 alter table fin_receb_parcelas enable row level security;alter table fin_receb_importacoes enable row level security;
 insert into fin_receb_clientes values('${id(20)}',null,null,true,0);
 insert into fin_receb_parcelas values('${id(30)}','${id(20)}',1,'2026-11-01',100,null,null,'Pendente',null,0,0,true),('${id(31)}','${id(20)}',2,'2026-12-01',100,null,null,'Pago','2026-10-01',100,0,true),('${id(32)}','${id(20)}',3,'2027-01-01',100,null,null,'Pendente',null,0,0,true);
 create schema ailos_privado;create table ailos_privado.boletos(parcela_id uuid,snapshot jsonb);insert into ailos_privado.boletos values('${id(32)}','{}');`);
 await db.exec(sql('financeiro-compartilhado'));await db.exec(sql('financeiro-plano-parcelas'));return db;
}
const login=(db,n)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated;`);
const carregar=async db=>(await db.query('select integracao_financeiro_plano($1) as plano',[id(20)])).rows[0].plano;
const salvar=(db,plano,pedido=id(99))=>db.query('select integracao_financeiro_plano($1,$2,$3,$4,$5)',[id(20),JSON.stringify(plano.anteriores),JSON.stringify(plano.itens),plano.motivo,pedido]);
test('plano atômico: mesma autorização, concorrência, idempotência, Ailos e auditoria sem apagar parcelas',async()=>{
 const db=await banco();try{
  await login(db,2);await assert.rejects(carregar(db),/consulta/);await login(db,3);await assert.rejects(carregar(db),/consulta/);
  await login(db,1);const original=await carregar(db);assert.equal(original.parcelas.filter(p=>p.protegida).length,2);
  const plano=prepararPlano(original.parcelas,[{id:id(30),vencimento:'2026-11-05',valor_previsto:80},{vencimento:'2026-12-05',valor_previsto:20}],'Revisão confirmada pelo responsável');
  await salvar(db,plano);await salvar(db,plano);
  let atual=await carregar(db);assert.equal(atual.parcelas.length,4);assert.equal(Number(atual.parcelas.find(p=>p.id===id(31)).valor_liquidado),100);assert.equal(atual.parcelas.find(p=>p.id===id(32)).versao,1);
  await assert.rejects(salvar(db,{...plano,motivo:'Conteúdo diferente'}),/diferente/);
  await assert.rejects(salvar(db,plano,id(98)),/mudaram/);
  const cancelamento=prepararPlano(atual.parcelas,[],'Cancelamento das parcelas editáveis');await salvar(db,cancelamento,id(97));
  atual=await carregar(db);assert.equal(atual.parcelas.length,2);assert.ok(atual.parcelas.every(p=>p.protegida));
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from fin_receb_parcelas')).rows[0].n,4);
  assert.ok((await db.query('select count(*)::int as n from integracao_financeiro_privado.auditoria')).rows[0].n>=5);
  assert.equal((await db.query(`select count(*)::int as n from integracao_financeiro_privado.auditoria where parcela_id in ('${id(31)}','${id(32)}')`)).rows[0].n,0);
 } finally {await db.close();}
});

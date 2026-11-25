import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {COLUNAS_FINANCEIRAS} from '../src/contrato-financeiro.js';
import {id} from './fixture.js';

const ler=caminho=>fs.readFileSync(new URL(caminho,import.meta.url),'utf8');
const migration=ler('../supabase/migrations/20261125190100_clientes_valores_contrato_restritos.sql');
const reversao=ler('../supabase/operacoes/clientes-valores-contrato-restritos-reversao.sql');
const autorizados=['Administrador','Diretor Técnico','Diretor de Projetos','Comercial','Atendimentos','Financeiro'];
const demais=['Topografia','Projetos','Pós-protocolo','Jurídico','Marketing','Administrativo','Consulta'];
// Tabela fictícia só com as colunas que o Integração lê e grava; a definição real é do ERP.
async function banco(){
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,tipo text,setor text,ativo boolean);
 create table fin_receb_clientes(id uuid primary key,nome text,cpf_cnpj text,ativo boolean,valor_global numeric,valor_entrada numeric,numero_parcelas integer,valor_parcela numeric,primeiro_vencimento date,dia_vencimento integer);
 grant usage on schema auth to authenticated,anon,service_role;
 grant select,insert,update on fin_receb_clientes to authenticated,anon,service_role;
 insert into profiles values('${id(1)}','Comercial','Comercial',true);
 insert into fin_receb_clientes values('${id(4)}','Morador fictício','SINTETICO',true,1000,100,9,100,'2026-12-10',10);
 alter table profiles enable row level security;`);
 await db.exec(migration);
 return db;
}
const como=async(db,tipo,setor=tipo,ativo=true)=>{await db.exec('reset role');await db.query('update profiles set tipo=$1,setor=$2,ativo=$3',[tipo,setor,ativo]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);await db.exec('set role authenticated');};
const mudancas=[['valor_global','valor_global+1'],['valor_entrada','valor_entrada+1'],['numero_parcelas','numero_parcelas+1'],['valor_parcela','valor_parcela+1'],['primeiro_vencimento',"primeiro_vencimento+1"],['dia_vencimento','case dia_vencimento when 10 then 11 else 10 end']];

test('EDI-C3: a migration cobre as colunas financeiras usadas pela ficha',()=>{
 for(const coluna of [...Object.values(COLUNAS_FINANCEIRAS),'primeiro_vencimento'])assert.ok(migration.includes(`'${coluna}'`),coluna);
 assert.match(migration,/PREPARADA, NÃO APLICADA/);assert.match(migration,/before update on public\.fin_receb_clientes/);
});

test('EDI-C3: só Diretoria, Comercial e Financeiro alteram valores do contrato; o cadastro segue livre',async()=>{
 const db=await banco();try{
  for(const tipo of autorizados){await como(db,tipo);for(const [coluna,expr] of mudancas)assert.equal((await db.query(`update fin_receb_clientes set ${coluna}=${expr} returning id`)).rows.length,1,tipo+'/'+coluna);}
  await como(db,'Topografia','Financeiro');assert.equal((await db.query('update fin_receb_clientes set valor_global=valor_global+1 returning id')).rows.length,1,'financeiro pelo setor');
  await db.exec('reset role');const antes=(await db.query('select * from fin_receb_clientes')).rows[0];
  for(const tipo of demais){
   await como(db,tipo);
   for(const [coluna,expr] of mudancas)await assert.rejects(()=>db.query(`update fin_receb_clientes set ${coluna}=${expr}`),e=>e.code==='42501'&&/Diretoria, Comercial e Financeiro/.test(e.message),tipo+'/'+coluna);
   // Alteração de cadastro sem tocar nos valores, inclusive reenviando os mesmos valores.
   assert.equal((await db.query("update fin_receb_clientes set nome='Morador fictício',cpf_cnpj='SINTETICO',valor_global=valor_global,valor_entrada=valor_entrada+0,dia_vencimento=dia_vencimento returning id")).rows.length,1,tipo+': cadastro');
   // Lote misto é recusado inteiro.
   await assert.rejects(()=>db.query("update fin_receb_clientes set nome='Não deve persistir',valor_parcela=1"),e=>e.code==='42501');
  }
  await como(db,'Comercial','Comercial',false);await assert.rejects(()=>db.query('update fin_receb_clientes set valor_global=1'),e=>e.code==='42501','perfil inativo');
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role authenticated;");
  await assert.rejects(()=>db.query('update fin_receb_clientes set valor_global=1'),e=>e.code==='42501','sem usuário identificado');
  await db.exec('reset role');assert.deepEqual((await db.query('select * from fin_receb_clientes')).rows[0],antes,'nenhuma recusa gravou parte da alteração');
 }finally{await db.close();}
});

test('EDI-C3: rotinas internas continuam gravando e a reversão remove o bloqueio',async()=>{
 const db=await banco();try{
  await db.exec("select set_config('request.jwt.claim.sub','',false);set role service_role;");
  assert.equal((await db.query('update fin_receb_clientes set valor_global=2000 returning id')).rows.length,1,'service_role');
  await db.exec('reset role');assert.equal((await db.query('update fin_receb_clientes set valor_entrada=200 returning id')).rows.length,1,'sem papel de usuário');
  await como(db,'Topografia');await assert.rejects(()=>db.query('update fin_receb_clientes set valor_global=1'),e=>e.code==='42501');
  await db.exec('reset role');await db.exec(reversao);await db.exec(reversao);
  await como(db,'Topografia');assert.equal((await db.query('update fin_receb_clientes set valor_global=1 returning id')).rows.length,1,'revertido');
  await db.exec('reset role');await db.exec(migration);
  await como(db,'Topografia');await assert.rejects(()=>db.query('update fin_receb_clientes set valor_global=2'),e=>e.code==='42501','reaplicável após a reversão');
 }finally{await db.close();}
});

test('EDI-C3: coluna ausente na tabela real não derruba as gravações',async()=>{
 const db=await banco();try{
  await db.exec('alter table fin_receb_clientes drop column primeiro_vencimento');
  await como(db,'Topografia');
  assert.equal((await db.query("update fin_receb_clientes set nome='Outro nome fictício' returning id")).rows.length,1);
  await assert.rejects(()=>db.query('update fin_receb_clientes set valor_global=1'),e=>e.code==='42501');
 }finally{await db.close();}
});

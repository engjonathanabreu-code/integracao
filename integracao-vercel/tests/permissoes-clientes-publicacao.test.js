import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {permissoes} from '../src/permissoes.js';
import {projetar,prepararEdicao,copy} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';
const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/permissoes-clientes-producao.json',import.meta.url),'utf8'));
const correcao=fs.readFileSync(new URL('../supabase/migrations/20260923182216_clientes_edicao_comercial.sql',import.meta.url),'utf8');
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const tipos=['Administrador','Diretor Técnico','Diretor de Projetos','Comercial','Financeiro','Topografia','Projetos','Jurídico','Marketing','Pós-protocolo','Consulta'];
const alvos=[['fin_receb_clientes','cadastro',4],['fin_receb_municipios','estrutura',2],['fin_receb_remessas','estrutura',3],['processos_kanban','nucleos',5]];
async function banco(){
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema integracao_crm_privado;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,tipo text,setor text,ativo boolean);
 create table fin_receb_clientes(id uuid primary key,nome text,valor_entrada numeric);
 create table fin_receb_municipios(id uuid primary key,nome text);
 create table fin_receb_remessas(id uuid primary key,nome text);
 create table processos_kanban(id uuid primary key,nucleo text);
 create table integracao_crm_cards(id uuid primary key,cliente_id uuid);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
 grant usage on schema auth,integracao_crm_privado to authenticated,anon;
 grant select,insert,update,delete on all tables in schema public to authenticated;
 grant select,update on all tables in schema public to anon;
 insert into profiles values('${id(1)}','Comercial','Comercial',true);
 insert into fin_receb_clientes values('${id(4)}','Morador Teste',100);
 insert into fin_receb_municipios values('${id(2)}','Município teste');
 insert into fin_receb_remessas values('${id(3)}','Remessa teste');
 insert into processos_kanban values('${id(5)}','NUI01');`);
 // Definitions captured from production, not permissive substitutes.
 for(const nome of ['is_admin','is_comercial','is_erp_admin','can_manage_core','can_access_fin_recebimentos','permite','integracao_acesso','integracao_gravar'])await db.exec(snapshot.funcoes.find(f=>f.nome===nome).sql);
 for(const t of new Set(snapshot.politicas.map(p=>p.tablename)))await db.exec('alter table public.'+ident(t)+' enable row level security');
 for(const p of snapshot.politicas){
  if(p.policyname==='integracao_comercial_moradores_editar')continue;
  await db.exec('create policy '+ident(p.policyname)+' on public.'+ident(p.tablename)+' for '+p.cmd+' to authenticated'+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':''));
 }
 await db.exec(correcao);
 return db;
}
async function perfil(db,tipo,ativo=true){
 await db.exec('reset role');await db.query('update profiles set tipo=$1,setor=$1,ativo=$2 where id=$3',[tipo,ativo,id(1)]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);await db.exec('set role authenticated');
 const b=fixture();Object.assign(b.profiles[0],{tipo,setor:tipo,ativo});const state=projetar(b,blank());return {state,usuario:state.db.usuarios[0]};
}
test('ações de Clientes disponíveis na interface têm permissão de gravação no banco, sem depender de CRM',async()=>{
 const db=await banco();try{
  for(const tipo of tipos){
   const {usuario}=await perfil(db,tipo);const perm=permissoes(usuario);
   for(const [t,acao,chave] of alvos){
    const linhas=(await db.query('select id from '+ident(t)+' where id=$1 for update',[id(chave)])).rows;
    if(perm[acao])assert.equal(linhas.length,1,tipo+': interface permite '+acao+' mas banco bloqueia '+t);
    if(t==='fin_receb_clientes'&&!perm.cadastro)assert.equal(linhas.length,0,tipo+' não deve editar cadastro');
   }
   await perfil(db,tipo,false);
   for(const [t,,chave] of alvos)assert.equal((await db.query('select id from '+ident(t)+' where id=$1 for update',[id(chave)])).rows.length,0,'inativo: '+tipo+'/'+t);
  }
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon;");
  assert.equal((await db.query('select id from fin_receb_clientes for update')).rows.length,0);
 }finally{await db.close();}
});
test('operação real do formulário passa pela RPC com idempotência, conflito e lote atômico',async()=>{
 const db=await banco();try{
  const {state,usuario}=await perfil(db,'Comercial'),novo=copy(state.db);novo.processos[0].requerente.nome='Nome atualizado';
  const ops=prepararEdicao(state.db,novo,state,usuario);assert.equal(ops.length,1);assert.equal(ops[0].table,'fin_receb_clientes');
  const pedido=id(90);const salvar=(operacoes,p=pedido)=>db.query('select public.integracao_gravar($1::jsonb,$2::uuid) as resultado',[JSON.stringify(operacoes),p]);
  const resultado=await salvar(ops);assert.deepEqual((await salvar(ops)).rows,resultado.rows);
  assert.equal((await db.query('select nome from fin_receb_clientes')).rows[0].nome,'Nome atualizado');
  await assert.rejects(()=>salvar(ops,id(91)),e=>e.code==='40001');
  const valido={table:'fin_receb_clientes',key:{id:id(4)},expected:{nome:'Nome atualizado'},changes:{nome:'Não deve persistir'}};
  const ausente={...valido,key:{id:id(99)}};
  await assert.rejects(()=>salvar([valido,ausente],id(92)),/Registro indisponível/);
  assert.equal((await db.query('select nome from fin_receb_clientes')).rows[0].nome,'Nome atualizado','falha não grava metade do lote');
  assert.equal((await db.query('delete from fin_receb_clientes returning id')).rows.length,0);
  await db.exec('reset role;drop policy integracao_comercial_moradores_editar on fin_receb_clientes;set role authenticated;');
  await assert.rejects(()=>salvar([valido],id(93)),/Registro indisponível/,'reintroduzir a falha original é detectado');
 }finally{await db.close();}
});

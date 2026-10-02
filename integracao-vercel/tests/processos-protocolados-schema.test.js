import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepararBanco} from './crm-schema.test.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration=readFileSync(new URL('../supabase/migrations/20260930173755_processos_protocolados_prefeitura.sql',import.meta.url),'utf8');
async function montar(){
 const db=await prepararBanco();
 await db.exec(`alter table processos_kanban add column etapa_atual text default 'Topografia';
 alter table processos_kanban_andamentos add column created_at timestamptz default now();
 create table processos_kanban_historico(id uuid primary key default gen_random_uuid(),processo_id uuid,etapa_anterior text,etapa_nova text);
 insert into processos_kanban_historico(processo_id,etapa_anterior,etapa_nova) values('${id(40)}','Coleta Documental','Topografia');
 grant usage on schema integracao_crm_privado to authenticated,service_role;`);
 await db.exec(migration);return db;
}
async function como(db,user,sql){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(user)}';`);try{return await db.query(sql);}finally{await db.exec('reset role;reset request.jwt.claim.sub;');}}
test('migração preserva etapa interna e histórico anterior; nova etapa aceita somente os sete valores',async()=>{
 const db=await montar();try{
  assert.equal((await db.query('select fluxo from processos_kanban_historico')).rows[0].fluxo,'interno');
  await db.query("update processos_kanban set etapa_prefeitura='Parecer Social'");
  assert.equal((await db.query('select etapa_atual from processos_kanban')).rows[0].etapa_atual,'Topografia');
  await assert.rejects(()=>db.query("update processos_kanban set etapa_prefeitura='Outra'"));
 }finally{await db.close();}
});
test('andamento autorizado inicializa IA com RLS e preserva recusas existentes',async()=>{
 const db=await montar();try{
  await como(db,4,`insert into processos_kanban_andamentos(processo_id,descricao_cliente,visivel_ia) values('${id(40)}','Análise em andamento',false)`);
  assert.equal((await db.query('select count(*) n from integracao_nucleo_ia')).rows[0].n,0);
  await como(db,4,`insert into processos_kanban_andamentos(processo_id,descricao_cliente,visivel_ia) values('${id(40)}','Análise em andamento',true)`);
  assert.equal((await db.query('select habilitado from integracao_nucleo_ia')).rows[0].habilitado,true);
  await como(db,4,`update integracao_nucleo_ia set habilitado=false where id='${id(40)}'`);
  await como(db,4,`insert into processos_kanban_andamentos(processo_id,descricao_cliente,visivel_ia) values('${id(40)}','Nova informação',true)`);
  assert.equal((await db.query('select habilitado from integracao_nucleo_ia')).rows[0].habilitado,false);
  await assert.rejects(()=>como(db,2,`insert into processos_kanban_andamentos(processo_id,descricao_cliente,visivel_ia) values('${id(40)}','Comercial sem permissão',true)`));
  assert.equal((await db.query("select has_function_privilege('anon','integracao_crm_privado.inicializar_ia_andamento()','execute') p")).rows[0].p,false);
 }finally{await db.close();}
});
test('contexto Chatwoot inclui etapa municipal e apenas descrições liberadas da identidade confirmada',async()=>{
 const db=await montar();try{
  await db.exec(`
   update processos_kanban set etapa_prefeitura='Notificações';
   insert into integracao_moradores values('processos','${id(20)}','${id(20)}','{"nucleoId":"${id(40)}"}');
   insert into integracao_crm_cards(id,cliente_id) values('${id(50)}','${id(20)}');
   insert into integracao_crm_conversas(card_id,instalacao,conta_id,conversa_id,contato_id,identidade_confirmada) values('${id(50)}','chat.test',1,10,20,true),('${id(50)}','chat.test',1,11,21,false);
   insert into processos_kanban_andamentos(processo_id,status,descricao_cliente,observacao_interna,visivel_ia,data_atualizacao) values('${id(40)}','Notificações','Descrição autorizada','SEGREDO INTERNO',true,'2026-09-30'),('${id(40)}','Notificações','RASCUNHO OCULTO','OUTRO SEGREDO',false,'2026-09-30');`);
  const c=(await db.query("select integracao_crm_contexto('chat.test',1,10) c")).rows[0].c;
  assert.equal(c.etapa_prefeitura,'Notificações');assert.equal(c.andamentos.length,1);assert.equal(c.andamentos[0].descricao,'Descrição autorizada');
  assert.ok(!JSON.stringify(c).includes('SEGREDO'));assert.ok(!JSON.stringify(c).includes('RASCUNHO'));
  assert.equal((await db.query("select integracao_crm_contexto('chat.test',1,11) c")).rows[0].c,null);
  await db.query('update integracao_nucleo_ia set habilitado=false');
  assert.equal((await db.query("select integracao_crm_contexto('chat.test',1,10) c")).rows[0].c,null);
 }finally{await db.close();}
});

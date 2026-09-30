import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {conciliarEdicoes} from '../src/concorrencia.js';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const canonical=['fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','processos_kanban','processos_kanban_andamentos','processos_kanban_observacoes','processos_kanban_historico','meta_setores','metas','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','meta_arquivos','ordens_servico','ordem_servico_comentarios','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','erp_agendas','erp_eventos','erp_conversas'];
const extras=['integracao_complementos','integracao_moradores','integracao_nucleos','integracao_municipios','integracao_remessas','integracao_metas','integracao_planos','integracao_ordens_servico','integracao_chat','integracao_usuarios','integracao_calendario','integracao_notificacoes','integracao_auditoria','integracao_configuracoes','integracao_arquivos'];
test('global reconciliation: all shared tables, idempotence, real conflicts, RLS and atomicity',async t=>{
 const db=new PGlite();try{
 await db.exec(`create schema auth;create role authenticated;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,ativo boolean);insert into profiles values('${owner}',true),('${other}',true);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
 grant usage on schema auth,public to authenticated;grant select on profiles to authenticated;grant select,insert on integracao_pedidos to authenticated;
 alter table integracao_pedidos enable row level security;create policy own on integracao_pedidos to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());`);
 for(const table of [...canonical,...extras])await db.exec(`create table ${table}(${extras.includes(table)?'colecao text,registro_id text':'id uuid'},titulo text,nota text,dados jsonb,concluido boolean,concluido_em timestamptz,concluido_por uuid,criado_por uuid,primary key(${extras.includes(table)?'colecao,registro_id':'id'}));
 insert into ${table}(${extras.includes(table)?'colecao,registro_id':'id'},titulo,nota,dados,concluido,criado_por) values(${extras.includes(table)?"'test','record'":`'${owner}'`},'Antes','Antes','{"a":0,"b":0}',false,'${owner}');
 grant select,update,insert,delete on ${table} to authenticated;alter table ${table} enable row level security;create policy own on ${table} to authenticated using(criado_por=auth.uid()) with check(criado_por=auth.uid());`);
 for(const p of ['./fixtures/gravar-antes-leitura.sql','../supabase/migrations/20260928161356_chat_leitura_sem_conflito.sql','../supabase/migrations/20260928164241_notificacoes_leitura_sem_conflito.sql','../supabase/migrations/20260929145521_moradores_mesclagem_sem_conflito.sql','../supabase/migrations/20260929162047_modulos_mesclagem_sem_conflito.sql','../supabase/migrations/20260930133924_concorrencia_global_segura.sql'])await db.exec(read(p));
 const login=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await login(owner);
 const key=table=>extras.includes(table)?{colecao:'test',registro_id:'record'}:{id:owner};
 const send=(table,expected,changes,remove=false,pedido=crypto.randomUUID())=>db.query('select integracao_gravar($1,$2)',[JSON.stringify([{table,key:key(table),expected,changes,remove}]),pedido]);
 for(const table of [...canonical,...extras])await t.test(table,async()=>{
  await db.exec(`update ${table} set titulo='Antes',nota='Remoto',dados='{"a":0,"b":1}'`);
  await send(table,{titulo:'Antes'},{titulo:'Local'});
  const request=crypto.randomUUID();await send(table,{titulo:'Antes'},{titulo:'Local'},false,request);await send(table,{titulo:'Antes'},{titulo:'Local'},false,request);
  await send(table,{dados:{a:0,b:0}},{dados:{a:1,b:0}});
  const row=(await db.query(`select * from ${table}`)).rows[0];assert.equal(row.nota,'Remoto');assert.deepEqual(row.dados,{a:1,b:1});
  await assert.rejects(()=>send(table,{titulo:'Antes'},{titulo:'Diferente'}),e=>e.code==='PT409');
  await assert.rejects(()=>send(table,{titulo:'Antes'},null,true),e=>e.code==='PT409');
  await login(other);await assert.rejects(()=>send(table,{titulo:'Antes'},{titulo:'Local'}),/sem permissão/);await login(owner);
 });
 await t.test('two completions preserve the first timestamp and author',async()=>{
  await db.exec(`update meta_checklist set concluido=true,concluido_em='2026-09-30T10:00:00Z',concluido_por='${owner}'`);
  await send('meta_checklist',{concluido:false,concluido_em:null},{concluido:true,concluido_em:'2026-09-30T10:00:01Z',concluido_por:other});
  const r=(await db.query('select concluido_em::text,concluido_por from meta_checklist')).rows[0];assert.equal(r.concluido_por,owner);assert.match(r.concluido_em,/10:00:00/);
 });
 await t.test('concurrent inserts converge without replacing identity or overwriting existing fields',async()=>{
  const insert=(table,changes)=>db.query('select integracao_gravar($1,$2)',[JSON.stringify([{table,key:key(table),insert:true,changes:{criado_por:owner,...changes}}]),crypto.randomUUID()]);
  for(const table of extras){
   await insert(table,{dados:{adicionado:1},criado_por:owner});
   const r=(await db.query(`select dados,criado_por from ${table}`)).rows[0];assert.deepEqual(r.dados,{a:1,b:1,adicionado:1});assert.equal(r.criado_por,owner);
   await insert(table,{dados:{adicionado:1},criado_por:owner});
   await assert.rejects(()=>insert(table,{dados:{adicionado:2}}),e=>e.code==='PT409');
  }
  await insert('meta_comentarios',{titulo:'Local',criado_por:owner});
  await assert.rejects(()=>insert('meta_comentarios',{titulo:'Outra mensagem'}),e=>e.code==='PT409');
  await login(other);await assert.rejects(()=>insert('integracao_metas',{dados:{adicionado:1},criado_por:other}),/sem permissão/);await login(owner);
 });
 await t.test('keyed lists merge edits/additions/deletions and reject deleted item edits',async()=>{
  const merge=async(b,l,r)=>(await db.query('select integracao_mesclar_json_seguro($1,$2,$3) v',[JSON.stringify(b),JSON.stringify(l),JSON.stringify(r)])).rows[0].v;
  assert.deepEqual(await merge([{id:'a',x:0},{id:'b',x:0}],[{id:'a',x:1},{id:'b',x:0},{id:'c',x:1}],[{id:'a',x:0},{id:'b',x:2},{id:'d',x:1}]),[{id:'a',x:1},{id:'b',x:2},{id:'d',x:1},{id:'c',x:1}]);
  assert.deepEqual(await merge([{id:'a',x:0},{id:'b',x:0}],[{id:'b',x:0}],[{id:'a',x:0},{id:'b',x:1}]),[{id:'b',x:1}]);
  await assert.rejects(()=>merge([{id:'a',x:0}],[],[{id:'a',x:1}]),e=>e.code==='PT409');
  await assert.rejects(()=>merge([],['a'],['b']),e=>e.code==='PT409');
 });
 await t.test('conflict rolls back every operation and its receipt',async()=>{
  const request=crypto.randomUUID();await assert.rejects(()=>db.query('select integracao_gravar($1,$2)',[JSON.stringify([{table:'metas',key:{id:owner},expected:{titulo:'Local'},changes:{titulo:'Rollback'}},{table:'meta_checklist',key:{id:owner},expected:{titulo:'Antes'},changes:{titulo:'Diferente'}}]),request]),e=>e.code==='PT409');
  assert.equal((await db.query('select titulo from metas')).rows[0].titulo,'Local');assert.equal((await db.query('select count(*)::int n from integracao_pedidos where pedido=$1',[request])).rows[0].n,0);
 });
 }finally{await db.close();}
});
test('browser reconciliation retains both alternatives, exact choices and unrelated remote changes',()=>{
 const b={items:[{id:'a',x:0,y:0},{id:'b',x:0}]},l={items:[{id:'a',x:1,y:0}]},r={items:[{id:'a',x:2,y:1},{id:'b',x:0},{id:'c',x:1}]};
 const first=conciliarEdicoes(b,l,r);assert.equal(first.conflitos.length,1);assert.equal(first.dados.items[0].y,1);
 const k=first.conflitos[0].chave;assert.deepEqual(conciliarEdicoes(b,l,r,{[k]:'remoto'}).dados,{items:[{id:'a',x:2,y:1},{id:'c',x:1}]});assert.equal(conciliarEdicoes(b,l,r,{[k]:'local'}).conflitos.length,0);
 assert.equal(conciliarEdicoes({x:0},{x:1},{x:1}).conflitos.length,0);
 assert.equal(conciliarEdicoes([{id:'a',x:0}],[],[{id:'a',x:1}]).conflitos.length,1);
});

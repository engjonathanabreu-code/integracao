import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read = path => fs.readFileSync(new URL(path, import.meta.url),'utf8');
const migration = read('../supabase/migrations/20260929145521_moradores_mesclagem_sem_conflito.sql');
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
test('resident merging: compatible edits, real conflicts, atomicity, RLS and retry receipts',async t=>{
 const db=new PGlite();
 try {
 await db.exec(`create schema auth;
 create role authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,ativo boolean);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
 create table integracao_moradores(colecao text,registro_id text,dados jsonb,updated_at timestamptz,criado_por uuid,primary key(colecao,registro_id));
 create table fin_receb_clientes(id uuid primary key,nome text);
 insert into profiles values('${a}',true),('${b}',true);
 insert into fin_receb_clientes values('${a}','Preservado');
 insert into integracao_moradores values('processos','resident','{"checks":{"apresentacao":true},"etapa":0}',now(),'${a}');
 grant usage on schema public,auth to authenticated;
 grant select on profiles to authenticated;
 grant select,insert,update,delete on integracao_moradores,integracao_pedidos,fin_receb_clientes to authenticated;
 alter table integracao_moradores enable row level security;
 create policy own_resident on integracao_moradores to authenticated using(criado_por=auth.uid()) with check(criado_por=auth.uid());
 alter table integracao_pedidos enable row level security;
 create policy own_receipt on integracao_pedidos to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());`);
 await db.exec(read('./fixtures/gravar-antes-leitura.sql'));
 await db.exec(read('../supabase/migrations/20260928161356_chat_leitura_sem_conflito.sql'));
 await db.exec(read('../supabase/migrations/20260928164241_notificacoes_leitura_sem_conflito.sql'));
 const login=async u=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated');};
 const send=(ops,id=crypto.randomUUID())=>db.query('select integracao_gravar($1::jsonb,$2::uuid) as result',[JSON.stringify(ops),id]);
 const op=(base,local)=>({table:'integracao_moradores',key:{colecao:'processos',registro_id:'resident'},expected:{dados:base},changes:{dados:local}});
 const base={checks:{},etapa:0}, local={checks:{apresentacao:true,contrato:true},etapa:2};
 await login(a);
 await assert.rejects(()=>send([op(base,local)]),e=>e.code==='PT409');
 await db.exec('reset role');
 await db.exec(migration);
 await login(a);
 await t.test('same change already present no longer blocks other fields; exact retry is idempotent',async()=>{
  const id=crypto.randomUUID(),ops=[op(base,local)];
  await send(ops,id);await send(ops,id);
  assert.deepEqual((await db.query('select dados from integracao_moradores')).rows[0].dados,local);
  assert.equal((await db.query('select count(*)::int as n from integracao_pedidos')).rows[0].n,1);
  await assert.rejects(()=>send([op(base,{...local,etapa:3})],id),/Pedido já utilizado/);
 });
 const merge=async(base,local,remote)=>(await db.query('select integracao_mesclar_json_seguro($1::jsonb,$2::jsonb,$3::jsonb) as value',[JSON.stringify(base),JSON.stringify(local),JSON.stringify(remote)])).rows[0].value;
 await t.test('independent nested edits, additions, deletions, nulls and arrays preserve remote data',async()=>{
  const cases=[
   [{a:0,b:0},{a:1,b:0},{a:0,b:2},{a:1,b:2}],
   [{n:{a:0,b:0}},{n:{a:1,b:0}},{n:{a:0,b:2}},{n:{a:1,b:2}}],
   [{},{checks:{a:true}},{checks:{b:true}},{checks:{a:true,b:true}}],
   [{x:1,y:1},{y:1},{x:1,y:2},{y:2}],
   [{x:1,y:1},{x:2,y:1},{x:1},{x:2}],
   [{x:1},{x:null},{x:1,y:2},{x:null,y:2}],
   [{x:null},{},{x:null,y:2},{y:2}],
   [{docs:[1],x:0},{docs:[1],x:1},{docs:[1,2],x:0},{docs:[1,2],x:1}],
   [{docs:[1]},{docs:[1,2]},{docs:[1,2]},{docs:[1,2]}],
   [{etapa:0},{etapa:2},{etapa:0,remoteOnly:true},{etapa:2,remoteOnly:true}],
  ];
  for(const [base,local,remote,expected] of cases)assert.deepEqual(await merge(base,local,remote),expected);
 });
 await t.test('incompatible same-field edits, arrays, type changes and delete/edit stay blocked',async()=>{
  const cases=[
   [{x:0},{x:1},{x:2}],
   [{n:{x:0}},{n:{x:1}},{n:{x:2}}],
   [{docs:[]},{docs:[1]},{docs:[2]}],
   [{n:{x:0}},{},{n:{x:1}}],
   [{n:{x:0}},{n:{x:1}},{}],
   [{x:0},{x:null},{x:2}],
   [{x:0},{x:{}},{x:2}],
   [{},{x:null},{x:1}],
  ];
  for(const args of cases)await assert.rejects(()=>merge(...args),e=>e.code==='PT409');
 });
 await t.test('real conflict rolls back earlier writes and creates no receipt; deletes stay strict',async()=>{
  const request=crypto.randomUUID();
  await assert.rejects(()=>send([
   {table:'fin_receb_clientes',key:{id:a},expected:{nome:'Preservado'},changes:{nome:'Must roll back'}},
   op(base,{checks:{},etapa:3}),
  ],request),e=>e.code==='PT409');
  assert.equal((await db.query('select nome from fin_receb_clientes')).rows[0].nome,'Preservado');
  assert.equal((await db.query('select count(*)::int as n from integracao_pedidos where pedido=$1',[request])).rows[0].n,0);
  await assert.rejects(()=>send([{...op(base,local),remove:true}]),e=>e.code==='PT409');
  await assert.rejects(()=>send([{table:'fin_receb_clientes',key:{id:a},expected:{nome:'Stale'},changes:{nome:'Lost update'}}]),e=>e.code==='PT409');
 });
 await t.test('RLS, anonymous/inactive protection and extra expected columns remain enforced',async()=>{
  await assert.rejects(()=>send([{...op(local,local),expected:{dados:local,criado_por:b}}]),e=>e.code==='PT409');
  await login(b);
  await assert.rejects(()=>send([op(base,local)]),/indisponível ou sem permissão/);
  await login('');
  await assert.rejects(()=>send([op(base,local)]),/Sessão inválida/);
  await db.exec('reset role');
  await db.query('update profiles set ativo=false where id=$1',[a]);
  await login(a);
  await assert.rejects(()=>send([op(base,local)]),/Sessão inválida/);
 });
 } finally {await db.close();}
});

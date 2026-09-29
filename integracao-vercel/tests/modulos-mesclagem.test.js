import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const modules={
 integracao_nucleos:'nucleos',integracao_municipios:'municipios',integracao_remessas:'remessas',
 integracao_metas:'metas',integracao_planos:'planos',integracao_ordens_servico:'ordensServico',
 integracao_calendario:'eventos',integracao_usuarios:'usuarios',
};
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
test('all affected module queues merge safely without widening permissions',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema auth;create role authenticated;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table profiles(id uuid primary key,ativo boolean);
   insert into profiles values('${owner}',true),('${other}',true);
   create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
   grant usage on schema public,auth to authenticated;
   grant select on profiles to authenticated;
   grant select,insert on integracao_pedidos to authenticated;
   alter table integracao_pedidos enable row level security;
   create policy own_receipt on integracao_pedidos to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());`);
  for(const table of [...Object.keys(modules),'integracao_configuracoes','integracao_arquivos'])await db.exec(`
   create table ${table}(colecao text,registro_id text,dados jsonb,criado_por uuid,updated_at timestamptz,primary key(colecao,registro_id));
   insert into ${table} values('${modules[table]||'config'}','record','{"base":0,"nested":{"local":0,"remote":0}}','${owner}',now());
   grant select,insert,update,delete on ${table} to authenticated;
   alter table ${table} enable row level security;
   create policy own_row on ${table} to authenticated using(criado_por=auth.uid()) with check(criado_por=auth.uid());`);
  for(const path of [
   './fixtures/gravar-antes-leitura.sql',
   '../supabase/migrations/20260928161356_chat_leitura_sem_conflito.sql',
   '../supabase/migrations/20260928164241_notificacoes_leitura_sem_conflito.sql',
   '../supabase/migrations/20260929145521_moradores_mesclagem_sem_conflito.sql',
  ])await db.exec(read(path));
  const login=async id=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const send=(ops,id=crypto.randomUUID())=>db.query('select integracao_gravar($1::jsonb,$2::uuid)',[JSON.stringify(ops),id]);
  const op=(table,base,local)=>({table,key:{colecao:modules[table]||'config',registro_id:'record'},expected:{dados:base},changes:{dados:local}});
  const initial={base:0,nested:{local:0,remote:0}},local={base:0,nested:{local:1,remote:0}},remote={base:0,nested:{local:0,remote:1}};
  const set=async(table,value)=>db.query(`update ${table} set dados=$1::jsonb where registro_id='record'`,[JSON.stringify(value)]);
  const get=async table=>(await db.query(`select dados from ${table} where registro_id='record'`)).rows[0]?.dados;
  await login(owner);
  for(const table of Object.keys(modules)){await set(table,remote);await assert.rejects(()=>send([op(table,initial,local)]),e=>e.code==='PT409');}
  await db.exec('reset role');
  await db.exec(read('../supabase/migrations/20260929162047_modulos_mesclagem_sem_conflito.sql'));
  await login(owner);
  for(const table of Object.keys(modules))await t.test(table,async()=>{
   await set(table,remote);
   const request=crypto.randomUUID(),ops=[op(table,initial,local)];
   await send(ops,request);await send(ops,request);
   assert.deepEqual(await get(table),{base:0,nested:{local:1,remote:1}});
   assert.equal((await db.query('select count(*)::int as n from integracao_pedidos where pedido=$1',[request])).rows[0].n,1);
   await set(table,local);await send([op(table,initial,local)]);
   assert.deepEqual(await get(table),local);
   await set(table,{base:0,nested:{local:2,remote:0}});
   await assert.rejects(()=>send([op(table,initial,local)]),e=>e.code==='PT409'&&e.message.includes(table));
   await assert.rejects(()=>send([{...op(table,initial,local),remove:true}]),e=>e.code==='PT409');
   await set(table,{docs:['remote']});
   await assert.rejects(()=>send([op(table,{docs:[]},{docs:['local']})]),e=>e.code==='PT409');
   await login(other);
   await assert.rejects(()=>send([op(table,initial,local)]),/indisponível ou sem permissão/);
   await login(owner);
  });
  await t.test('one real conflict rolls back the entire cross-module batch',async()=>{
   await set('integracao_nucleos',initial);await set('integracao_metas',{...initial,base:2});
   const request=crypto.randomUUID();
   await assert.rejects(()=>send([op('integracao_nucleos',initial,local),op('integracao_metas',initial,{...initial,base:1})],request),e=>e.code==='PT409');
   assert.deepEqual(await get('integracao_nucleos'),initial);
   assert.equal((await db.query('select count(*)::int as n from integracao_pedidos where pedido=$1',[request])).rows[0].n,0);
  });
  await t.test('configuration and file pointer conflict rules stay strict',async()=>{
   for(const table of ['integracao_configuracoes','integracao_arquivos']){
    await set(table,remote);await assert.rejects(()=>send([op(table,initial,local)]),e=>e.code==='PT409');
   }
  });
 } finally {await db.close();}
});

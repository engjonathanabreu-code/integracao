import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('two participants send with stale read receipts; no lost messages, duplicate retries or customer overwrite',async()=>{
 const db=new PGlite();
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
 try {
 await db.exec(`create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,ativo boolean);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
 create table integracao_chat(colecao text,registro_id text,dados jsonb,updated_at timestamptz,primary key(colecao,registro_id));
 create table fin_receb_clientes(id uuid primary key,nome text);
 create table erp_mensagens(id uuid primary key default gen_random_uuid(),autor_id uuid,texto text);
 create function erp_collab_action(op text,p jsonb) returns jsonb language plpgsql as $$declare i uuid;begin
 if op<>'mensagem' then raise exception 'Unexpected action'; end if;
 insert into public.erp_mensagens(autor_id,texto) values(auth.uid(),p->>'texto') returning id into i;return jsonb_build_object('id',i);end$$;
 insert into profiles values('${a}',true),('${b}',true);
 insert into integracao_chat values('conversas','chat','{"id":"chat","lidaPor":{}}',now());
 insert into fin_receb_clientes values('${a}','Cliente preservado');`);
 await db.exec(fs.readFileSync(new URL('./fixtures/gravar-antes-leitura.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260928161356_chat_leitura_sem_conflito.sql',import.meta.url),'utf8'));
 const login=u=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);
 const send=(ops,id=crypto.randomUUID())=>db.query('select integracao_gravar($1::jsonb,$2::uuid) as result',[JSON.stringify(ops),id]);
 const receipt=(u,time)=>({table:'integracao_chat',key:{colecao:'conversas',registro_id:'chat'},expected:{dados:{id:'chat',lidaPor:{}}},changes:{dados:{id:'chat',lidaPor:{['erp_'+u]:time}}}});
 const message=text=>({action:'mensagem',payload:{texto:text}});
 await login(a);await send([message('A'),receipt(a,'2026-09-28T16:00:00Z')]);
 await login(b);const ops=[message('B'),receipt(b,'2026-09-28T16:01:00Z')],request=crypto.randomUUID();
 await send(ops,request);await send(ops,request);
 assert.equal((await db.query('select count(*)::int as n from erp_mensagens')).rows[0].n,2);
 const read=async()=>(await db.query('select dados from integracao_chat')).rows[0].dados;
 assert.deepEqual((await read()).lidaPor,{['erp_'+a]:'2026-09-28T16:00:00Z',['erp_'+b]:'2026-09-28T16:01:00Z'});
 await send([receipt(b,'2026-09-28T15:00:00Z')]);
 assert.equal((await read()).lidaPor['erp_'+b],'2026-09-28T16:01:00Z');
 const evil=receipt(b,'2026-09-28T16:02:00Z');evil.changes.dados.lidaPor['erp_'+a]='2099-01-01T00:00:00Z';await send([evil]);
 assert.equal((await read()).lidaPor['erp_'+a],'2026-09-28T16:00:00Z');
 const edit=receipt(b,'2026-09-28T16:03:00Z');edit.changes.dados.extra='not a receipt';
 await assert.rejects(()=>send([message('must roll back'),edit]),e=>e.code==='PT409');
 await assert.rejects(()=>send([{table:'fin_receb_clientes',key:{id:a},expected:{nome:'Stale'},changes:{nome:'Overwrite'}}]),e=>e.code==='PT409');
 assert.equal((await db.query('select nome from fin_receb_clientes')).rows[0].nome,'Cliente preservado');
 assert.equal((await db.query('select count(*)::int as n from erp_mensagens')).rows[0].n,2);
 await login('');await assert.rejects(()=>send([message('anonymous')]),/Sessão inválida/);
 } finally {await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao,copy} from '../src/dados-compartilhados.js';

test('resposta citada percorre envio, recarga e projeção sem copiar o conteúdo original',()=>{
 const b=fixture();b.erp_conversas=[{id:id(20),tipo:'grupo',titulo:'Equipe',participantes:[id(1)],created_by:id(1)}];
 b.erp_mensagens=[{id:id(21),conversa_id:id(20),autor_id:id(1),texto:'Original',created_at:'2026-09-28T12:00:00Z'}];
 const s=projetar(b,blank()),n=copy(s.db);
 n.conversas[0].mensagens.push({id:id(22),autorId:n.usuarios[0].id,texto:'Resposta',data:'2026-09-28T12:01:00Z',respostaId:id(21)});
 const op=prepararEdicao(s.db,n,s,n.usuarios[0]).find(o=>o.action==='mensagem');
 assert.equal(op.payload.resposta_id,id(21));assert.equal(op.payload.texto,'Resposta');
 b.erp_mensagens.push({...op.payload,id:id(22),autor_id:id(1),created_at:'2026-09-28T12:01:00Z'});
 const recarga=projetar(b,blank()).db.conversas[0].mensagens;
 assert.equal(recarga[1].respostaId,recarga[0].id);assert.equal(recarga[0].respostaId,null);
});

test('RPC preserva citação e bloqueia mensagem de outra conversa, inexistente e usuário sem acesso',async()=>{
 const db=new PGlite();try{
  await db.exec(`create schema auth;create schema erp_collab_private;create schema storage;create table storage.objects(bucket_id text,name text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table profiles(id uuid primary key,ativo boolean);
  create table erp_conversas(id uuid primary key,participantes uuid[],entidade_id uuid,entidade_tipo text,titulo text);
  create table erp_eventos(id uuid primary key,participantes uuid[],publico boolean);
  create table erp_exclusoes_chat(id uuid primary key);
  create table erp_mensagens(id uuid primary key default gen_random_uuid(),conversa_id uuid,autor_id uuid,texto text,arquivo_path text,arquivo_nome text,evento_id uuid);
  create function erp_collab_private.active_user() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo)$$;
  create function erp_collab_private.chat_member(c uuid) returns boolean language sql as $$select exists(select 1 from public.erp_conversas where id=c and auth.uid()=any(participantes))$$;
  insert into profiles values('${id(1)}',true),('${id(2)}',true),('${id(3)}',false);
  insert into erp_conversas(id,participantes) values('${id(20)}',array['${id(1)}'::uuid]),('${id(30)}',array['${id(2)}'::uuid]);
  insert into erp_mensagens(id,conversa_id,autor_id,texto) values('${id(21)}','${id(20)}','${id(1)}','Original'),('${id(31)}','${id(30)}','${id(2)}','Privada');`);
  await db.exec(fs.readFileSync(new URL('./fixtures/chat-mutate-producao.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260928132821_chat_resposta_citada.sql',import.meta.url),'utf8'));
  const login=u=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[u?id(u):'']);
  const enviar=resposta=>db.query("select erp_collab_private.mutate('mensagem',$1::jsonb) as resultado",[JSON.stringify({conversa_id:id(20),texto:'Resposta',resposta_id:resposta})]);
  await login(1);const r=await enviar(id(21));
  assert.equal((await db.query('select resposta_id from erp_mensagens where id=$1',[r.rows[0].resultado.id])).rows[0].resposta_id,id(21));
  await enviar(null);
  await assert.rejects(()=>enviar(id(31)),/não pertence/);
  await assert.rejects(()=>enviar(id(99)),/não pertence/);
  await login(2);await assert.rejects(()=>enviar(id(21)),/Conversa indisponível/);
  await login(3);await assert.rejects(()=>enviar(id(21)),/inativo/);
  await login(null);await assert.rejects(()=>enviar(id(21)),/inativo/);
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('banco restringe quota e confirmação a Projetos, com limite atômico',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select current_setting('test.uid',true)::uuid$$;
 create table auth.users(id uuid primary key);create table profiles(id uuid,tipo text,ativo boolean);create table integracao_complementos(colecao text,registro_id text,dados jsonb);
 grant select on profiles to authenticated;grant all on integracao_complementos to authenticated;
 insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
 insert into profiles values('00000000-0000-4000-8000-000000000001','Projetos',true),('00000000-0000-4000-8000-000000000002','Comercial',true);`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20260920140000_leitor_nui.sql',import.meta.url),'utf8'));
 await db.exec("set role authenticated;set test.uid='00000000-0000-4000-8000-000000000002'");
 await assert.rejects(()=>db.exec('select integracao_reservar_leitura()'));
 await assert.rejects(()=>db.exec(`insert into integracao_complementos values('nucleos','n','{"leiturasMatriculas":[{"hash":"a"}]}')`));
 await db.exec("set test.uid='00000000-0000-4000-8000-000000000001'");
 for(let i=0;i<20;i++)await db.exec('select integracao_reservar_leitura()');await assert.rejects(()=>db.exec('select integracao_reservar_leitura()'),/20 análises/);
 await db.exec(`insert into integracao_complementos values('nucleos','n','{"leiturasMatriculas":[{"hash":"a"}]}')`);
 await db.exec("set test.uid='00000000-0000-4000-8000-000000000002'");
 await db.exec(`update integracao_complementos set dados=dados||'{"outro":"preservado"}'`);
 await assert.rejects(()=>db.exec("update integracao_complementos set dados='{}'"));
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.exec('select integracao_reservar_leitura()'));
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('diretores ativos salvam configurações; autoria, inativos e outros setores continuam protegidos',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select current_setting('test.uid',true)::uuid$$;
 create table profiles(id uuid primary key,tipo text,ativo boolean);grant select on profiles to authenticated;
 create table integracao_configuracoes(colecao text,registro_id text primary key,dados jsonb,referencia_tabela text,referencia_id uuid,criado_por uuid);
 alter table integracao_configuracoes enable row level security;grant select,insert,update,delete on integracao_configuracoes to authenticated;
 create function can_manage_core() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and ativo and tipo in ('Administrador','Comercial'))$$;
 create function integracao_acesso(text,uuid,uuid) returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and ativo) and $1='integracao_config'$$;
 create policy ler on integracao_configuracoes for select to authenticated using(integracao_acesso(referencia_tabela,referencia_id,criado_por));
 create policy criar on integracao_configuracoes for insert to authenticated with check(criado_por=auth.uid() and can_manage_core());
 create policy editar on integracao_configuracoes for update to authenticated using(can_manage_core()) with check(can_manage_core());
 create policy remover on integracao_configuracoes for delete to authenticated using(can_manage_core());
 insert into profiles values('00000000-0000-4000-8000-000000000001','Diretor de Projetos',true);
 set role authenticated;set test.uid='00000000-0000-4000-8000-000000000001';`);
 const insert="insert into integracao_configuracoes values('config','teste','{}','integracao_config',null,auth.uid())";
 await assert.rejects(()=>db.exec(insert),/row-level security/);
 await db.exec('reset role');await db.exec(readFileSync(new URL('../supabase/migrations/20260922194247_configuracoes_diretoria.sql',import.meta.url),'utf8'));
 for(const tipo of ['Administrador','Diretor Técnico','Diretor de Projetos','Comercial']){
 await db.query('update profiles set tipo=$1,ativo=true',[tipo]);await db.exec('set role authenticated');await db.exec(insert);
 assert.equal((await db.query("update integracao_configuracoes set dados='{"+'"salvo":true'+"}' where registro_id='teste' returning dados")).rows.length,1);
 assert.equal((await db.query("delete from integracao_configuracoes where registro_id='teste' returning registro_id")).rows.length,1);
 await assert.rejects(()=>db.exec("insert into integracao_configuracoes values('config','forjado','{}','integracao_config',null,'00000000-0000-4000-8000-000000000002')"),/row-level security/);
 await db.exec('reset role');
 }
 for(const [tipo,ativo] of [['Diretor de Projetos',false],['Diretor Técnico',false],['Projetos',true],['Topografia',true],['Jurídico',true],['Financeiro',true]]){
 await db.query('update profiles set tipo=$1,ativo=$2',[tipo,ativo]);
 await db.exec("insert into integracao_configuracoes values('config','existente','{}','integracao_config',null,'00000000-0000-4000-8000-000000000001');set role authenticated");
 await assert.rejects(()=>db.exec(insert),/row-level security/);
 assert.equal((await db.query("update integracao_configuracoes set dados='{}' returning registro_id")).rows.length,0);
 assert.equal((await db.query('delete from integracao_configuracoes returning registro_id')).rows.length,0);
 await db.exec("reset role;delete from integracao_configuracoes");
 }
 }finally{await db.close();}
});

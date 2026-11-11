import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('diagnóstico: RLS por conta/diretoria, identidade imutável, campos limitados e horário do servidor',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,tipo text,ativo boolean);grant select on profiles to authenticated;alter table profiles enable row level security;create policy proprio on profiles for select to authenticated using(id=auth.uid());`);
  await db.query('insert into profiles values($1,$2,true),($3,$4,true),($5,$6,false)',[id(1),'Topografia',id(2),'Administrador',id(3),'Administrador']);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261111131535_diagnostico_sincronizacao_dispositivos.sql',import.meta.url),'utf8'));
  const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
  const salvar=(u,inst=id(10),resumo=[])=>db.query('insert into integracao_sincronizacao_dispositivos(usuario_id,instalacao_id,versao,resumo,ultimo_contato) values($1,$2,$3,$4,$5)',[id(u),inst,'test-v1',JSON.stringify(resumo),'2000-01-01']);
  await login(1);await salvar(1);const row=(await db.query('select * from integracao_sincronizacao_dispositivos')).rows[0];assert.ok(new Date(row.ultimo_contato)>new Date('2026-01-01'));
  await assert.rejects(salvar(2),/row-level security/);
  await assert.rejects(db.query('update integracao_sincronizacao_dispositivos set usuario_id=$1',[id(2)]));
  await assert.rejects(db.query('delete from integracao_sincronizacao_dispositivos'),/permission denied/);
  const grupo={estado:'bloqueado_validacao',modulo:'metas',codigo:'23503',quantidade:2};
  for(const resumo of [[{...grupo,cpf:'privado'}],[{...grupo,modulo:'conteudo privado'}],[{...grupo,estado:null}],[{...grupo,quantidade:0}],[{...grupo,codigo:'senha privada'}],{},null])await assert.rejects(salvar(1,crypto.randomUUID(),resumo));
  await salvar(1,id(11),[grupo]);
  await login(2);assert.equal((await db.query('select * from integracao_sincronizacao_dispositivos')).rows.length,2);await salvar(2);
  assert.equal((await db.query('update integracao_sincronizacao_dispositivos set versao=$1 where usuario_id=$2 returning *',['outro',id(1)])).rows.length,0);
  await login(1);assert.equal((await db.query('select * from integracao_sincronizacao_dispositivos')).rows.length,2);
  await login(3);assert.equal((await db.query('select * from integracao_sincronizacao_dispositivos')).rows.length,0);await assert.rejects(salvar(3),/row-level security/);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from integracao_sincronizacao_dispositivos'),/permission denied/);
 }finally{await db.close();}
});

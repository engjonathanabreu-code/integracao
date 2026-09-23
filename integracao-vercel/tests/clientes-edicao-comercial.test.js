import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/operacoes/clientes-edicao-comercial.sql',import.meta.url),'utf8');
test('Comercial salva cliente sem cartão CRM; consulta, inativos e anon não ganham edição ou exclusão',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.profiles(id uuid primary key,tipo text,ativo boolean);
 insert into profiles values
 ('00000000-0000-4000-8000-000000000001','Comercial',true),
 ('00000000-0000-4000-8000-000000000002','Comercial',false),
 ('00000000-0000-4000-8000-000000000003','Topografia',true),
 ('00000000-0000-4000-8000-000000000004','Projetos',true),
 ('00000000-0000-4000-8000-000000000005','Jurídico',true);
 create function public.is_comercial() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.tipo='Comercial' and p.ativo=true)$$;
 create table public.fin_receb_clientes(id int primary key,nome text,valor_entrada numeric);
 insert into fin_receb_clientes values(1,'Cliente sem cartão CRM',100);
 grant select,update,delete on fin_receb_clientes to authenticated,anon;
 grant select on profiles to authenticated;
 alter table fin_receb_clientes enable row level security;
 create policy consulta on fin_receb_clientes for select to authenticated using(exists(select 1 from profiles where id=auth.uid() and ativo));
 set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`);
 assert.equal((await db.query('select * from fin_receb_clientes')).rows.length,1);
 assert.equal((await db.query('select * from fin_receb_clientes for update')).rows.length,0);
 await db.exec('reset role;');await db.exec(sql);await db.exec('set role authenticated;');
 assert.equal((await db.query('select * from fin_receb_clientes for update')).rows.length,1);
 const changed=await db.query("update fin_receb_clientes set nome='Nome atualizado',valor_entrada=500.01 where id=1 returning *");assert.equal(changed.rows[0].nome,'Nome atualizado');assert.equal(Number(changed.rows[0].valor_entrada),500.01);
 assert.equal((await db.query('delete from fin_receb_clientes where id=1 returning id')).rows.length,0);
 for(const id of [2,3,4,5]){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",['00000000-0000-4000-8000-'+String(id).padStart(12,'0')]);
  assert.equal((await db.query("update fin_receb_clientes set nome='Não autorizado' returning id")).rows.length,0);
  assert.equal((await db.query('select * from fin_receb_clientes for update')).rows.length,0);
 }
 await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false);");
 assert.equal((await db.query('select * from fin_receb_clientes')).rows.length,0);
 assert.equal((await db.query("update fin_receb_clientes set nome='Não autorizado' returning id")).rows.length,0);
 await db.exec('reset role;');assert.equal((await db.query('select nome from fin_receb_clientes')).rows[0].nome,'Nome atualizado');
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261019235636_moradores_codigo_quatro_digitos.sql',import.meta.url),'utf8');
test('migração altera somente formatação, mantém ACL, aceita reaplicação e não trunca',async()=>{
 const db=new PGlite();try {
  await db.exec(`create role anon;create role authenticated;create schema integracao_crm_privado;
    create table public.fin_receb_clientes(id uuid primary key default gen_random_uuid(),codigo text);
    create function integracao_crm_privado.converter_lead(uuid,uuid,uuid,jsonb,jsonb) returns text language plpgsql as $$
    declare proximo integer := ($4->>'numero')::integer; begin
    return 'ABC_'||lpad(proximo::text,greatest(3,length(proximo::text)),'0'); end $$;
    revoke all on function integracao_crm_privado.converter_lead(uuid,uuid,uuid,jsonb,jsonb) from public;`);
  const before=(await db.query("select proacl::text from pg_proc where proname='converter_lead'")).rows;
  await db.exec(migration);await db.exec(migration);
  for(const numero of [1,9999,10000,10001]){
    const result=await db.query('select integracao_crm_privado.converter_lead(null,null,null,$1::jsonb,null) codigo',[JSON.stringify({numero})]);
    assert.equal(result.rows[0].codigo,`ABC_${String(numero).padStart(4,'0')}`);
  }
  assert.deepEqual((await db.query("select proacl::text from pg_proc where proname='converter_lead'")).rows,before);
 }finally{await db.close();}
});

test('reserva impede requisições concorrentes, preserva duplicatas antigas e não expõe tabela privada',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema integracao_crm_privado;
    create table public.fin_receb_clientes(id uuid primary key default gen_random_uuid(),codigo text,nome text);
    create function integracao_crm_privado.converter_lead(uuid,uuid,uuid,jsonb,jsonb) returns text language plpgsql as $$
    declare proximo integer:=1;begin return lpad(proximo::text,greatest(3,length(proximo::text)),'0');end $$;
    insert into fin_receb_clientes(codigo,nome) values('ABC_001','Primeiro legado'),('ABC_001','Segundo legado'),('ABC_9999','Último legado');`);
  const antes=(await db.query('select * from fin_receb_clientes order by id')).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query('select * from fin_receb_clientes order by id')).rows,antes);
  await db.exec("update fin_receb_clientes set nome=nome||' editado' where codigo='ABC_001'");
  await assert.rejects(()=>db.exec("insert into fin_receb_clientes(codigo) values('abc_0001')"),e=>e.code==='23505');
  const disputas=await Promise.allSettled([db.query("insert into fin_receb_clientes(codigo) values('ABC_10000') returning id"),db.query("insert into fin_receb_clientes(codigo) values('ABC_10000') returning id")]);
  assert.equal(disputas.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(disputas.find(r=>r.status==='rejected').reason.code,'23505');
  assert.equal((await db.query("select count(*)::int n from fin_receb_clientes where codigo='ABC_10000'")).rows[0].n,1);
  const criado=disputas.find(r=>r.status==='fulfilled').value.rows[0].id;
  await db.query("update fin_receb_clientes set codigo='ABC_10001' where id=$1",[criado]);
  await assert.rejects(()=>db.exec("insert into fin_receb_clientes(codigo) values('ABC_10000')"),e=>e.code==='23505');
  await db.exec('grant usage on schema integracao_crm_privado to authenticated;set role authenticated');
  await assert.rejects(()=>db.query('select * from integracao_crm_privado.codigos_moradores_reservados'),e=>e.code==='42501');
 }finally{await db.close();}
});

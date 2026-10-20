import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261019235636_moradores_codigo_quatro_digitos.sql',import.meta.url),'utf8');
test('migração altera somente formatação, mantém ACL, aceita reaplicação e não trunca',async()=>{
 const db=new PGlite();try {
  await db.exec(`create schema integracao_crm_privado;
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

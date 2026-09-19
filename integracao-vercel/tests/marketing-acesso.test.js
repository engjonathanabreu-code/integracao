import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepararBanco} from './crm-schema.test.js';
import {acessoCRM} from '../src/crm-regras.js';
test('Marketing na interface permite somente Marketing, Pós-Protocolo e administradores ativos',()=>{
 for(const tipoERP of ['Marketing','Pós-protocolo','Administrador','Diretor Técnico','Diretor de Projetos']){assert.equal(acessoCRM({tipoERP,ativo:true}).marketing,true);assert.equal(acessoCRM({tipoERP,ativo:false}).marketing,false);}
 for(const tipoERP of ['Comercial','Topografia','Projetos','Financeiro','Jurídico'])assert.equal(acessoCRM({tipoERP,ativo:true}).marketing,false);
});
test('Pós-Protocolo pode operar Marketing no banco; Comercial e Topografia permanecem bloqueados',async()=>{
 const db=await prepararBanco();try{
  await db.exec(readFileSync(new URL('../supabase/migrations/20260919184532_marketing_pos_protocolo.sql',import.meta.url),'utf8'));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';insert into integracao_marketing_rotina(ano,mes,semana,titulo) values(2026,9,1,'Pós-Protocolo');`);
  assert.equal((await db.query('select count(*) n from integracao_marketing_rotina')).rows[0].n,1);
  for(const id of ['2','6']){await db.exec(`set request.jwt.claim.sub='00000000-0000-4000-8000-${id.padStart(12,'0')}';`);assert.equal((await db.query('select count(*) n from integracao_marketing_rotina')).rows[0].n,0);await assert.rejects(()=>db.exec("insert into integracao_marketing_rotina(ano,mes,semana,titulo) values(2026,9,1,'Não permitido')"));}
 }finally{await db.close();}
});

import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepararBanco} from './crm-schema.test.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=f=>readFileSync(new URL('../supabase/'+f,import.meta.url),'utf8');
test('migração da entrada preserva registros legados, valida reais e mantém vínculo/conversão',async()=>{const db=await prepararBanco();try{
 await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;alter table integracao_moradores add primary key(colecao,registro_id);`);
 for(const f of ['crm-leads.sql','crm-lead-responsavel.sql','crm-carregamento.sql'])await db.exec(sql('operacoes/'+f));
 for(const f of ['20260922162925_crm_multiplos_comerciais.sql','20260919182005_chatwoot_ia_conexao.sql','20260923122108_crm_followup_dashboard.sql','20260923160000_crm_arquivo_leads.sql','20260924120000_crm_editar_card.sql'])await db.exec(sql('migrations/'+f));
 await db.exec(`insert into integracao_crm_cards(id,lead_nome,lead_municipio_id,responsavel_id,valor_total,forma_negociacao,parcelas,entrada_percentual) values('${id(80)}','Lead antigo','${id(30)}','${id(2)}',9000,'entrada_parcelas',6,30);`);
 const before=(await db.query('select to_jsonb(c) as r from integracao_crm_cards c')).rows;
 await db.exec(sql('migrations/20261008120000_crm_entrada_valor.sql'));
 assert.deepEqual((await db.query("select to_jsonb(c)-'entrada_valor' as r from integracao_crm_cards c")).rows,before);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(2)}';update integracao_crm_cards set valor_total=1234.56,entrada_percentual=null,entrada_valor=123.45 where id='${id(80)}';reset role;`);
 assert.equal((await db.query(`select entrada_valor::text from integracao_crm_funil where id='${id(80)}'`)).rows[0].entrada_valor,'123.45');
 await assert.rejects(()=>db.exec(`update integracao_crm_cards set entrada_valor=1234.56 where id='${id(80)}'`),/crm_negociacao_valida/);
 await assert.rejects(()=>db.exec(`update integracao_crm_cards set entrada_valor=-1 where id='${id(80)}'`),/crm_negociacao_valida/);
 await db.exec(`insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(31)}','Remessa','${id(30)}','TAI01');set role authenticated;set request.jwt.claim.sub='${id(2)}';`);
 const c=(await db.query(`select to_jsonb(c) as r from integracao_crm_cards c where id='${id(80)}'`)).rows[0].r;
 const fields=['status','valor_total','forma_negociacao','parcelas','desconto_percentual','entrada_percentual','entrada_valor'],prev=Object.fromEntries(fields.map(k=>[k,c[k]])),next={...prev,status:'Contrato'};
 await db.query('select integracao_crm_converter_lead($1,$2,$3,$4::jsonb,$5::jsonb)',[id(80),id(30),id(31),JSON.stringify(next),JSON.stringify(prev)]);
 await db.exec('reset role');assert.equal((await db.query(`select entrada_valor::text from integracao_crm_cards where id='${id(80)}'`)).rows[0].entrada_valor,'123.45');
 // An older client still writes its percentage without keeping a stale currency amount.
 await db.exec(`update integracao_crm_cards set entrada_percentual=20 where id='${id(80)}'`);assert.equal((await db.query(`select entrada_valor from integracao_crm_cards where id='${id(80)}'`)).rows[0].entrada_valor,null);
 }finally{await db.close();}});

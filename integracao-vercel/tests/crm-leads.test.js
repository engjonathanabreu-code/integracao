import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepararBanco} from './crm-schema.test.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function como(db,n,query){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return (await db.query(query)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
const sql=p=>readFileSync(new URL('../supabase/operacoes/'+p,import.meta.url),'utf8');
test('lead obrigatório, conversão atômica, remessa, identidade e permissões',async()=>{const db=await prepararBanco();try{
 await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;alter table integracao_moradores add primary key(colecao,registro_id);insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(31)}','Primeira','${id(30)}','TAI01'),('${id(32)}','Outro município','${id(99)}','ZZ01');`);
 await db.exec(sql('crm-leads.sql'));await db.exec(sql('comercial-estrutura.sql'));
 const lead=(nome='Lead Teste',tel='48999990000',municipio=id(30),pedido=id(70))=>`select integracao_crm_cadastrar_lead('${pedido}','${nome}','${tel}','${municipio}') id`;
 await assert.rejects(()=>como(db,2,lead('','')));await assert.rejects(()=>como(db,6,lead()));
 assert.equal((await como(db,2,lead()))[0].id,id(70));assert.equal((await como(db,2,lead()))[0].id,id(70));
 assert.equal((await como(db,2,`select status from integracao_crm_cards where id='${id(70)}'`))[0].status,'Cliente novo');
 assert.equal((await como(db,3,`select id from integracao_crm_cards where id='${id(70)}'`)).length,0);
 await assert.rejects(()=>como(db,2,lead('Lead Teste','48999990000',id(30),id(71))));
 await assert.rejects(()=>como(db,2,`update integracao_crm_cards set status='Contrato' where id='${id(70)}'`));
 const prev={status:'Cliente novo',valor_total:null,forma_negociacao:null,parcelas:null,desconto_percentual:null,entrada_percentual:null};const next={...prev,status:'Contrato',valor_total:1000,forma_negociacao:'parcelado',parcelas:10};
 const converter=(remessa=id(31),data=next,anterior=prev)=>`select integracao_crm_converter_lead('${id(70)}','${id(30)}','${remessa}','${JSON.stringify(data)}','${JSON.stringify(anterior)}') id`;
 await assert.rejects(()=>como(db,3,converter()));await assert.rejects(()=>como(db,2,converter(id(32))));await assert.rejects(()=>como(db,2,converter(id(31),{...next,parcelas:0})));
 assert.equal((await db.query('select count(*) n from fin_receb_clientes')).rows[0].n,1);
 const cliente=(await como(db,2,converter()))[0].id;assert.equal((await como(db,2,converter()))[0].id,cliente);
 const card=(await como(db,2,`select * from integracao_crm_cards where id='${id(70)}'`))[0];assert.equal(card.cliente_id,cliente);assert.equal(card.status,'Contrato');assert.equal(card.parcelas,10);
 assert.equal((await db.query('select count(*) n from integracao_crm_cards')).rows[0].n,1);
 assert.equal((await db.query(`select dados->'requerente'->>'telefone' tel from integracao_moradores where referencia_id='${cliente}'`)).rows[0].tel,'48999990000');
 await como(db,2,`insert into fin_receb_municipios(id,nome,uf) values('${id(80)}','Municipio Comercial','SC')`);await como(db,2,`update fin_receb_municipios set nome='Municipio Atualizado' where id='${id(80)}'`);
 await como(db,2,`insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(81)}','Remessa Comercial','${id(80)}','COM01')`);
 await assert.rejects(()=>como(db,6,`insert into fin_receb_municipios(id,nome,uf) values('${id(82)}','Negado','SC')`));
 await db.exec(`update profiles set ativo=false where id='${id(2)}'`);await assert.rejects(()=>como(db,2,lead('Inativo','48999990001',id(30),id(72))));
}finally{await db.close();}});

import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepararBanco} from './crm-schema.test.js';
import {intervaloPeriodo,periodoAtual,resumirAtivacoes,csvAtivacoes,opcoesPeriodo} from '../src/crm-ativacoes.js';
import {ETAPAS_FUNIL,ETAPAS_CRM} from '../src/crm-regras.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const read=p=>readFileSync(new URL('../supabase/'+p,import.meta.url),'utf8');
async function como(db,n,sql,args=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
const hoje=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
async function preparar(){const db=await prepararBanco();await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;alter table integracao_moradores add primary key(colecao,registro_id);
 insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(31)}','Primeira','${id(30)}','TAI01');`);
 for(const f of ['crm-leads.sql','crm-lead-responsavel.sql','crm-carregamento.sql'])await db.exec(read('operacoes/'+f));
 for(const f of ['20260922162925_crm_multiplos_comerciais.sql','20260919182005_chatwoot_ia_conexao.sql','20260923122108_crm_followup_dashboard.sql','20260923160000_crm_arquivo_leads.sql','20260924120000_crm_editar_card.sql'])await db.exec(read('migrations/'+f));
 await db.exec(`update fin_receb_clientes set municipio_id='${id(30)}',remessa_id='${id(31)}' where id='${id(20)}';
  insert into fin_receb_clientes(id,nome,municipio_id) values('${id(21)}','Antigo com histórico','${id(30)}'),('${id(22)}','Antigo sem histórico','${id(30)}'),('${id(23)}','Desativado','${id(30)}');
  insert into integracao_crm_cards(id,cliente_id,responsavel_id,status) values('${id(82)}','${id(20)}','${id(2)}','Negociação'),('${id(83)}','${id(21)}','${id(3)}','Contrato'),('${id(85)}','${id(23)}','${id(3)}','Contrato');
  update integracao_crm_cards set status='Cliente ativo',valor_total=5000,forma_negociacao='avista',desconto_percentual=0 where id='${id(83)}';
  update integracao_crm_cards set status='Cliente ativo' where id='${id(85)}';update integracao_crm_cards set status='Contrato' where id='${id(85)}';
  set session_replication_role=replica;insert into integracao_crm_cards(id,cliente_id,responsavel_id,status,updated_at) values('${id(84)}','${id(22)}','${id(2)}','Cliente ativo','2026-03-10T15:00:00Z');set session_replication_role=origin;`);
 await db.exec(read('migrations/20260924150000_crm_ativacoes.sql'));return db;}
const relatorio=(db,n,inicio,fim)=>como(db,n,'select * from integracao_crm_relatorio_ativacoes($1,$2) order by nome',[inicio,fim]);

test('períodos mensal, trimestral, semestral e anual cobrem o intervalo completo',()=>{
 assert.deepEqual(intervaloPeriodo('mensal',2026,2),{inicio:'2026-02-01',fim:'2026-02-28',rotulo:'Fevereiro de 2026'});
 assert.deepEqual(intervaloPeriodo('trimestral',2026,3),{inicio:'2026-07-01',fim:'2026-09-30',rotulo:'3º trimestre de 2026'});
 assert.deepEqual(intervaloPeriodo('semestral',2024,1),{inicio:'2024-01-01',fim:'2024-06-30',rotulo:'1º semestre de 2024'});
 assert.deepEqual(intervaloPeriodo('anual',2026),{inicio:'2026-01-01',fim:'2026-12-31',rotulo:'2026'});
 assert.equal(intervaloPeriodo('mensal',2028,2).fim,'2028-02-29');assert.throws(()=>intervaloPeriodo('trimestral',2026,5));assert.throws(()=>intervaloPeriodo('quinzenal',2026,1));
 assert.deepEqual(periodoAtual('trimestral','2026-09-24'),{ano:2026,numero:3});assert.deepEqual(periodoAtual('semestral','2026-07-01'),{ano:2026,numero:2});assert.equal(opcoesPeriodo('mensal').length,12);
 assert.deepEqual(ETAPAS_FUNIL,['Cliente novo','Negociação','Contrato']);assert.ok(ETAPAS_CRM.includes('Cliente ativo'));
});
test('resumo por comercial soma valores sem perder centavos e exporta planilha segura',()=>{
 const r=resumirAtivacoes([{responsavel_id:'a',valor:'0.10'},{responsavel_id:'a',valor:'0.20'},{responsavel_id:'b',valor:null},{responsavel_id:'b',valor:1000}]);
 assert.equal(r.quantidade,4);assert.equal(r.valor,1000.3);assert.equal(r.semValor,1);assert.deepEqual(r.linhas.map(l=>[l.responsavel_id,l.quantidade,l.valor,l.semValor]),[['b',2,1000,1],['a',2,0.3,0]]);
 const csv=csvAtivacoes([{ativado_em:'2026-09-24T12:00:00Z',nome:'=HACK()',cidade:'São José / SC',valor:1234.5,responsavel_id:'a',comerciais_adicionais:['b'],origem:'estimado'}],id=>({a:'Ana',b:'Bia'})[id]);
 assert.ok(csv.startsWith('﻿'));assert.ok(csv.includes('"\'=HACK()"'));assert.ok(csv.includes('"1234,50"'));assert.ok(csv.includes('"Ana";"Bia"'));assert.ok(csv.includes('Data estimada'));
});
test('ativação fica registrada com nome, cidade, valor e comercial, some do cálculo quando desfeita e respeita permissões',async()=>{const db=await preparar();try{
 // Histórico anterior à migração.
 const antigos=(await db.query('select * from integracao_crm_ativacoes order by card_id')).rows;assert.equal(antigos.length,3);
 const [h,e,d]=antigos;assert.equal(h.origem,'historico');assert.equal(h.nome,'Antigo com histórico');assert.equal(Number(h.valor),5000);assert.equal(h.responsavel_id,id(3));assert.equal(h.cidade,'Taió / SC');
 assert.equal(e.origem,'estimado');assert.equal(new Date(e.ativado_em).toISOString(),'2026-03-10T15:00:00.000Z');assert.ok(d.desfeito_em);
 assert.equal((await relatorio(db,1,'2026-03-01','2026-03-31')).length,1);
 // Nova ativação feita pela comercial, com valor da negociação.
 await como(db,2,`update integracao_crm_cards set status='Cliente ativo',valor_total=12345.67,forma_negociacao='parcelado',parcelas=10 where id='${id(82)}'`);
 let r=await relatorio(db,1,hoje(),hoje());assert.deepEqual(r.map(x=>[x.nome,x.cidade,Number(x.valor),x.responsavel_id]),[['Antigo com histórico','Taió / SC',5000,id(3)],['Cadastro preservado','Taió / SC',12345.67,id(2)]]);
 assert.equal((await db.query(`select ativado_por from integracao_crm_ativacoes where card_id='${id(82)}'`)).rows[0].ativado_por,id(2));
 assert.deepEqual((await relatorio(db,2,hoje(),hoje())).map(x=>x.nome),['Cadastro preservado']);assert.deepEqual((await relatorio(db,3,hoje(),hoje())).map(x=>x.nome),['Antigo com histórico']);
 await assert.rejects(()=>relatorio(db,6,hoje(),hoje()),/Sem permissão/);await assert.rejects(()=>relatorio(db,1,'2025-01-01','2026-06-30'),/366/);
 await assert.rejects(()=>como(db,1,`update integracao_crm_ativacoes set valor=1`),/permission denied/);await assert.rejects(()=>como(db,1,`delete from integracao_crm_ativacoes`),/permission denied/);
 // O nome atual do cadastro prevalece; o registro guarda o nome da ativação.
 await db.exec(`update fin_receb_clientes set nome='Cadastro renomeado' where id='${id(20)}'`);assert.ok((await relatorio(db,1,hoje(),hoje())).some(x=>x.nome==='Cadastro renomeado'));
 // Ativação desfeita deixa de contar; reativação volta a contar uma única vez.
 await como(db,2,`update integracao_crm_cards set status='Contrato' where id='${id(82)}'`);assert.equal((await relatorio(db,1,hoje(),hoje())).length,1);
 await como(db,2,`update integracao_crm_cards set status='Cliente ativo' where id='${id(82)}'`);r=await relatorio(db,1,hoje(),hoje());assert.equal(r.length,2);
 await como(db,2,`update integracao_crm_cards set valor_total=20000 where id='${id(82)}'`);assert.equal(Number((await db.query(`select valor from integracao_crm_ativacoes where card_id='${id(82)}'`)).rows[0].valor),20000);
 assert.equal((await db.query('select count(*) n from integracao_crm_ativacoes')).rows[0].n,4);
 // Lead convertido diretamente em Cliente ativo também é registrado.
 await db.exec(`insert into integracao_crm_cards(id,lead_nome,lead_municipio_id,responsavel_id,lead_cpf) values('${id(86)}','Lead direto','${id(30)}','${id(3)}','529.982.247-25')`);
 const prev={status:'Cliente novo',valor_total:null,forma_negociacao:null,parcelas:null,desconto_percentual:null,entrada_percentual:null};
 await como(db,3,'select integracao_crm_converter_lead($1,$2,$3,$4,$5)',[id(86),id(30),id(31),JSON.stringify({...prev,status:'Cliente ativo',valor_total:800,forma_negociacao:'avista',desconto_percentual:0}),JSON.stringify(prev)]);
 const direto=(await relatorio(db,3,hoje(),hoje())).find(x=>x.card_id===id(86));assert.equal(direto.nome,'Lead direto');assert.equal(Number(direto.valor),800);assert.equal(direto.cidade,'Taió / SC');
 }finally{await db.close();}});

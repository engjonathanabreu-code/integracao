import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepararBanco} from './crm-schema.test.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function como(db,n,sql,args=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
test('institucionais: dados separados, permissões, perda, concorrência e FollowUp com histórico',async()=>{const db=await prepararBanco();try{
 await db.exec(readFileSync(new URL('../supabase/migrations/20260923140000_crm_institucionais.sql',import.meta.url),'utf8'));
 const salvar=(n,versao=0,status='Em negociação',motivo='',owner=2)=>como(db,n,'select integracao_crm_salvar_institucional($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id(90),versao,'Prefeitura de Teste','Maria — telefone 47999999999','Levantamento topográfico',12500,id(owner),status,motivo,2]);
 await assert.rejects(()=>salvar(4),/Sem permissão/);await assert.rejects(()=>salvar(2,0,'Em negociação','',3),/diretoria/);
 await salvar(2);
 assert.equal((await como(db,2,'select * from integracao_crm_institucionais')).length,1);assert.equal((await como(db,3,'select * from integracao_crm_institucionais')).length,0);assert.equal((await como(db,1,'select * from integracao_crm_institucionais')).length,1);
 assert.equal((await db.query('select count(*) n from fin_receb_clientes')).rows[0].n,1);assert.equal((await db.query('select count(*) n from integracao_crm_cards')).rows[0].n,0);
 let f=(await como(db,2,'select * from integracao_crm_institucionais_followups'))[0];assert.equal(f.prazo_dias,2);
 const follow=(n,anterior,dias,resumo,pedido=91)=>como(db,n,'select integracao_crm_institucional_followup($1,$2,$3,$4,$5) id',[id(90),id(pedido),anterior,dias,resumo]);
 await assert.rejects(()=>follow(3,f.id,1,'Sem acesso'),/Sem permissão/);
 await assert.rejects(()=>follow(2,f.id,3,'Prazo inválido'),/Selecione um prazo/);
 await assert.rejects(()=>follow(2,f.id,4,'  '),/breve resumo/);
 const next=(await follow(2,f.id,4,'Prefeitura solicitou uma proposta.'))[0].id;assert.equal((await follow(2,f.id,4,'Prefeitura solicitou uma proposta.'))[0].id,next);
 await assert.rejects(()=>follow(2,f.id,1,'Ficha desatualizada',92),/FollowUp mudou/);
 await assert.rejects(()=>salvar(3,1,'Perdido','Sem orçamento'),/sem permissão/);
 await assert.rejects(()=>salvar(2,1,'Perdido',''),/motivo da perda/);await salvar(2,1,'Perdido','Prefeitura sem orçamento disponível.');
 assert.equal((await como(db,2,"select * from integracao_crm_institucionais_followups where status='pendente'")).length,0);
 assert.equal((await como(db,2,"select * from integracao_crm_institucionais_followups where status='feito'"))[0].resumo,'Prefeitura solicitou uma proposta.');
 await assert.rejects(()=>follow(2,null,1,'',93),/indisponível/);
 await assert.rejects(()=>salvar(2,1),/foi alterado/);await salvar(1,2,'Ganho','Prefeitura sem orçamento disponível.',3);
 assert.equal((await como(db,2,'select * from integracao_crm_institucionais_followups')).length,0);assert.equal((await como(db,3,'select * from integracao_crm_institucionais_followups')).length,2);
 await assert.rejects(()=>como(db,3,"update integracao_crm_institucionais set valor=0"),/permission denied/);
 await assert.rejects(()=>como(db,3,'delete from integracao_crm_institucionais_followups'),/permission denied/);
 assert.equal((await db.query("select count(*) n from integracao_crm_auditoria where tabela='integracao_crm_institucionais' and atual->>'status'='Perdido'")).rows[0].n,1);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from integracao_crm_institucionais'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}});

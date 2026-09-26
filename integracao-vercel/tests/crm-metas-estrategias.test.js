import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {progressoVenda,periodoVenda} from '../src/crm-metas.js';
import {diretrizAgente} from '../src/agentes-ia.js';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=readFileSync(new URL('../supabase/migrations/20260926201425_crm_metas_estrategias.sql',import.meta.url),'utf8');
async function banco(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema erp_collab_private;create schema integracao_crm_privado;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.profiles(id uuid primary key,nome text,tipo text,ativo boolean);
create function erp_collab_private.integracao_diretoria() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;
create table public.integracao_crm_cards(id uuid primary key,status text);
create table public.integracao_crm_auditoria(id bigint,registro_id uuid,tabela text,anterior jsonb,atual jsonb,created_at timestamptz);
create table public.integracao_crm_ativacoes(card_id uuid primary key,responsavel_id uuid,valor numeric,ativado_em timestamptz,desfeito_em timestamptz);
grant usage on schema auth,erp_collab_private to authenticated;grant select on public.profiles to authenticated;
insert into profiles values('${uid(1)}','Diretor','Administrador',true),('${uid(2)}','Ana','Comercial',true),('${uid(3)}','Bia','Comercial',true),('${uid(4)}','Inativo','Comercial',false);`);await db.exec(sql);return db;}
async function como(db,id,query){await db.exec(`select set_config('request.jwt.claim.sub','${uid(id)}',false);set role authenticated;`);try{return await db.query(query);}finally{await db.exec('reset role');}}
const meta=(id=10,parts=[2],scope='usuario')=>`insert into public.integracao_crm_metas(id,titulo,escopo,setor,participantes,unidade,alvo,inicio,fim) values('${uid(id)}','Meta de vendas','${scope}','comercial',array[${parts.map(n=>`'${uid(n)}'::uuid`).join(',')}],'quantidade',2,current_date-2,current_date+2)`;
test('metas: RLS, participantes, progresso, reversões e intervalo',async()=>{const db=await banco();try{
 await como(db,1,meta());await como(db,1,meta(11,[2,3],'setor'));
 await assert.rejects(como(db,2,meta(12)),/Diretoria|row-level/);
 await assert.rejects(como(db,1,meta(12,[4])),/ativos/);
 assert.equal((await como(db,3,'select * from integracao_crm_metas')).rows.length,1);
 assert.equal((await como(db,4,'select * from integracao_crm_metas')).rows.length,0);
 assert.equal((await como(db,2,`update integracao_crm_metas set alvo=1 returning *`)).rows.length,0);
 await db.exec(`insert into integracao_crm_ativacoes values('${uid(20)}','${uid(2)}',100,now()-interval '1 day',null,'Contrato'),('${uid(21)}','${uid(2)}',200,now()-interval '10 days',null,'Contrato'),('${uid(22)}','${uid(3)}',300,now()-interval '1 day',null,'Contato'),('${uid(23)}','${uid(3)}',400,now()-interval '1 day',null,'Contrato');`);
 let painel=(await como(db,1,'select integracao_crm_metas_painel() as p')).rows[0].p;
 assert.equal(painel.find(m=>m.id===uid(10)).realizado,1);assert.equal(painel.find(m=>m.id===uid(11)).realizado,2);
 let vendedor=(await como(db,2,'select integracao_crm_metas_painel() as p')).rows[0].p;assert.deepEqual(vendedor[0].por_usuario,[]);
 await db.exec(`update integracao_crm_ativacoes set desfeito_em=now() where card_id='${uid(20)}'`);
 painel=(await como(db,1,'select integracao_crm_metas_painel() as p')).rows[0].p;assert.equal(painel.find(m=>m.id===uid(10)).realizado,0);
 await assert.rejects(como(db,4,'select integracao_crm_metas_painel()'),/conta ativa/);
 await db.exec(`update profiles set ativo=false where id='${uid(2)}'`);
 await como(db,1,`update integracao_crm_metas set status='cancelada' where id='${uid(10)}'`);
 assert.equal((await como(db,1,`select versao from integracao_crm_metas where id='${uid(10)}'`)).rows[0].versao,2);
}finally{await db.close();}});
test('valor soma vendas comprovadas nos limites do período em São Paulo',async()=>{const db=await banco();try{
 await como(db,1,meta());
 await como(db,1,`update integracao_crm_metas set unidade='valor',alvo=1000,inicio='2026-01-01',fim='2026-01-31'`);
 await db.exec(`insert into integracao_crm_ativacoes values
 ('${uid(30)}','${uid(2)}',100,'2026-01-01 02:59:59+00',null,'Contrato'),
 ('${uid(31)}','${uid(2)}',200,'2026-01-01 03:00:00+00',null,'Contrato'),
 ('${uid(32)}','${uid(2)}',300,'2026-02-01 02:59:59+00',null,'Contrato'),
 ('${uid(33)}','${uid(2)}',400,'2026-02-01 03:00:00+00',null,'Contrato'),
 ('${uid(34)}','${uid(2)}',null,'2026-01-15 12:00:00+00',null,'Contrato'),
 ('${uid(35)}','${uid(2)}',800,'2026-01-15 12:00:00+00',null,null);`);
 const painel=(await como(db,1,'select integracao_crm_metas_painel() as p')).rows[0].p;
 assert.equal(painel[0].realizado,500);assert.equal(painel[0].sem_valor,1);
 assert.equal(painel[0].por_usuario[0].realizado,500);
}finally{await db.close();}});
test('estratégias: somente Diretoria grava e lê; desativar remove da próxima consulta',async()=>{const db=await banco();try{
 await como(db,1,`insert into integracao_agente_estrategias(agente,prompt) values('tecnico','Prefeituras paradas há dois meses')`);
 assert.equal((await como(db,2,'select * from integracao_agente_estrategias')).rows.length,0);
 await assert.rejects(como(db,2,`insert into integracao_agente_estrategias(agente,prompt) values('comercial','x')`));
 let r=(await como(db,1,'select integracao_agente_estrategias_ler() as p')).rows[0].p;assert.match(r.tecnico,/Prefeituras/);
 await como(db,1,`update integracao_agente_estrategias set ativa=false where agente='tecnico'`);
 r=(await como(db,1,'select integracao_agente_estrategias_ler() as p')).rows[0].p;assert.deepEqual(r,{});
 await assert.rejects(como(db,2,'select integracao_agente_estrategias_ler()'),/diretoria/);
}finally{await db.close();}});
test('origem da venda registra somente a passagem mais recente',async()=>{const db=await banco();try{
 await db.exec(`insert into integracao_crm_cards values('${uid(20)}','Contrato');insert into integracao_crm_ativacoes(card_id,responsavel_id,valor,ativado_em) values('${uid(20)}','${uid(2)}',100,now());update integracao_crm_cards set status='Cliente ativo' where id='${uid(20)}';`);
 assert.equal((await db.query('select etapa_anterior from integracao_crm_ativacoes')).rows[0].etapa_anterior,'Contrato');
 await db.exec(`update integracao_crm_cards set status='Contato';update integracao_crm_cards set status='Cliente ativo';`);
 assert.equal((await db.query('select etapa_anterior from integracao_crm_ativacoes')).rows[0].etapa_anterior,'Contato');
}finally{await db.close();}});
test('medidor distingue futuro, vencimento, atraso, atingida e cancelada',()=>{
 const m={alvo:10,realizado:4,status:'ativa',inicio:'2026-09-01',fim:'2026-09-30'};
 assert.equal(progressoVenda(m,'2026-09-30').situacao,'Vence hoje');assert.equal(progressoVenda(m,'2026-10-01').alerta,true);
 assert.equal(progressoVenda({...m,realizado:11},'2026-10-01').situacao,'Meta atingida');
 assert.equal(progressoVenda(m,'2026-08-31').situacao,'Ainda não iniciou');
 assert.equal(progressoVenda({...m,status:'cancelada'},'2026-10-01').alerta,false);
 assert.equal(periodoVenda('mensal','2028-02-01'),'2028-02-29');assert.equal(periodoVenda('semanal','2026-09-26'),'2026-10-02');
 assert.match(diretrizAgente({tecnico:'Prefeituras 60 dias'},'tecnico'),/Prefeituras 60 dias/);assert.equal(diretrizAgente({},'comercial'),'');
});

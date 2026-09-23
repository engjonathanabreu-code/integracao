import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {prepararBanco} from './crm-schema.test.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const read=p=>readFileSync(new URL('../supabase/'+p,import.meta.url),'utf8');
async function preparar(){const db=await prepararBanco();await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;alter table integracao_moradores add primary key(colecao,registro_id);insert into profiles values('${id(7)}','Inativo','Comercial',false);`);for(const f of ['crm-leads.sql','crm-lead-responsavel.sql','crm-carregamento.sql'])await db.exec(read('operacoes/'+f));await db.exec(read('migrations/20260922162925_crm_multiplos_comerciais.sql'));await db.exec(read('migrations/20260919182005_chatwoot_ia_conexao.sql'));await db.exec(read('migrations/20260923122108_crm_followup_dashboard.sql'));await db.exec(`insert into integracao_crm_cards(id,lead_nome,responsavel_id,comerciais_adicionais) values('${id(80)}','Lead Ana','${id(2)}',array['${id(3)}']::uuid[]),('${id(81)}','Lead Bia','${id(3)}','{}');`);return db;}
async function como(db,n,sql,args=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
const operar=(db,n,card,pedido,anterior,dias,resumo='')=>como(db,n,'select integracao_crm_followup($1,$2,$3,$4,$5) id',[id(card),id(pedido),anterior,dias,resumo]);
test('followup atômico: resumo, prazo, autoria, repetição e conflito entre comerciais',async()=>{const db=await preparar();try{
 for(const n of [4,7])await assert.rejects(()=>operar(db,n,80,90,null,1),/Sem permissão/);
 await assert.rejects(()=>operar(db,2,81,90,null,1),/Sem permissão/);
 for(const d of [0,3,5,null])await assert.rejects(()=>operar(db,2,80,90,null,d),/Selecione um prazo/);
 const first=(await operar(db,2,80,90,null,1))[0].id;
 assert.equal((await operar(db,2,80,90,null,1))[0].id,first);
 await assert.rejects(()=>operar(db,3,80,91,null,2),/FollowUp mudou/);
 for(const txt of ['',null,'  oi ', 'x'.repeat(2001)])await assert.rejects(()=>operar(db,3,80,91,first,2,txt),/breve resumo/);
 assert.equal((await db.query('select count(*) n from integracao_crm_followups')).rows[0].n,1);
 const second=(await operar(db,3,80,91,first,4,'Cliente confirmou interesse; enviar proposta.'))[0].id;
 assert.equal((await operar(db,3,80,91,first,4,'Cliente confirmou interesse; enviar proposta.'))[0].id,second);
 await assert.rejects(()=>operar(db,2,80,92,first,2,'Tentativa em ficha antiga.'),/FollowUp mudou/);
 const rows=(await db.query('select * from integracao_crm_followups order by criado_em')).rows;
 assert.equal(rows.length,2);assert.equal(rows[0].concluido_por,id(3));assert.equal(rows[0].status,'feito');assert.equal(rows[1].status,'pendente');assert.equal(new Date(rows[1].previsto_em)-new Date(rows[1].criado_em),4*86400000);
 await assert.rejects(()=>como(db,2,"update integracao_crm_followups set resumo='Alterado'"),/permission denied/);
 await assert.rejects(()=>como(db,2,"delete from integracao_crm_followups"),/permission denied/);
 await como(db,1,'select integracao_crm_transferir($1,$2)',[id(80),id(3)]);
 assert.equal((await como(db,2,'select * from integracao_crm_followups')).length,0);assert.equal((await como(db,3,'select * from integracao_crm_followups')).length,2);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select integracao_crm_followup($1,$2,null,1,\'\')',[id(80),id(94)]),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}});
test('dashboard: autorização, conversões sem duplicar etapas, tempo real e autoria Chatwoot',async()=>{const db=await preparar();try{
 await assert.rejects(()=>como(db,2,"select integracao_crm_dashboard('2020-01-01','2030-01-01')"),/Diretoria/);
 await assert.rejects(()=>como(db,1,"select integracao_crm_dashboard('2020-01-01','2030-01-01')"),/período/);
 await db.exec(`insert into integracao_crm_agentes(instalacao,conta_id,agente_id,usuario_id) values('chat.test',1,10,'${id(2)}');`);
 await db.exec(`update integracao_crm_cards set cliente_id='${id(20)}' where id='${id(80)}';`);
 const evento={instalacao:'chat.test',conta_id:1,conversa_id:10,contato_id:11,nome:'Contato',agente_id:10,data:new Date().toISOString()};
 for(const m of [{mensagem_id:1,direcao:'outgoing',autor_tipo:'user',autor_chatwoot_id:10},{mensagem_id:2,direcao:'1',autor_tipo:'user',autor_chatwoot_id:10},{mensagem_id:3,direcao:'outgoing',autor_tipo:'agent_bot',autor_chatwoot_id:10},{mensagem_id:4,direcao:'outgoing',autor_tipo:'user',autor_chatwoot_id:10,privada:true},{mensagem_id:5,direcao:'incoming',autor_tipo:'contact',autor_chatwoot_id:10},{mensagem_id:6,direcao:'outgoing'}]){await db.query('select integracao_crm_receber($1)',[{...evento,...m}]);await db.query('select integracao_crm_receber($1)',[{...evento,...m}]);}
 await como(db,2,"update integracao_crm_cards set status='Negociação' where id=$1",[id(80)]);await como(db,2,"update integracao_crm_cards set status='Contrato' where id=$1",[id(80)]);await como(db,2,"update integracao_crm_cards set status='Cliente ativo' where id=$1",[id(80)]);await como(db,3,"update integracao_crm_cards set status='Perdido' where id=$1",[id(81)]);
 const first=(await operar(db,2,80,90,null,1))[0].id;await operar(db,3,80,91,first,2,'Feito com outro comercial responsável.');
 const dashboard=(await como(db,1,"select integracao_crm_dashboard(current_date-1,current_date+1) d"))[0].d,a=dashboard.agentes.find(x=>x.id===id(2)),b=dashboard.agentes.find(x=>x.id===id(3));
 assert.equal(a.movimentacoes,3);assert.equal(a.conversoes,1);assert.equal(b.perdas,1);assert.equal(a.atendimentos_chatwoot,1);assert.equal(a.mensagens_enviadas,2);assert.equal(b.followups_feitos,1);assert.equal(b.no_prazo,1);assert.equal(dashboard.cobertura.automaticas,1);assert.equal(dashboard.cobertura.saidas_sem_autoria,1);
 assert.equal(dashboard.agentes.find(x=>x.id===id(7)).carteira,0);
 const stats=(await como(db,2,'select * from integracao_crm_chatwoot_resumo'))[0];assert.equal(stats.mensagens,6);assert.equal(stats.humanas,2);assert.equal(stats.automaticas,1);
 assert.equal((await como(db,3,'select * from integracao_crm_chatwoot_resumo')).length,0);
 await assert.rejects(()=>como(db,2,'select integracao_crm_receber($1)',[evento]),/permission denied/);
 }finally{await db.close();}});
test('vincular cliente preserva FollowUps e o prazo pendente mais próximo',async()=>{const db=await preparar();try{
 await db.exec(`update integracao_crm_cards set cliente_id='${id(20)}' where id='${id(81)}';`);
 await operar(db,2,80,90,null,1);await operar(db,3,81,91,null,4);
 await como(db,3,'select integracao_crm_vincular($1,$2)',[id(80),id(20)]);
 const rows=(await como(db,3,'select * from integracao_crm_followups')).sort((a,b)=>a.prazo_dias-b.prazo_dias);
 assert.equal(rows.length,2);assert.ok(rows.every(f=>f.card_id===id(81)));assert.equal(rows[0].status,'pendente');assert.equal(rows[1].status,'unificado');
 }finally{await db.close();}});

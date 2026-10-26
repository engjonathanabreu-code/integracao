import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepararBanco} from './crm-schema.test.js';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=f=>readFileSync(new URL('../supabase/'+f,import.meta.url),'utf8');
const correcao=()=>sql('migrations/20261026180103_crm_metas_ativacoes_comprovadas.sql');
async function como(db,n,query,args=[]){
 await db.exec(`set request.jwt.claim.sub='${id(n)}';set role authenticated`);
 try{return (await db.query(query,args)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}
}
async function banco(corrigir=true){
 const db=await prepararBanco();
 await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();
 alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;
 alter table integracao_moradores add primary key(colecao,registro_id);
 create schema erp_collab_private;
 create function erp_collab_private.integracao_diretoria() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;
 grant usage on schema erp_collab_private to authenticated;
 insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(31)}','Remessa teste','${id(30)}','TST01');
 update fin_receb_clientes set municipio_id='${id(30)}',remessa_id='${id(31)}',cpf_cnpj='52998224725' where id='${id(20)}';`);
 for(const f of ['crm-leads.sql','crm-lead-responsavel.sql','crm-carregamento.sql'])await db.exec(sql('operacoes/'+f));
 for(const f of ['20260922162925_crm_multiplos_comerciais.sql','20260919182005_chatwoot_ia_conexao.sql','20260923122108_crm_followup_dashboard.sql','20260923160000_crm_arquivo_leads.sql','20260924120000_crm_editar_card.sql','20260924150000_crm_ativacoes.sql','20260926201425_crm_metas_estrategias.sql','20261008120000_crm_entrada_valor.sql'])await db.exec(sql('migrations/'+f));
 await como(db,1,`insert into integracao_crm_metas(id,titulo,escopo,setor,participantes,unidade,alvo,inicio,fim) values
 ('${id(90)}','Meta principal','usuario','comercial',array['${id(2)}'::uuid],'quantidade',10,current_date-1,current_date+1),
 ('${id(91)}','Outro vendedor','usuario','comercial',array['${id(3)}'::uuid],'quantidade',10,current_date-1,current_date+1),
 ('${id(92)}','Valor da equipe','setor','comercial',array['${id(2)}'::uuid,'${id(3)}'::uuid],'valor',10000,current_date-1,current_date+1),
 ('${id(93)}','Outro período','usuario','comercial',array['${id(2)}'::uuid],'quantidade',10,current_date-30,current_date-10)`);
 if(corrigir)await db.exec(correcao());
 return db;
}
const painel=async(db,n=1)=>(await como(db,n,'select integracao_crm_metas_painel() as metas'))[0].metas;
const total=(metas,n)=>Number(metas.find(m=>m.id===id(n)).realizado);
async function card(db,n,status='Cliente novo'){
 await db.exec(`insert into integracao_crm_cards(id,cliente_id,responsavel_id,comerciais_adicionais,status,valor_total,forma_negociacao,desconto_percentual)
 values('${id(n)}','${id(20)}','${id(2)}',array['${id(3)}'::uuid],'${status}',1200,'avista',0)
 on conflict(cliente_id) do update set status=excluded.status returning id`);
}

test('reproduz exclusão das ativações diretas e corrige só a leitura, de forma idempotente',async()=>{
 const db=await banco(false);try{
  await card(db,80);
  await como(db,2,`update integracao_crm_cards set status='Cliente ativo' where id='${id(80)}'`);
  assert.equal(total(await painel(db),90),0);
  const antes=(await db.query('select to_jsonb(a) registro from integracao_crm_ativacoes a')).rows;
  await db.exec(correcao());
  assert.equal(total(await painel(db),90),1);
  await db.exec(correcao());
  assert.equal(total(await painel(db),90),1);
  assert.deepEqual((await db.query('select to_jsonb(a) registro from integracao_crm_ativacoes a')).rows,antes);
 }finally{await db.close();}
});

test('ativação de cada etapa alimenta vendedor/período e repetições, reversão e transferência não duplicam',async()=>{
 const db=await banco();try{
  await card(db,80);
  for(const etapa of ['Cliente novo','Negociação','Contrato','Perdido']){
   await como(db,2,`update integracao_crm_cards set status=$1 where id=$2`,[etapa,id(80)]);
   await como(db,3,`update integracao_crm_cards set status='Cliente ativo' where id=$1`,[id(80)]);
   const r=await painel(db);
   assert.equal(total(r,90),1,etapa);assert.equal(total(r,91),0);assert.equal(total(r,92),1200);assert.equal(total(r,93),0);
   const evento=(await db.query('select * from integracao_crm_ativacoes where card_id=$1',[id(80)])).rows[0];
   assert.equal(evento.etapa_anterior,etapa);assert.equal(evento.responsavel_id,id(2));assert.equal(evento.ativado_por,id(3));
   await como(db,3,`update integracao_crm_cards set status='Cliente ativo' where id=$1`,[id(80)]);
   const repetido=(await db.query('select * from integracao_crm_ativacoes where card_id=$1',[id(80)])).rows[0];
   assert.deepEqual(repetido,evento);
   // Nova consulta RPC representa recarregar a tela; não há total local a salvar.
   assert.equal(total(await painel(db,2),90),1);
   assert.equal((await db.query('select count(*) n from integracao_crm_ativacoes')).rows[0].n,1);
  }
  await como(db,1,'select integracao_crm_transferir($1,$2)',[id(80),id(3)]);
  assert.equal(total(await painel(db),90),1);assert.equal(total(await painel(db),91),0);
  await como(db,3,`update integracao_crm_cards set status='Negociação' where id=$1`,[id(80)]);
  assert.equal(total(await painel(db),90),0);
  await como(db,3,`update integracao_crm_cards set status='Cliente ativo' where id=$1`,[id(80)]);
  assert.equal(total(await painel(db),91),1);assert.equal(total(await painel(db),90),0);
 }finally{await db.close();}
});

test('conversão direta de lead, sincronização do cadastro e repetição do RPC mantêm uma venda',async()=>{
 const db=await banco();try{
  await db.exec(`insert into integracao_crm_cards(id,lead_nome,lead_municipio_id,responsavel_id,lead_cpf) values('${id(81)}','Lead fictício','${id(30)}','${id(2)}','529.982.247-25')`);
  const anterior={status:'Cliente novo',valor_total:null,forma_negociacao:null,parcelas:null,desconto_percentual:null,entrada_percentual:null,entrada_valor:null};
  const dados={...anterior,status:'Cliente ativo',valor_total:900,forma_negociacao:'avista',desconto_percentual:0};
  const args=[id(81),id(30),id(31),JSON.stringify(dados),JSON.stringify(anterior)];
  const converter=()=>como(db,2,'select integracao_crm_converter_lead($1,$2,$3,$4,$5) cliente',args);
  const [r]=await converter();assert.deepEqual(await converter(),[r]);
  assert.equal(total(await painel(db),90),1);assert.equal(total(await painel(db),92),900);
  const [cadastro]=(await db.query('select * from integracao_moradores where referencia_id=$1',[r.cliente])).rows;
  assert.equal(cadastro.dados.requerente.statusCRM,'Cliente ativo');
  await como(db,2,`update integracao_moradores set dados=jsonb_set(dados,'{requerente,statusCRM}','"Negociação"') where referencia_id=$1`,[r.cliente]);
  assert.equal(total(await painel(db),90),0);
  await como(db,2,`update integracao_moradores set dados=jsonb_set(dados,'{requerente,statusCRM}','"Cliente ativo"') where referencia_id=$1`,[r.cliente]);
  assert.equal(total(await painel(db),90),1);
  assert.equal((await db.query('select count(*) n from integracao_crm_ativacoes')).rows[0].n,1);
 }finally{await db.close();}
});

test('preserva limites inclusivos em São Paulo, valor, falta de evidência e acesso',async()=>{
 const db=await banco();try{
  await como(db,1,`update integracao_crm_metas set inicio='2026-01-01',fim='2026-01-31' where id in ('${id(90)}','${id(92)}')`);
  // Eventos sintéticos nos limites do período, sem deduzir dados históricos.
  await db.exec(`set session_replication_role=replica;
  insert into integracao_crm_ativacoes(card_id,nome,responsavel_id,valor,ativado_em,origem,etapa_anterior,desfeito_em) values
  ('${id(100)}','Teste','${id(2)}',100,'2026-01-01 02:59:59+00','registro','Cliente novo',null),
  ('${id(101)}','Teste','${id(2)}',200,'2026-01-01 03:00:00+00','registro','Cliente novo',null),
  ('${id(102)}','Teste','${id(2)}',300,'2026-02-01 02:59:59+00','historico','Negociação',null),
  ('${id(103)}','Teste','${id(2)}',400,'2026-02-01 03:00:00+00','registro','Contrato',null),
  ('${id(104)}','Teste','${id(2)}',null,'2026-01-15 12:00:00+00','registro','Perdido',null),
  ('${id(105)}','Teste','${id(2)}',800,'2026-01-15 12:00:00+00','estimado',null,null),
  ('${id(106)}','Teste',null,900,'2026-01-15 12:00:00+00','registro','Cliente novo',null),
  ('${id(107)}','Teste','${id(2)}',900,'2026-01-15 12:00:00+00','registro','Contrato',now()),
  ('${id(108)}','Teste','${id(2)}',900,'2026-01-15 12:00:00+00','registro','Cliente ativo',null);
  set session_replication_role=origin;`);
  const r=await painel(db);assert.equal(total(r,90),3);assert.equal(total(r,92),500);
  assert.equal(r.find(m=>m.id===id(90)).sem_valor,1);
  assert.deepEqual((await painel(db,2)).map(m=>m.por_usuario),[[],[],[]]);
  assert.equal((await painel(db,3)).length,2);
  await assert.rejects(()=>como(db,2,'update integracao_crm_ativacoes set valor=1'),/permission denied/);
  await db.exec(`update profiles set ativo=false where id='${id(2)}'`);
  await assert.rejects(()=>painel(db,2),/conta ativa/);
 }finally{await db.close();}
});

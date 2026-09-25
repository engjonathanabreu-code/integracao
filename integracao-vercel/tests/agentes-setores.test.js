import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const DIRETOR=uuid(1),ANA=uuid(2),BIA=uuid(3);
const ler=nome=>readFileSync(new URL(`../supabase/migrations/${nome}`,import.meta.url),'utf8');

async function banco() {
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema erp_collab_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,erp_collab_private to anon,authenticated,service_role;
 create table public.profiles(id uuid primary key,nome text not null,email text,tipo text not null,ativo boolean not null default true);
 create table public.processos_kanban(id uuid primary key,nucleo text,municipio text,estado text,ativo boolean default true,excluido_erp boolean default false,
  etapa_atual text,responsavel_id uuid,pendencia text,prioridade text,etapa_iniciada_em timestamptz,sla_prazo date,created_at timestamptz default now());
 create table public.processos_kanban_andamentos(id uuid primary key default gen_random_uuid(),processo_id uuid,status text,status_operacional text,
  observacao_interna text,data_atualizacao date,created_at timestamptz default now());
 create table public.meta_setores(id uuid primary key,nome text);
 create table public.metas(id uuid primary key,titulo text,prazo date,status text,setor_id uuid);
 create table public.meta_responsaveis(meta_id uuid,usuario_id uuid);
 create table public.planos_trabalho(id uuid primary key,titulo text,status text);
 create table public.etapas_plano(id uuid primary key,plano_id uuid,titulo text,prazo date,status text);
 create table public.etapa_responsaveis(etapa_id uuid,usuario_id uuid);
 create table public.integracao_metas(colecao text,registro_id text,dados jsonb,criado_por uuid,referencia_tabela text,referencia_id uuid);
 create table public.integracao_crm_cards(id uuid primary key,responsavel_id uuid,status text,lead_nome text,lead_telefone text,valor_total numeric,
  arquivado_em timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.integracao_crm_auditoria(id bigserial primary key,tabela text,registro_id uuid,acao text,autor_id uuid,anterior jsonb,atual jsonb,created_at timestamptz default now());
 create table public.integracao_crm_conversas(id uuid primary key,card_id uuid);
 create table public.integracao_crm_mensagens(id uuid primary key default gen_random_uuid(),conversa_id uuid,direcao text,autor_tipo text,data timestamptz);
 create table public.integracao_crm_followups(id uuid primary key default gen_random_uuid(),card_id uuid,status text,previsto_em timestamptz,concluido_em timestamptz);
 create table public.integracao_crm_ativacoes(card_id uuid primary key,responsavel_id uuid,valor numeric,ativado_em timestamptz,desfeito_em timestamptz);
 create table public.integracao_crm_institucionais(id uuid primary key default gen_random_uuid(),nome text,status text,motivo_perda text);
 insert into public.profiles(id,nome,tipo,ativo) values
  ('${DIRETOR}','Jonathan Abreu','Diretor Técnico',true),('${ANA}','Ana Paula','Comercial',true),('${BIA}','Bia','Topografia',true);
 grant select on all tables in schema public to authenticated;`);
 await db.exec(ler('20260925120000_agentes_diretoria.sql'));
 await db.exec(ler('20260925160000_agentes_setores_conversa.sql'));
 await db.exec(`insert into public.processos_kanban(id,nucleo,municipio,estado,etapa_atual,responsavel_id,pendencia,etapa_iniciada_em) values
  ('${uuid(10)}','NUI03','Ibirama','SC','Topografia','${BIA}','Falta memorial',now()-interval '97 days'),
  ('${uuid(11)}','NUI07','Agrolândia','SC','Projetos',null,null,now()-interval '61 days'),
  ('${uuid(12)}','NUI09','Ibirama','SC','Comercial','${ANA}',null,now()-interval '5 days'),
  ('${uuid(13)}','NUI01','Ibirama','SC','Coleta Documental','${ANA}',null,now()-interval '40 days'),
  ('${uuid(14)}','NUI01','Rio do Sul','SC','Protocolo',null,null,now()-interval '200 days'),
  ('${uuid(15)}','NUI88','Ibirama','SC','Concluído',null,null,now()-interval '9 days'),
  ('${uuid(16)}','NUI99','Ibirama','SC','Topografia',null,null,now()-interval '300 days');
 update public.processos_kanban set excluido_erp=true where id='${uuid(16)}';
 insert into public.processos_kanban_andamentos(processo_id,status,status_operacional,observacao_interna,data_atualizacao,created_at) values
  ('${uuid(10)}','Topografia','Em andamento','Campo marcado',current_date-40,now()-interval '40 days'),
  ('${uuid(10)}','Topografia','Pausado','Chuva, campo adiado',current_date-3,now()-interval '3 days'),
  ('${uuid(14)}','Protocolado','Aguardando Prefeitura','Sem retorno do urbanismo',current_date-10,now()-interval '10 days'),
  ('${uuid(12)}','Comercial','Em andamento',null,current_date-1,now()-interval '1 days'),
  ('${uuid(16)}','Topografia','Em andamento','núcleo excluído',current_date,now());
 insert into public.meta_setores(id,nome) values('${uuid(20)}','Topografia'),('${uuid(21)}','Atendimentos'),('${uuid(22)}','Jurídico');
 insert into public.metas(id,titulo,prazo,status,setor_id) values
  ('${uuid(30)}','Memoriais do NUI03',current_date-24,'Em andamento','${uuid(20)}'),
  ('${uuid(31)}','Levantamento NUI07',current_date+3,'Em andamento','${uuid(20)}'),
  ('${uuid(32)}','Ortofoto',current_date+30,'Aguardando aprovação','${uuid(20)}'),
  ('${uuid(33)}','Sem prazo',null,'Em andamento','${uuid(20)}'),
  ('${uuid(34)}','Entregue',current_date-5,'Concluído','${uuid(20)}'),
  ('${uuid(35)}','Recolher documentos',current_date-2,'Em andamento','${uuid(21)}'),
  ('${uuid(36)}','Parecer',current_date+15,'Em andamento','${uuid(22)}');
 insert into public.meta_responsaveis(meta_id,usuario_id) values('${uuid(30)}','${BIA}'),('${uuid(30)}','${ANA}'),('${uuid(31)}','${BIA}'),('${uuid(35)}','${ANA}');`);
 return db;
}
const como=async(db,id,sql)=>{
 await db.exec(`select set_config('request.jwt.claim.sub','${id||''}',false);set role authenticated;`);
 try {return await db.query(sql);} finally {await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);`);}
};
const setor=async(db,s,id=DIRETOR)=>(await como(db,id,`select public.integracao_agente_setor('${s}',45,12) as p`)).rows[0].p;
const andamentos=async(db,texto,id=DIRETOR)=>(await como(db,id,`select public.integracao_agente_andamentos($$${texto}$$,8) as p`)).rows[0].p;

test('o panorama por setor e a busca de andamentos são só da diretoria',async()=>{
 const db=await banco();
 for(const quem of [ANA,BIA,'']) {
  await assert.rejects(()=>setor(db,'geral',quem),/diretoria/i);
  await assert.rejects(()=>andamentos(db,'NUI03',quem),/diretoria/i);
 }
 await assert.rejects(()=>setor(db,'financeiro'),/Setor desconhecido/);
});

test('a visão geral conta toda a operação e compara os setores',async()=>{
 const db=await banco();
 const p=await setor(db,'geral');
 assert.equal(p.nucleos.total,5,'concluído e excluído do ERP ficam fora');
 assert.deepEqual(p.nucleos.faixas,{ate_30:1,de_31_a_60:1,de_61_a_90:1,mais_de_90:2});
 assert.deepEqual(p.nucleos.parados.map(x=>x.nucleo),['NUI01','NUI03','NUI07']);
 assert.equal(p.metas.abertas,6);
 const m=p.metas;
 assert.equal(m.vencidas+m.vencem_em_7+m.no_prazo+m.sem_prazo,m.abertas,'as quatro fatias somam as abertas');
 assert.deepEqual([m.vencidas,m.vencem_em_7,m.no_prazo,m.sem_prazo,m.aguardando_aprovacao,m.concluidas_30_dias],[2,1,2,1,1,1]);
 assert.equal(m.pendencias[0].titulo,'Memoriais do NUI03');
 assert.equal(m.pendencias[0].dias_atraso,24);
 assert.equal(m.pendencias[0].responsaveis,'Ana Paula, Bia');
 assert.equal(m.pendencias.at(-1).titulo,'Sem prazo','sem prazo vai para o fim');
 const s=Object.fromEntries(p.setores.map(x=>[x.setor,x]));
 assert.deepEqual(p.setores.map(x=>x.setor),['comercial','topografia','projeto','posprotocolo','juridico']);
 assert.deepEqual([s.comercial.nucleos,s.topografia.nucleos,s.projeto.nucleos,s.posprotocolo.nucleos,s.juridico.nucleos],[2,1,1,1,0]);
 assert.deepEqual([s.topografia.metas_abertas,s.topografia.metas_vencidas],[4,1]);
 assert.deepEqual([s.comercial.metas_abertas,s.comercial.metas_vencidas],[1,1]);
 assert.equal(s.juridico.metas_abertas,1);
});

test('cada setor só enxerga as próprias etapas, metas e andamentos',async()=>{
 const db=await banco();
 const t=await setor(db,'topografia');
 assert.equal(t.setores,null);
 assert.equal(t.nucleos.total,1);
 assert.deepEqual(t.nucleos.por_etapa,[{etapa:'Topografia',total:1}]);
 assert.equal(t.metas.abertas,4);
 assert.deepEqual(t.metas.por_responsavel[0],{responsavel:'Bia',abertas:2,vencidas:1});
 assert.deepEqual(t.andamentos.recentes.map(a=>a.observacao),['Chuva, campo adiado','Campo marcado'],'o andamento do núcleo excluído não aparece');
 assert.deepEqual(t.andamentos.por_situacao,[{situacao:'Pausado',total:1}],'só o último andamento de cada núcleo conta');
 assert.equal(t.andamentos.por_semana.length,8);
 assert.equal(t.andamentos.por_semana.reduce((s,x)=>s+Number(x.total),0),2);
 assert.equal(t.andamentos.ultimos_30_dias,1,'o andamento de 40 dias atrás fica fora dos 30 dias');
 const c=await setor(db,'comercial');
 assert.deepEqual(c.nucleos.por_etapa.map(x=>x.etapa).sort(),['Coleta Documental','Comercial']);
 assert.deepEqual(c.metas.pendencias.map(x=>x.titulo),['Recolher documentos']);
 const pp=await setor(db,'posprotocolo');
 assert.equal(pp.andamentos.recentes[0].situacao,'Aguardando Prefeitura');
 const j=await setor(db,'juridico');
 assert.equal(j.nucleos.total,0);
 assert.deepEqual(j.andamentos.recentes,[]);
 assert.equal(j.metas.abertas,1);
});

test('a conversa acha o núcleo citado, com os últimos andamentos',async()=>{
 const db=await banco();
 const a=await andamentos(db,'Como está o NUI03 de Ibirama?');
 assert.equal(a.encontrados[0].nucleo,'NUI03');
 assert.equal(a.encontrados[0].responsavel,'Bia');
 assert.equal(a.encontrados[0].dias_na_etapa,97);
 assert.deepEqual(a.encontrados[0].andamentos.map(x=>x.situacao),['Pausado','Em andamento']);
 assert.ok(!a.encontrados.some(x=>x.nucleo==='NUI99'),'núcleo excluído do ERP não é citado');
 const b=await andamentos(db,'e o nui01 em rio do sul?');
 assert.equal(b.encontrados[0].municipio,'Rio do Sul/SC','núcleo e município juntos ganham do homônimo');
 const c=await andamentos(db,'Andamentos de agrolandia');
 assert.deepEqual(c.encontrados.map(x=>x.nucleo),['NUI07'],'acento e caixa não atrapalham');
 const d=await andamentos(db,'o que andou esta semana?');
 assert.deepEqual(d.encontrados,[]);
 assert.equal(d.recentes[0].nucleo,'NUI09');
 assert.ok(!d.recentes.some(x=>x.observacao==='núcleo excluído'));
});

test('as novas leituras não escrevem nada',async()=>{
 const db=await banco();
 await setor(db,'geral');await andamentos(db,'NUI03');
 const volatil=(await db.query(`select p.proname,p.provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('integracao_agente_setor','integracao_agente_andamentos') order by 1`)).rows;
 assert.deepEqual(volatil.map(v=>v.provolatile),['s','s']);
});

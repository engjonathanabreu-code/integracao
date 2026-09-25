import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const DIRETOR=uuid(1),ANA=uuid(2),TOPOGRAFO=uuid(3),INATIVO=uuid(4);
const migration=readFileSync(new URL('../supabase/migrations/20260925120000_agentes_diretoria.sql',import.meta.url),'utf8');

const devolutiva=(origem,prazo,categorias,naoCorrigidos=0)=>JSON.stringify({devolutiva:{origem,chegada:'2026-08-01',prazo,textoOriginal:'x',
 analiseIA:{etapa1:{resumo:'r',itens:categorias.map((c,i)=>({id:`i${i}`,categoria:c,descricao:`falha ${c}`}))},
 etapa2:{resumo:'r',pronto:false,itens:Array.from({length:naoCorrigidos},(_,i)=>({refItemId:`i${i}`,status:'nao_corrigido',observacao:'segue igual'})),
 pendencias:[{refItemId:'i0',descricao:'Área diverge',oQueFazer:'Refazer o memorial'}]}}}});

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
  ('${DIRETOR}','Jonathan Abreu','Diretor Técnico',true),('${ANA}','Ana Paula','Comercial',true),
  ('${TOPOGRAFO}','Bia','Topografia',true),('${INATIVO}','Saiu','Administrador',false);
 alter default privileges in schema public grant all on tables to anon,authenticated;
 grant select on all tables in schema public to authenticated;`);
 await db.exec(migration);
 return db;
}
const como=async(db,id,sql)=>{
 await db.exec(`select set_config('request.jwt.claim.sub','${id||''}',false);set role authenticated;`);
 try {return await db.query(sql);} finally {await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);`);}
};
const tecnico=async(db,id,dias=45)=>(await como(db,id,`select public.integracao_agente_tecnico(${dias},20) as p`)).rows[0].p;
const comercial=async(db,id,extra='null,null,14,20')=>(await como(db,id,`select public.integracao_agente_comercial(${extra}) as p`)).rows[0].p;

async function operacao(db) {
 await db.exec(`insert into public.processos_kanban(id,nucleo,municipio,estado,etapa_atual,responsavel_id,pendencia,etapa_iniciada_em) values
  ('${uuid(10)}','NUI03','Ibirama','SC','Topografia','${TOPOGRAFO}','Falta memorial',now()-interval '97 days'),
  ('${uuid(11)}','NUI07','Agrolândia','SC','Projetos',null,null,now()-interval '61 days'),
  ('${uuid(12)}','NUI09','Ibirama','SC','Comercial','${TOPOGRAFO}',null,now()-interval '5 days'),
  ('${uuid(13)}','NUI01','Ibirama','SC','Concluído','${TOPOGRAFO}',null,now()-interval '400 days'),
  ('${uuid(14)}','NUI99','Rio do Sul','SC','Protocolo',null,null,now()-interval '200 days');
 update public.processos_kanban set excluido_erp=true where id='${uuid(14)}';
 insert into public.processos_kanban_andamentos(processo_id,status,status_operacional,observacao_interna,data_atualizacao) values
  ('${uuid(10)}','Protocolado','Aguardando Prefeitura','Sem retorno do urbanismo',current_date-146),
  ('${uuid(10)}','Topografia','Em andamento',null,current_date-200),
  ('${uuid(12)}','Comercial','Em andamento',null,current_date-3);
 insert into public.meta_setores(id,nome) values('${uuid(20)}','Topografia');
 insert into public.metas(id,titulo,prazo,status,setor_id) values
  ('${uuid(21)}','Memoriais do NUI03',current_date-24,'Em andamento','${uuid(20)}'),
  ('${uuid(22)}','Meta no prazo',current_date+3,'Em andamento','${uuid(20)}'),
  ('${uuid(23)}','Meta entregue',current_date-50,'Concluído','${uuid(20)}'),
  ('${uuid(24)}','Devolutiva Ibirama 02',current_date+10,'Em andamento','${uuid(20)}'),
  ('${uuid(25)}','Meta sem prazo',null,'Em andamento','${uuid(20)}');
 insert into public.meta_responsaveis(meta_id,usuario_id) values('${uuid(21)}','${TOPOGRAFO}'),('${uuid(21)}','${ANA}');
 insert into public.planos_trabalho(id,titulo,status) values('${uuid(30)}','Plano Ibirama','Em andamento');
 insert into public.etapas_plano(id,plano_id,titulo,prazo,status) values
  ('${uuid(31)}','${uuid(30)}','Levantamento',current_date-9,'Em andamento'),
  ('${uuid(32)}','${uuid(30)}','Projeto',current_date+9,'Em andamento');
 insert into public.etapa_responsaveis(etapa_id,usuario_id) values('${uuid(31)}','${TOPOGRAFO}');
 insert into public.integracao_metas(colecao,registro_id,dados,referencia_tabela,referencia_id) values
  ('metas','m24','${devolutiva('Prefeitura',`${new Date(Date.now()-5*864e5).toISOString().slice(0,10)}`,['memoriais','memoriais','areas'],2)}'::jsonb,'metas','${uuid(24)}'),
  ('metas','m23','${devolutiva('ORI','2027-01-01',['lei'],0)}'::jsonb,'metas','${uuid(23)}'),
  ('metas','m21','{"recusasConclusao":[{"motivo":"Memorial não corresponde ao lote","data":"2026-09-05"}]}'::jsonb,'metas','${uuid(21)}');`);
}

test('quem não é da diretoria não abre nenhum dos dois painéis',async()=>{
 const db=await banco();await operacao(db);
 for(const quem of [ANA,TOPOGRAFO,INATIVO,'']) {
  await assert.rejects(()=>tecnico(db,quem),/diretoria/i,`técnico ${quem||'anônimo'}`);
  await assert.rejects(()=>comercial(db,quem),/diretoria/i,`comercial ${quem||'anônimo'}`);
 }
 const p=await tecnico(db,DIRETOR);
 assert.equal(p.nucleos.ativos,3);
});

test('o painel técnico conta núcleos ativos, parados e por etapa',async()=>{
 const db=await banco();await operacao(db);
 const p=await tecnico(db,DIRETOR);
 // Concluído e excluído do ERP ficam fora da contagem de ativos.
 assert.equal(p.nucleos.ativos,3);
 assert.deepEqual(p.nucleos.por_etapa.map(e=>e.etapa).sort(),['Comercial','Projetos','Topografia']);
 assert.deepEqual(p.nucleos.parados_por_faixa,{mais_de_30:2,mais_de_60:2,mais_de_90:1,mais_de_180:0});
 assert.deepEqual(p.nucleos.parados.map(x=>x.nucleo),['NUI03','NUI07']);
 assert.equal(p.nucleos.parados[0].dias_na_etapa,97);
 assert.equal(p.nucleos.parados[0].responsavel,'Bia');
 assert.equal(p.nucleos.parados[0].pendencia,'Falta memorial');
 assert.equal(p.nucleos.parados[1].responsavel,null);
 assert.equal(p.nucleos.parados[1].ultimo_andamento,null);
 assert.deepEqual(p.nucleos.sla_vencido,[]);
});

test('o limite de dias parado muda a lista, não os totais',async()=>{
 const db=await banco();await operacao(db);
 assert.equal((await tecnico(db,DIRETOR,90)).nucleos.parados.length,1);
 assert.equal((await tecnico(db,DIRETOR,30)).nucleos.parados.length,2);
 assert.equal((await tecnico(db,DIRETOR,90)).nucleos.ativos,3);
});

test('só o último andamento de cada núcleo conta como espera, e só se estiver aguardando',async()=>{
 const db=await banco();await operacao(db);
 const p=await tecnico(db,DIRETOR);
 assert.equal(p.andamentos.total,3);
 assert.equal(p.andamentos.aguardando.length,1);
 assert.equal(p.andamentos.aguardando[0].nucleo,'NUI03');
 assert.equal(p.andamentos.aguardando[0].dias,146);
 assert.equal(p.andamentos.aguardando[0].observacao,'Sem retorno do urbanismo');
});

test('metas e etapas vencidas vêm com prazo, atraso e responsáveis',async()=>{
 const db=await banco();await operacao(db);
 const p=await tecnico(db,DIRETOR);
 assert.equal(p.metas.abertas,4);
 assert.equal(p.metas.vencidas,1);
 assert.equal(p.metas.vencem_em_7,1);
 assert.equal(p.metas.lista[0].titulo,'Memoriais do NUI03');
 assert.equal(p.metas.lista[0].dias_atraso,24);
 assert.equal(p.metas.lista[0].responsaveis,'Ana Paula, Bia');
 assert.equal(p.planos.etapas_vencidas.length,1);
 assert.equal(p.planos.etapas_vencidas[0].etapa,'Levantamento');
 assert.equal(p.planos.etapas_vencidas[0].responsaveis,'Bia');
});

test('as devolutivas viram contagem por origem e ranking de falhas',async()=>{
 const db=await banco();await operacao(db);
 const p=await tecnico(db,DIRETOR);
 assert.equal(p.devolutivas.total,2);
 assert.equal(p.devolutivas.abertas,1);
 assert.equal(p.devolutivas.vencidas,1);
 assert.deepEqual(p.devolutivas.por_origem.map(o=>o.origem).sort(),['ORI','Prefeitura']);
 assert.deepEqual(p.falhas.por_categoria,[{categoria:'memoriais',total:2},{categoria:'areas',total:1},{categoria:'lei',total:1}].sort((a,b)=>b.total-a.total));
 assert.equal(p.falhas.nao_corrigidos,2);
 assert.ok(p.falhas.pendencias.some(x=>x.descricao==='Área diverge'&&x.o_que_fazer==='Refazer o memorial'));
 assert.deepEqual(p.falhas.recusas_conclusao,[{motivo:'Memorial não corresponde ao lote',data:'2026-09-05'}]);
});

test('a cobertura do cadastro é dita junto com os números',async()=>{
 const db=await banco();await operacao(db);
 const p=await tecnico(db,DIRETOR);
 assert.deepEqual(p.cobertura,{nucleos_com_sla:0,nucleos_sem_andamento:1,nucleos_sem_responsavel:1,metas_sem_prazo:1});
});

async function funil(db) {
 const c=(n,status,nome,resp,valor,dias)=>`('${uuid(n)}',${resp?`'${resp}'::uuid`:'null'},'${status}','${nome}',${valor??'null'},now()-interval '${dias} days',now()-interval '${dias} days')`;
 await db.exec(`insert into public.integracao_crm_cards(id,responsavel_id,status,lead_nome,valor_total,created_at,updated_at) values
  ${c(40,'Cliente novo','João Lima',null,null,40)},${c(41,'Negociação','Maria Souza',ANA,12000,3)},
  ${c(42,'Contrato','Pedro Alves',ANA,30000,2)},${c(43,'Cliente ativo','Lúcia Dias',ANA,5500,1)},
  ${c(44,'Perdido','Carlos Reis',ANA,null,5)},${c(45,'Perdido','Rita Nunes',ANA,null,6)},
  ${c(46,'Perdido','Ivo Prado',ANA,null,7)},${c(47,'Negociação','Sem responsável',null,null,1)};
 insert into public.integracao_crm_auditoria(tabela,registro_id,acao,autor_id,anterior,atual,created_at) values
  ('integracao_crm_cards','${uuid(42)}','UPDATE','${ANA}','{"status":"Negociação"}','{"status":"Contrato"}',now()-interval '2 days'),
  ('integracao_crm_cards','${uuid(43)}','UPDATE','${ANA}','{"status":"Contrato"}','{"status":"Cliente ativo"}',now()-interval '1 days'),
  ('integracao_crm_cards','${uuid(44)}','UPDATE','${ANA}','{"status":"Negociação"}','{"status":"Perdido"}',now()-interval '5 days'),
  ('integracao_crm_cards','${uuid(45)}','UPDATE','${ANA}','{"status":"Negociação"}','{"status":"Perdido"}',now()-interval '6 days'),
  ('integracao_crm_cards','${uuid(46)}','UPDATE','${ANA}','{"status":"Negociação"}','{"status":"Perdido"}',now()-interval '400 days'),
  ('integracao_crm_cards','${uuid(41)}','UPDATE','${ANA}','{"status":"Negociação"}','{"status":"Negociação"}',now()-interval '1 days');
 insert into public.integracao_crm_conversas(id,card_id) values('${uuid(50)}','${uuid(41)}'),('${uuid(51)}','${uuid(42)}');
 insert into public.integracao_crm_mensagens(conversa_id,direcao,autor_tipo,data) values
  ('${uuid(50)}','outgoing','user',now()-interval '30 days'),
  ('${uuid(50)}','incoming','contact',now()-interval '24 days'),
  ('${uuid(51)}','incoming','contact',now()-interval '9 days'),
  ('${uuid(51)}','outgoing','agent_bot',now()-interval '2 days');
 insert into public.integracao_crm_followups(card_id,status,previsto_em,concluido_em) values
  ('${uuid(41)}','pendente',now()-interval '4 days',null),
  ('${uuid(42)}','feito',now()-interval '10 days',now()-interval '11 days');
 insert into public.integracao_crm_ativacoes(card_id,responsavel_id,valor,ativado_em,desfeito_em) values
  ('${uuid(43)}','${ANA}',5500,now()-interval '1 days',null),
  ('${uuid(42)}','${ANA}',9999,now()-interval '3 days',now());
 insert into public.integracao_crm_institucionais(nome,status,motivo_perda) values
  ('Prefeitura de X','Perdido','Preço acima do orçamento'),('Prefeitura de Y','Ganho',null),('Prefeitura de Z','Em negociação',null);`);
}

test('o funil e o índice de fechamento saem do que realmente fechou no período',async()=>{
 const db=await banco();await funil(db);
 const p=await comercial(db,DIRETOR);
 assert.deepEqual(p.funil.map(f=>[f.etapa,Number(f.cards)]),[['Cliente novo',1],['Negociação',2],['Contrato',1],['Cliente ativo',1],['Perdido',3]]);
 // Um ganho e duas perdas no período: a terceira perda é de 400 dias atrás.
 assert.equal(p.fechamento.ganhos,1);
 assert.equal(p.fechamento.perdas,2);
 assert.equal(p.fechamento.desfechos_no_periodo,3);
 assert.equal(p.fechamento.indice,null,'menos de 5 desfechos não vira índice');
 assert.equal(Number(p.fechamento.acumulado.indice),40);
 assert.equal(p.fechamento.acumulado.em_aberto,3);
});

test('o mesmo negócio avançando de Contrato para Cliente ativo não conta como ganho duas vezes',async()=>{
 const db=await banco();await funil(db);
 // O card 43 fez Contrato -> Cliente ativo dentro do período e não entra como ganho novo.
 assert.equal((await comercial(db,DIRETOR)).fechamento.ganhos,1);
 await db.exec(`insert into public.integracao_crm_auditoria(tabela,registro_id,acao,autor_id,anterior,atual,created_at) values
  ('integracao_crm_cards','${uuid(47)}','UPDATE','${ANA}','{"status":"Cliente novo"}','{"status":"Cliente ativo"}',now()-interval '1 days');`);
 assert.equal((await comercial(db,DIRETOR)).fechamento.ganhos,2,'um card que pula direto para Cliente ativo é ganho');
});

test('o índice aparece quando a base de desfechos é suficiente',async()=>{
 const db=await banco();await funil(db);
 await db.exec(`insert into public.integracao_crm_auditoria(tabela,registro_id,acao,autor_id,anterior,atual,created_at) values
  ('integracao_crm_cards','${uuid(40)}','UPDATE',null,'{"status":"Cliente novo"}','{"status":"Contrato"}',now()-interval '3 days'),
  ('integracao_crm_cards','${uuid(47)}','UPDATE',null,'{"status":"Negociação"}','{"status":"Perdido"}',now()-interval '2 days');`);
 const p=await comercial(db,DIRETOR);
 assert.equal(p.fechamento.ganhos,2);
 assert.equal(p.fechamento.perdas,3);
 assert.equal(p.fechamento.desfechos_no_periodo,5);
 assert.equal(Number(p.fechamento.indice),40);
 const ana=p.fechamento.por_comercial.find(x=>x.comercial==='Ana Paula');
 assert.equal(ana.ganhos,1);assert.equal(ana.perdas,2);assert.equal(Number(ana.indice),33.3);
});

test('ativações desfeitas não contam e as do período trazem o valor',async()=>{
 const db=await banco();await funil(db);
 const p=await comercial(db,DIRETOR);
 assert.equal(p.ativacoes.quantidade,1);
 assert.equal(Number(p.ativacoes.valor),5500);
 assert.deepEqual(p.ativacoes.por_comercial.map(x=>x.comercial),['Ana Paula']);
});

test('follow-up atrasado, leads parados e clientes sem resposta são listados com o responsável',async()=>{
 const db=await banco();await funil(db);
 const p=await comercial(db,DIRETOR);
 assert.equal(p.followup.pendentes,1);
 assert.equal(p.followup.atrasados,1);
 assert.equal(p.followup.atrasados_lista[0].lead,'Maria Souza');
 assert.equal(p.followup.atrasados_lista[0].responsavel,'Ana Paula');
 assert.equal(p.followup.cards_sem_followup,3);
 // A última mensagem do card 41 é do cliente há 24 dias; a do 42 é resposta nossa.
 assert.deepEqual(p.mensagens.sem_resposta.map(x=>x.lead),['Maria Souza']);
 assert.equal(p.mensagens.sem_resposta[0].dias,24);
 assert.equal(p.mensagens.cards_sem_conversa,6);
 assert.deepEqual(p.parados.map(x=>x.lead),['João Lima']);
 assert.equal(p.parados[0].responsavel,null);
});

test('o período recorta o que é contado',async()=>{
 const db=await banco();await funil(db);
 const p=await comercial(db,DIRETOR,`(current_date-3),current_date,14,20`);
 assert.equal(p.fechamento.perdas,0,'as perdas de 5 e 6 dias atrás ficam fora da janela');
 assert.equal(p.fechamento.ganhos,1);
 assert.equal(p.ativacoes.quantidade,1);
});

test('institucionais trazem o motivo da perda e a cobertura fecha o quadro',async()=>{
 const db=await banco();await funil(db);
 const p=await comercial(db,DIRETOR);
 assert.deepEqual([p.institucionais.em_negociacao,p.institucionais.ganho,p.institucionais.perdido],[1,1,1]);
 assert.deepEqual(p.institucionais.motivos_perda,[{nome:'Prefeitura de X',motivo:'Preço acima do orçamento'}]);
 assert.equal(p.cobertura.cards,8);
 assert.equal(p.cobertura.sem_responsavel,2);
 assert.equal(p.cobertura.sem_telefone,8);
 assert.equal(p.cobertura.followups_registrados,2);
});

test('os dois painéis são só de leitura',async()=>{
 const db=await banco();await operacao(db);await funil(db);
 const contar=async()=>(await db.query(`select (select count(*) from public.processos_kanban) a,(select count(*) from public.metas) b,
   (select count(*) from public.integracao_crm_cards) c,(select count(*) from public.integracao_crm_auditoria) d`)).rows[0];
 const antes=await contar();
 await tecnico(db,DIRETOR);await comercial(db,DIRETOR);
 assert.deepEqual(await contar(),antes);
 const volatil=(await db.query(`select p.provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('integracao_agente_tecnico','integracao_agente_comercial')`)).rows;
 assert.deepEqual(volatil.map(v=>v.provolatile),['s','s'],'declaradas STABLE: o banco recusa qualquer escrita nelas');
});

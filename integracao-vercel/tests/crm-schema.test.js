import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration=readFileSync(new URL('../supabase/migrations/20260919141332_consolidacao_crm_funcionalidades.sql',import.meta.url),'utf8');
export async function prepararBanco(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;
 create table public.profiles(id uuid primary key,nome text,tipo text,ativo boolean default true);
 create table public.fin_receb_municipios(id uuid primary key,nome text,uf text);
 create table public.fin_receb_remessas(id uuid primary key,nome text,municipio_id uuid);
 create table public.fin_receb_clientes(id uuid primary key default gen_random_uuid(),nome text,cpf_cnpj text,codigo text,municipio_id uuid,remessa_id uuid);
 create table public.integracao_moradores(colecao text,registro_id text,referencia_id uuid,dados jsonb);
 create table public.integracao_nucleos(registro_id text,referencia_id uuid);
 create table public.processos_kanban(id uuid primary key,nucleo text);
 create table public.processos_kanban_andamentos(id uuid primary key default gen_random_uuid(),processo_id uuid,status text,status_operacional text,descricao_cliente text,observacao_interna text,previsao date,orientacao_ia text,visivel_ia boolean,data_atualizacao date,origem text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 alter table public.processos_kanban_andamentos enable row level security;
 create policy legado on public.processos_kanban_andamentos for select to authenticated using(true);
 alter table public.fin_receb_clientes enable row level security;
 alter table public.fin_receb_municipios enable row level security;
 alter table public.fin_receb_remessas enable row level security;
 grant select,insert,update on all tables in schema public to authenticated;
 grant all on all tables in schema public to service_role;
 insert into profiles(id,nome,tipo) values('${uuid(1)}','Admin','Administrador'),('${uuid(2)}','Ana','Comercial'),('${uuid(3)}','Bia','Comercial'),('${uuid(4)}','Pós','Pós-protocolo'),('${uuid(5)}','Marketing','Marketing'),('${uuid(6)}','Topografia','Topografia');
 insert into fin_receb_clientes(id,nome) values('${uuid(20)}','Cadastro preservado');
 insert into fin_receb_municipios(id,nome,uf) values('${uuid(30)}','Taió','SC');
 insert into processos_kanban(id,nucleo) values('${uuid(40)}','Núcleo exemplo');`);
 await db.exec(migration);
 await db.exec(readFileSync(new URL('../supabase/migrations/20260919153643_marketing_municipios.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20260919154451_semanal_origem.sql',import.meta.url),'utf8'));return db;
}
async function como(db,id,sql){await db.exec(`set role authenticated;set request.jwt.claim.sub='${uuid(id)}';`);try{return await db.query(sql);}finally{await db.exec('reset role;reset request.jwt.claim.sub;');}}
test('estrutura e RLS funcionam em PostgreSQL isolado sem migrar dados',async()=>{
 const db=await prepararBanco();try{
 assert.equal((await db.query('select count(*) from integracao_crm_cards')).rows[0].count,0);
 assert.equal((await db.query('select nome from fin_receb_clientes')).rows[0].nome,'Cadastro preservado');
 await como(db,2,`insert into fin_receb_clientes(id,nome) values('${uuid(21)}','Cliente novo Ana')`);
 await como(db,3,`insert into fin_receb_clientes(id,nome) values('${uuid(22)}','Cliente novo Bia')`);
 const cards=(await db.query('select * from integracao_crm_cards order by cliente_id')).rows;
 assert.equal(cards.length,2);assert.equal(cards[0].status,'Cliente novo');
 assert.equal((await como(db,2,'select * from integracao_crm_cards')).rows.length,1);
 assert.equal((await como(db,2,'select * from fin_receb_clientes')).rows.length,1);
 assert.equal((await como(db,3,'select * from fin_receb_clientes')).rows[0].nome,'Cliente novo Bia');
 assert.equal((await como(db,2,'select * from fin_receb_municipios')).rows.length,1);
 assert.equal((await como(db,4,'select * from fin_receb_municipios')).rows.length,1);
 assert.equal((await como(db,5,'select * from fin_receb_municipios')).rows.length,1);
 assert.equal((await como(db,1,'select * from integracao_crm_cards')).rows.length,2);
 assert.equal((await como(db,6,'select * from integracao_crm_cards')).rows.length,0);
 await assert.rejects(()=>como(db,2,`update integracao_crm_cards set responsavel_id='${uuid(3)}' where id='${cards[0].id}'`));
 await como(db,2,`update integracao_crm_cards set status='Negociação' where id='${cards[0].id}'`);
 await como(db,2,`insert into integracao_crm_tarefas(card_id,titulo,prazo) values('${cards[0].id}','Telefonar','2026-10-01')`);
 assert.equal((await como(db,3,'select * from integracao_crm_tarefas')).rows.length,0);
 await assert.rejects(()=>como(db,3,`insert into integracao_crm_atendimentos(card_id,data,relato) values('${cards[0].id}',now(),'Tentativa indevida')`));
 await assert.rejects(()=>como(db,3,`select integracao_crm_transferir('${cards[0].id}','${uuid(3)}')`));
 await como(db,2,`select integracao_crm_transferir('${cards[0].id}','${uuid(3)}')`);
 assert.equal((await como(db,2,'select * from integracao_crm_cards')).rows.length,0);
 assert.equal((await como(db,2,'select * from integracao_crm_tarefas')).rows.length,1);
 await assert.rejects(()=>como(db,2,`insert into integracao_semanal_municipios(municipio_id,semana_padrao) values('${uuid(30)}',1)`));
 await como(db,4,`insert into integracao_semanal_municipios(municipio_id,semana_padrao) values('${uuid(30)}',1)`);
 assert.equal((await como(db,2,'select * from integracao_semanal_municipios')).rows.length,0);
 await como(db,5,"insert into integracao_marketing_etapas(fase_numero,fase_nome,codigo,ordem,titulo) values(1,'Início','M1',1,'Boas-vindas')");
 assert.equal((await como(db,2,'select * from integracao_marketing_etapas')).rows.length,0);
 await assert.rejects(()=>como(db,2,`insert into processos_kanban_andamentos(processo_id) values('${uuid(40)}')`));
 await como(db,4,`insert into processos_kanban_andamentos(processo_id,descricao_cliente,observacao_interna,visivel_ia) values('${uuid(40)}','Texto público','SEGREDO',true)`);
 await assert.rejects(()=>como(db,2,"select integracao_crm_receber('{}')"));
 await db.exec(`set role service_role;`);
 const evento={instalacao:'teste',conta_id:1,conversa_id:2,contato_id:3,mensagem_id:4,nome:'Lead',data:new Date().toISOString(),conteudo:'Olá'};
 const call=()=>db.query('select integracao_crm_receber($1::jsonb) as id',[JSON.stringify(evento)]);
 const first=await call();const second=await call();assert.equal(first.rows[0].id,second.rows[0].id);
 await db.exec('reset role');assert.equal((await db.query('select count(*) from integracao_crm_mensagens')).rows[0].count,1);
 assert.ok((await db.query('select count(*) from integracao_crm_auditoria')).rows[0].count>0);
 await db.exec(`update profiles set ativo=false where id='${uuid(3)}'`);
 assert.equal((await como(db,3,'select * from integracao_crm_cards')).rows.length,0);
 }finally{await db.close();}
});
test('conversa confirmada consulta apenas andamento autorizado do núcleo e mantém cadastro',async()=>{
 const db=await prepararBanco();try{
 await db.exec(`insert into integracao_crm_cards(id,cliente_id,responsavel_id) values('${uuid(100)}','${uuid(20)}','${uuid(2)}');
 insert into integracao_moradores(colecao,registro_id,referencia_id,dados) values('processos','${uuid(20)}','${uuid(20)}','{"nucleoId":"n1","requerente":{"telefone":"preservado","statusCRM":"Cliente novo"}}');
 insert into integracao_nucleos values('n1','${uuid(40)}');
 insert into integracao_nucleo_ia values('${uuid(40)}','Não prometa prazo',true);
 insert into processos_kanban_andamentos(processo_id,descricao_cliente,observacao_interna,visivel_ia,data_atualizacao) values('${uuid(40)}','Informação autorizada','SEGREDO',true,'2026-09-19'),('${uuid(40)}','NÃO AUTORIZADO','Interno',false,'2026-09-19');
 set role service_role;`);
 const evento={instalacao:'teste',conta_id:1,conversa_id:2,contato_id:3,mensagem_id:4,nome:'Lead',data:new Date().toISOString(),conteudo:'Olá'};
 await db.query('select integracao_crm_receber($1::jsonb)',[JSON.stringify(evento)]);
 assert.equal((await db.query("select integracao_crm_contexto('teste',1,2) as x")).rows[0].x,null);
 await db.exec('reset role');
 const lead=(await db.query("select id from integracao_crm_cards where origem='chatwoot'")).rows[0].id;
 await como(db,1,`select integracao_crm_transferir('${lead}','${uuid(2)}')`);
 await como(db,2,`select integracao_crm_vincular('${lead}','${uuid(20)}')`);
 await db.exec('set role service_role');
 const context=(await db.query("select integracao_crm_contexto('teste',1,2) as x")).rows[0].x;
 assert.equal(context.andamentos.length,1);assert.equal(context.andamentos[0].descricao,'Informação autorizada');assert.ok(!JSON.stringify(context).includes('SEGREDO'));assert.ok(!JSON.stringify(context).includes('NÃO AUTORIZADO'));
 await db.query('select integracao_crm_receber($1::jsonb)',[JSON.stringify({...evento,conversa_id:5,mensagem_id:6})]);
 assert.ok((await db.query("select integracao_crm_contexto('teste',1,5) as x")).rows[0].x);
 await db.exec('reset role');
 await como(db,2,`update integracao_crm_cards set status='Contrato' where id='${uuid(100)}'`);
 const cadastro=(await db.query('select dados from integracao_moradores')).rows[0].dados;
 assert.equal(cadastro.requerente.telefone,'preservado');assert.equal(cadastro.requerente.statusCRM,'Contrato');
 assert.equal((await db.query('select nome from fin_receb_clientes')).rows[0].nome,'Cadastro preservado');
 assert.equal((await como(db,3,'select * from integracao_crm_mensagens')).rows.length,0);
 assert.equal((await como(db,2,'select * from integracao_crm_mensagens')).rows.length,2);
 }finally{await db.close();}
});
test('Gestão Semanal aprova exclusão sem apagar histórico e checklist não conclui incompleto',async()=>{
 const db=await prepararBanco();try{
 await como(db,2,`insert into fin_receb_clientes(id,nome) values('${uuid(21)}','Ana cliente')`);
 const card=(await db.query('select id from integracao_crm_cards')).rows[0].id;
 await assert.rejects(()=>como(db,2,`insert into integracao_crm_tarefas(card_id,titulo,prazo,checklist,concluida) values('${card}','Tarefa',current_date,'[{"texto":"Ligar","concluido":false}]',true)`));
 await como(db,4,`insert into integracao_semanal_municipios(id,municipio_id,semana_padrao) values('${uuid(50)}','${uuid(30)}',1)`);
 await como(db,4,`insert into integracao_semanal_semanas(id,municipio_id,ano,mes,semana,concluido) values('${uuid(51)}','${uuid(50)}',2026,9,1,true)`);
 assert.equal((await db.query('select concluido_por from integracao_semanal_semanas')).rows[0].concluido_por,uuid(4));
 await como(db,4,`insert into integracao_semanal_registros(semana_id,comentario) values('${uuid(51)}','Prefeitura retornou')`);
 await como(db,4,`insert into integracao_semanal_exclusoes(id,municipio_id,motivo) values('${uuid(52)}','${uuid(50)}','Concluído')`);
 await assert.rejects(()=>como(db,4,`select integracao_semanal_decidir('${uuid(52)}',true)`));
 await como(db,1,`select integracao_semanal_decidir('${uuid(52)}',true)`);
 assert.equal((await db.query('select ativo from integracao_semanal_municipios')).rows[0].ativo,false);
 assert.equal((await db.query('select count(*) from integracao_semanal_registros')).rows[0].count,1);
 await assert.rejects(()=>como(db,4,'delete from integracao_semanal_registros'));
 const security=(await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and (relname like 'integracao_crm_%' or relname like 'integracao_semanal_%' or relname like 'integracao_marketing_%')")).rows;
 assert.ok(security.every(t=>t.relrowsecurity));
 }finally{await db.close();}
});
test('Marketing municipal preserva autoria e datas importadas, sem duplicar nem aceitar dois vínculos',async()=>{
 const db=await prepararBanco();try{
 await db.exec(`insert into integracao_marketing_projetos(id,municipio_id,origem_id,origem_dados) values('${uuid(80)}','${uuid(30)}','crm:municipio','{"municipio":"Taió"}');
 insert into integracao_marketing_etapas(id,fase_numero,fase_nome,codigo,ordem,titulo) values('${uuid(81)}',1,'Comercial','1',1,'Atendimento');
 insert into integracao_marketing_progresso(projeto_id,etapa_id,concluida,concluida_em,concluida_por,origem_id) values('${uuid(80)}','${uuid(81)}',true,'2026-08-01T12:00:00Z','${uuid(5)}','crm:etapa');`);
 const p=(await como(db,5,'select * from integracao_marketing_progresso')).rows[0];
 assert.equal(p.concluida_por,uuid(5));assert.equal(new Date(p.concluida_em).toISOString(),'2026-08-01T12:00:00.000Z');
 await assert.rejects(()=>como(db,5,`insert into integracao_marketing_projetos(municipio_id) values('${uuid(30)}')`));
 await assert.rejects(()=>como(db,5,`insert into integracao_marketing_projetos(municipio_id,nucleo_id) values('${uuid(30)}','${uuid(40)}')`));
 assert.equal((await como(db,2,'select * from integracao_marketing_projetos')).rows.length,0);
 }finally{await db.close();}
});
test('Gestão Semanal conserva município ambíguo em revisão e autoria histórica sem inventar vínculo',async()=>{
 const db=await prepararBanco();try{
 await db.exec(`insert into integracao_semanal_municipios(id,semana_padrao,origem_id,origem_dados) values('${uuid(90)}',1,'crm:pendente','{"nome":"Barracão","estado":"PR"}');
 insert into integracao_semanal_semanas(id,municipio_id,ano,mes,semana,concluido,concluido_em,origem_id) values('${uuid(91)}','${uuid(90)}',2026,9,1,true,'2026-09-01T12:00:00Z','crm:semana');
 insert into integracao_semanal_registros(semana_id,comentario,created_by,created_at,origem_dados) values('${uuid(91)}','Relato original',null,'2026-09-01T11:59:00Z','{"autor_nome":"Autor do CRM"}');`);
 const c=(await como(db,4,'select * from integracao_semanal_municipios')).rows[0];assert.equal(c.municipio_id,null);assert.equal(c.origem_dados.estado,'PR');
 const r=(await como(db,4,'select * from integracao_semanal_registros')).rows[0];assert.equal(r.created_by,null);assert.equal(r.origem_dados.autor_nome,'Autor do CRM');assert.equal(new Date(r.created_at).toISOString(),'2026-09-01T11:59:00.000Z');
 await assert.rejects(()=>como(db,4,'insert into integracao_semanal_municipios(semana_padrao) values(2)'));
 assert.equal((await como(db,2,'select * from integracao_semanal_registros')).rows.length,0);
 }finally{await db.close();}
});

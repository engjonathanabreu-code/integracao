import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function prepararContrato(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,nome text,tipo text,setor text,ativo boolean,updated_at timestamptz default now());
 insert into profiles(id,nome,tipo,setor,ativo) select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Pessoa fictícia '||i,case i when 1 then 'Projetos' when 2 then 'Topografia' when 3 then 'Topografia' when 4 then 'Administrador' else 'Comercial' end,case i when 1 then 'Projetos' when 2 then 'Topografia' when 3 then 'Projetos' when 4 then 'Administrador' else 'Comercial' end,true from generate_series(1,17)i;
 create function public.is_erp_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;
 create function public.is_admin() returns boolean language sql stable as $$select public.is_erp_admin()$$;
 create table planos_trabalho(id uuid primary key,created_by uuid,titulo text,projeto_id uuid,status text);
 create table projetos(id uuid primary key,leitor uuid);alter table projetos enable row level security;grant select on projetos to authenticated;create policy projeto_escopo on projetos for select to authenticated using(leitor=auth.uid());
 insert into projetos values('${id(400)}','${id(1)}'),('${id(401)}','${id(4)}');
 create table etapas_plano(id uuid primary key,plano_id uuid,titulo text,status text);
 create table etapa_responsaveis(etapa_id uuid,usuario_id uuid,primary key(etapa_id,usuario_id));
 create table entregaveis(id uuid primary key,etapa_id uuid,titulo text,concluido boolean);
 create table comentarios_plano(id uuid primary key,plano_id uuid,autor_id uuid,texto text);
 create function public.can_access_plan(plano uuid) returns boolean language sql stable security definer as $$select public.is_admin() or exists(select 1 from public.etapas_plano e join public.etapa_responsaveis r on r.etapa_id=e.id join public.profiles p on p.id=r.usuario_id where e.plano_id=plano and r.usuario_id=auth.uid() and p.ativo)$$;
 create function public.is_stage_assignee(etapa uuid) returns boolean language sql stable security definer as $$select is_admin() or exists(select 1 from etapa_responsaveis where etapa_id=etapa and usuario_id=auth.uid())$$;
 create function public.integracao_acesso(tabela text,registro uuid,dono uuid) returns boolean language plpgsql stable as $$declare ok boolean;begin if not exists(select 1 from profiles where id=auth.uid() and ativo)then return false;end if;if tabela is null then return dono=auth.uid();end if;execute format('select exists(select 1 from public.%I where id=$1)',tabela) into ok using registro;return ok;end$$;
 create table fin_receb_clientes(id uuid primary key,nome text,ativo boolean default true,municipio_id uuid);
 create table fin_receb_remessas(id uuid primary key,nome text);
 create table fin_receb_municipios(id uuid primary key,nome text,uf text);
 create table processos_kanban(id uuid primary key,nucleo text,excluido_erp boolean default false,municipio text,estado text);
 create table metas(id uuid primary key,titulo text,status text,created_by uuid);
 create table ordens_servico(id uuid primary key,nome text);
 create table erp_conversas(id uuid primary key,titulo text,participantes uuid[]);
 create table erp_mensagens(id uuid primary key,conversa_id uuid,texto text,autor_id uuid);
 create table documentos(id uuid primary key,enviado_por uuid,etapa_plano_id uuid,nome text);
 create table integracao_configuracoes(colecao text,registro_id text,dados jsonb,primary key(colecao,registro_id));
 create table integracao_complementos(colecao text,registro_id text,dados jsonb,referencia_id uuid,primary key(colecao,registro_id));
 alter table integracao_complementos enable row level security;grant all on integracao_complementos to authenticated;create policy legado on integracao_complementos for all to authenticated using(exists(select 1 from profiles where id=auth.uid() and ativo)) with check(exists(select 1 from profiles where id=auth.uid() and ativo));
 grant select on profiles to authenticated;
 do $$declare t text;begin foreach t in array array['integracao_moradores','integracao_nucleos','integracao_remessas','integracao_metas','integracao_ordens_servico','integracao_planos','integracao_chat'] loop execute format('create table public.%I(colecao text,registro_id text,dados jsonb,referencia_tabela text,referencia_id uuid,criado_por uuid,primary key(colecao,registro_id))',t);end loop;end$$;
 do $$declare t text;begin foreach t in array array['fin_receb_clientes','fin_receb_remessas','processos_kanban','metas','ordens_servico','integracao_moradores','integracao_nucleos','integracao_remessas','integracao_metas','integracao_ordens_servico','integracao_planos','integracao_chat','documentos','erp_conversas','erp_mensagens','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano'] loop
 execute format('alter table public.%I enable row level security',t);execute format('grant all on public.%I to authenticated',t);
 if t not in ('planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','erp_conversas','erp_mensagens') then execute format('create policy legado on public.%I for all to authenticated using(exists(select 1 from profiles where id=auth.uid() and ativo)) with check(exists(select 1 from profiles where id=auth.uid() and ativo))',t);
 else execute format('create policy admin on public.%I for all to authenticated using(is_admin()) with check(is_admin())',t);end if;
 end loop;end$$;
 create policy ler_plano on planos_trabalho for select to authenticated using(can_access_plan(id));
 create policy ler_etapa on etapas_plano for select to authenticated using(can_access_plan(plano_id));
 create policy ler_responsavel on etapa_responsaveis for select to authenticated using(exists(select 1 from etapas_plano e where e.id=etapa_id and can_access_plan(e.plano_id)));
 create policy ler_chat on erp_conversas for select to authenticated using(auth.uid()=any(participantes));
 create policy ler_mensagem on erp_mensagens for select to authenticated using(exists(select 1 from erp_conversas c where c.id=conversa_id));
 insert into planos_trabalho values('${id(100)}','${id(4)}','Plano acessível',null,'Em andamento'),('${id(101)}','${id(4)}','Plano alheio',null,'Em andamento');
 insert into etapas_plano values('${id(110)}','${id(100)}','Etapa acessível','Pendente'),('${id(111)}','${id(101)}','Etapa alheia','Pendente');
 insert into etapa_responsaveis values('${id(110)}','${id(1)}');
 insert into fin_receb_clientes(id,nome,ativo) values('${id(200)}','Pessoa fictícia',true);
 insert into processos_kanban(id,nucleo,excluido_erp) values('${id(201)}','Núcleo fictício',false);
 insert into metas values('${id(202)}','Meta fictícia','Aguardando aprovação','${id(4)}');
 insert into ordens_servico values('${id(203)}','OS fictícia');
 insert into integracao_moradores values('processos','${id(200)}','{"etapa":0,"situacao":"Ativo","checks":{},"campos":{},"requerente":{"nome":"Pessoa fictícia"},"docs":[]}',null,null,'${id(4)}');
 insert into erp_conversas values('${id(300)}','Conversa acessível',array['${id(3)}']::uuid[]),('${id(301)}','Conversa alheia',array['${id(4)}']::uuid[]);
 `);
 const antes=(await db.query(`select md5(string_agg(row(id,tipo,setor,ativo)::text,',' order by id)) hash from profiles`)).rows[0].hash;
 await db.exec(readFileSync(new URL('./atribuicoes-etapa1.fixture.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20261014113728_atribuicoes_contrato_especifico.sql',import.meta.url),'utf8'));
 const regras=[{planos:{ler:true,criar:true,editar:true,exportar:true},clientes:{ler:true,criar:true,editar:true,exportar:true,excluir:true},nucleos:{ler:true,criar:true,editar:true,exportar:true,excluir:true},remessas:{ler:true,criar:true,editar:true,exportar:true,excluir:true},metas:{ler:true,aprovar:false,exportar:false,excluir:false},ordens_servico:{ler:true,exportar:false,excluir:false}},
 {clientes:{ler:true,criar:true,editar:true,exportar:false,excluir:false},nucleos:{ler:true,criar:true,editar:true,exportar:false,excluir:false},remessas:{ler:true,criar:true,editar:true,exportar:false,excluir:false}},
 {chat:{ler:true,criar:true,exportar:false,excluir:false},documentos:{ler:true,criar:true,editar:true,exportar:false,excluir:false}}];
 for(let i=0;i<3;i++)await db.query(`insert into integracao_atribuicoes_privado.contratos(usuario_id,revisao_perfil,regras,origem_sha256) select id,md5(row(id,tipo,setor,ativo,updated_at)::text),$2,'fixture' from profiles where id=$1`,[id(i+1),JSON.stringify(regras[i])]);
 return {db,antes};
}
export async function como(db,n,sql,args=[]){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${n?id(n):''}',false);set role ${n?'authenticated':'anon'};`);try{return (await db.query(sql,args)).rows;}finally{await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);");}}

-- Effective contracts are separate from editable proposals. No business rows are rewritten.
create schema integracao_atribuicoes_privado;
revoke all on schema integracao_atribuicoes_privado from public,anon;
grant usage on schema integracao_atribuicoes_privado to authenticated;
create table integracao_atribuicoes_privado.contratos(
 usuario_id uuid primary key,revisao_perfil text not null,regras jsonb not null check(jsonb_typeof(regras)='object'),
 pendencias jsonb not null default '[]',origem_sha256 text not null,criado_em timestamptz not null default clock_timestamp()
);
create table integracao_atribuicoes_privado.auditoria(
 id bigint generated always as identity primary key,ator uuid,executor text not null default session_user,
 evento text not null,recurso text,acao text,registro text,antes_hash text,depois_hash text,
 origem_sha256 text,criado_em timestamptz not null default clock_timestamp()
);
alter table integracao_atribuicoes_privado.contratos enable row level security;
alter table integracao_atribuicoes_privado.auditoria enable row level security;
revoke all on all tables in schema integracao_atribuicoes_privado from public,anon,authenticated;

create function integracao_atribuicoes_privado.escolha(recurso text,acao text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c integracao_atribuicoes_privado.contratos;p public.profiles;
begin
 select * into c from integracao_atribuicoes_privado.contratos where usuario_id=auth.uid();
 if not found then return null;end if;
 select * into p from public.profiles where id=auth.uid();
 if not found or p.ativo is not true then return false;end if;
 if md5(row(p.id,p.tipo,p.setor,p.ativo,p.updated_at)::text)<>c.revisao_perfil then return false;end if;
 return (c.regras#>>array[recurso,acao])::boolean;
end $$;
create function integracao_atribuicoes_privado.permitido(recurso text,acao text,herdado boolean default true) returns boolean
language sql stable security invoker set search_path='' as $$select coalesce(integracao_atribuicoes_privado.escolha(recurso,acao),herdado)$$;
create function integracao_atribuicoes_privado.contratado() returns boolean
language sql stable security definer set search_path='' as $$select exists(select 1 from integracao_atribuicoes_privado.contratos where usuario_id=auth.uid())$$;

create function public.integracao_atribuicoes_contrato_ler(p_usuario uuid default auth.uid()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c integracao_atribuicoes_privado.contratos;p public.profiles;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo) then raise exception 'Perfil ativo necessário' using errcode='42501';end if;
 if p_usuario is distinct from auth.uid() and not public.is_erp_admin() then raise exception 'Somente a administração consulta outro contrato' using errcode='42501';end if;
 select * into c from integracao_atribuicoes_privado.contratos where usuario_id=p_usuario;
 if not found then return jsonb_build_object('regras','{}'::jsonb,'pendencias','[]'::jsonb);end if;
 select * into p from public.profiles where id=p_usuario;
 return jsonb_build_object('regras',c.regras,'pendencias',c.pendencias,'origem_sha256',c.origem_sha256,'revisao_perfil',c.revisao_perfil,
 'revisao_compativel',md5(row(p.id,p.tipo,p.setor,p.ativo,p.updated_at)::text)=c.revisao_perfil);
end $$;

-- Scope is checked with the caller's current RLS. Permission to export never grants read access.
create function public.integracao_atribuicoes_autorizar(p_recurso text,p_acao text,p_tabela text default null,p_registro uuid default null) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo) then return false;end if;
 if p_recurso not in ('clientes','nucleos','remessas','planos','metas','ordens_servico','chat','documentos') or p_acao not in ('ler','criar','editar','aprovar','exportar','excluir') then raise exception 'Ação desconhecida';end if;
 if p_acao='aprovar' and p_recurso<>'metas' then raise exception 'Aprovação disponível somente em Metas';end if;
 if not integracao_atribuicoes_privado.permitido(p_recurso,p_acao) then return false;end if;
 if p_tabela is not null and not public.integracao_acesso(p_tabela,p_registro,auth.uid()) then return false;end if;
 return true;
end $$;

create function integracao_atribuicoes_privado.escopo_plano(plano uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and ativo) and
 (public.can_access_plan(plano) or (integracao_atribuicoes_privado.escolha('planos','criar') is true and exists(select 1 from public.planos_trabalho where id=plano and created_by=auth.uid())))
$$;
create policy atribuicoes_plano_proprio on public.planos_trabalho for select to authenticated using(integracao_atribuicoes_privado.escolha('planos','ler') is true and created_by=auth.uid());
create policy atribuicoes_plano_criar on public.planos_trabalho for insert to authenticated with check(integracao_atribuicoes_privado.escolha('planos','criar') is true and created_by=auth.uid() and (projeto_id is null or exists(select 1 from public.projetos pr where pr.id=planos_trabalho.projeto_id)));
create policy atribuicoes_plano_editar on public.planos_trabalho for update to authenticated using(integracao_atribuicoes_privado.escolha('planos','editar') is true and integracao_atribuicoes_privado.escopo_plano(id)) with check(integracao_atribuicoes_privado.escolha('planos','editar') is true and integracao_atribuicoes_privado.escopo_plano(id) and (projeto_id is null or exists(select 1 from public.projetos pr where pr.id=planos_trabalho.projeto_id)));
create policy atribuicoes_etapa_ler on public.etapas_plano for select to authenticated using(integracao_atribuicoes_privado.escolha('planos','ler') is true and integracao_atribuicoes_privado.escopo_plano(plano_id));
create policy atribuicoes_etapa_criar on public.etapas_plano for insert to authenticated with check(integracao_atribuicoes_privado.escolha('planos','criar') is true and integracao_atribuicoes_privado.escopo_plano(plano_id));
create policy atribuicoes_etapa_editar on public.etapas_plano for update to authenticated using(integracao_atribuicoes_privado.escolha('planos','editar') is true and integracao_atribuicoes_privado.escopo_plano(plano_id)) with check(integracao_atribuicoes_privado.escolha('planos','editar') is true and integracao_atribuicoes_privado.escopo_plano(plano_id));
do $$declare t text;col text;begin
 foreach t in array array['etapa_responsaveis','entregaveis'] loop
  col:='etapa_id';
  execute format('create policy atribuicoes_plano_ler on public.%I for select to authenticated using (integracao_atribuicoes_privado.escolha(''planos'',''ler'') is true and exists(select 1 from public.etapas_plano e where e.id=%I and integracao_atribuicoes_privado.escopo_plano(e.plano_id)))',t,col);
  execute format('create policy atribuicoes_plano_criar on public.%I for insert to authenticated with check (integracao_atribuicoes_privado.escolha(''planos'',''editar'') is true and exists(select 1 from public.etapas_plano e where e.id=%I and integracao_atribuicoes_privado.escopo_plano(e.plano_id)))',t,col);
  execute format('create policy atribuicoes_plano_editar on public.%I for update to authenticated using (integracao_atribuicoes_privado.escolha(''planos'',''editar'') is true and exists(select 1 from public.etapas_plano e where e.id=%I and integracao_atribuicoes_privado.escopo_plano(e.plano_id))) with check (integracao_atribuicoes_privado.escolha(''planos'',''editar'') is true and exists(select 1 from public.etapas_plano e where e.id=%I and integracao_atribuicoes_privado.escopo_plano(e.plano_id)))',t,col,col);
 end loop;
end $$;
-- Removing a responsibility is an edit of an already accessible plan, not deleting the plan.
create policy atribuicoes_responsavel_remover on public.etapa_responsaveis for delete to authenticated using(integracao_atribuicoes_privado.escolha('planos','editar') is true and exists(select 1 from public.etapas_plano e where e.id=etapa_id and integracao_atribuicoes_privado.escopo_plano(e.plano_id)));
-- The existing assignee selector lists active visible profiles. Editing a plan does
-- not authorize assigning an inactive or invisible account through direct REST.
create policy atribuicoes_responsavel_ativo on public.etapa_responsaveis as restrictive for insert to authenticated with check(integracao_atribuicoes_privado.escolha('planos','editar') is distinct from true or exists(select 1 from public.profiles p where p.id=usuario_id and p.ativo));
create policy atribuicoes_responsavel_editar_ativo on public.etapa_responsaveis as restrictive for update to authenticated with check(integracao_atribuicoes_privado.escolha('planos','editar') is distinct from true or exists(select 1 from public.profiles p where p.id=usuario_id and p.ativo));

-- RESTRICTIVE policies intersect every existing permissive route.
do $$declare t text;r text;begin
 for t,r in select * from (values ('fin_receb_clientes','clientes'),('integracao_moradores','clientes'),('processos_kanban','nucleos'),('integracao_nucleos','nucleos'),('fin_receb_remessas','remessas'),('integracao_remessas','remessas'),('metas','metas'),('integracao_metas','metas'),('ordens_servico','ordens_servico'),('integracao_ordens_servico','ordens_servico'),('erp_conversas','chat'),('erp_mensagens','chat'),('integracao_chat','chat'),('documentos','documentos')) q loop
  execute format('create policy atribuicoes_excluir on public.%I as restrictive for delete to authenticated using(integracao_atribuicoes_privado.permitido(%L,''excluir''))',t,r);
 end loop;
end $$;

-- Resolve the current municipal configuration on the server. Only manual requirements
-- and operational fields of this stage are writable; automatic checks never are.
-- BEGIN EXISTING WORKFLOW EVALUATION
create function integracao_atribuicoes_privado.padroes_fluxo() returns jsonb language sql immutable set search_path='' as $$select $padroes${"campos":{"secoes":[{"id":"sec_ocupacao","nome":"Ocupação do imóvel","setor":"topografia"}],"lista":[{"id":"cp_contato","secao":"requerente","rotulo":"Melhor horário para contato","tipo":"selecao","opcoes":["Manhã","Tarde","Noite"],"ajuda":"","obrigatorioEtapa":"","repetir":false,"subcampos":[],"ativo":true},{"id":"cp_familia","secao":"social","rotulo":"Composição familiar","tipo":"grupo","opcoes":[],"ajuda":"Uma linha por pessoa da família que mora no imóvel, incluindo o requerente.","obrigatorioEtapa":"documental","repetir":true,"ativo":true,"subcampos":[{"id":"s_nome","rotulo":"Nome","tipo":"texto","opcoes":[]},{"id":"s_parentesco","rotulo":"Parentesco","tipo":"selecao","opcoes":["Requerente","Cônjuge","Filho(a)","Pai ou mãe","Outro"]},{"id":"s_nascimento","rotulo":"Nascimento","tipo":"data","opcoes":[]}]},{"id":"cp_uso","secao":"sec_ocupacao","rotulo":"Uso do imóvel","tipo":"selecao","opcoes":["Residencial","Comercial","Misto","Institucional"],"ajuda":"","obrigatorioEtapa":"topografia","repetir":false,"subcampos":[],"ativo":true},{"id":"cp_inicio","secao":"sec_ocupacao","rotulo":"Ano de início da posse","tipo":"numero","opcoes":[],"ajuda":"Ano informado pelo morador ou pelo documento de posse.","obrigatorioEtapa":"","repetir":false,"subcampos":[],"ativo":true},{"id":"cp_edificacoes","secao":"sec_ocupacao","rotulo":"Edificações no lote","tipo":"grupo","opcoes":[],"ajuda":"","obrigatorioEtapa":"","repetir":true,"ativo":true,"subcampos":[{"id":"s_tipo","rotulo":"Tipo","tipo":"selecao","opcoes":["Casa","Galpão","Garagem","Outro"]},{"id":"s_material","rotulo":"Material","tipo":"selecao","opcoes":["Alvenaria","Madeira","Mista"]},{"id":"s_area","rotulo":"Área construída (m²)","tipo":"numero","opcoes":[]}]}]},"checklist":[{"id":"ck_agua","grupo":"Infraestrutura","rotulo":"Rede de água","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_energia","grupo":"Infraestrutura","rotulo":"Energia elétrica","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_esgoto","grupo":"Infraestrutura","rotulo":"Rede de esgoto ou fossa","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_pavimento","grupo":"Infraestrutura","rotulo":"Rua pavimentada","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_lixo","grupo":"Infraestrutura","rotulo":"Coleta de lixo","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_iluminacao","grupo":"Infraestrutura","rotulo":"Iluminação pública","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_drenagem","grupo":"Infraestrutura","rotulo":"Drenagem pluvial","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_ocupado","grupo":"Imóvel","rotulo":"Imóvel ocupado no momento da visita","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_edificacoes","grupo":"Imóvel","rotulo":"Número de edificações no lote","tipo":"numero","obrigatorio":true,"ativo":true},{"id":"ck_limites","grupo":"Imóvel","rotulo":"Limites do lote conferidos com vizinhos","tipo":"check","obrigatorio":true,"ativo":true},{"id":"ck_risco","grupo":"Imóvel","rotulo":"Sinal aparente de área de risco","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_presente","grupo":"Morador","rotulo":"Morador presente na visita","tipo":"simnao","obrigatorio":true,"ativo":true},{"id":"ck_confirmou","grupo":"Morador","rotulo":"Dados do cadastro confirmados com o morador","tipo":"check","obrigatorio":true,"ativo":true},{"id":"ck_obs","grupo":"Morador","rotulo":"Observações de campo","tipo":"texto","obrigatorio":false,"ativo":true}]}$padroes$::jsonb$$;
-- Internal evaluators for the existing Topografia/Projeto contract only.
-- Other profiles keep their current policies and workflows.
create function integracao_atribuicoes_privado.texto(v jsonb) returns text language plpgsql immutable set search_path='' as $$
declare x jsonb;s text:='';primeiro boolean:=true;
begin
 if v is null or v='null'::jsonb then return '';end if;
 case jsonb_typeof(v)
 when 'string' then return v#>>'{}';
 when 'object' then return '[object Object]';
 when 'array' then
  for x in select value from jsonb_array_elements(v) loop
   if not primeiro then s:=s||',';end if;primeiro:=false;s:=s||integracao_atribuicoes_privado.texto(x);
  end loop;return s;
 else return v::text;end case;
end $$;
create function integracao_atribuicoes_privado.travar_fluxo(chave text) returns void language plpgsql set search_path='' as $$
declare normal text;
begin
 if coalesce(chave,'')='' then return;end if;
 select coalesce(referencia_id::text,registro_id) into normal from public.integracao_nucleos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;
 if normal is null then select coalesce(referencia_id::text,registro_id) into normal from public.integracao_complementos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('integracao-fluxo:'||coalesce(normal,chave),0)) then raise exception 'O fluxo deste nucleo mudou em outra sessao. Recarregue e tente novamente.' using errcode='PT409';end if;
end $$;
create function integracao_atribuicoes_privado.avaliar_nucleo(n jsonb,etapa integer,config jsonb,ativos integer,prontos integer) returns jsonb language plpgsql immutable set search_path='' as $$
declare base jsonb;nome text;chave text;campos jsonb:=coalesce(n->'campos','{}');
begin
 nome:=case etapa when 1 then 'topografia' when 2 then 'projeto' else null end;
 if nome is null then raise exception 'Etapa do nucleo fora do contrato setorial';end if;
 base:=jsonb_build_array(jsonb_build_object('id','moradores','tipo','auto','ok',ativos>0 and ativos=prontos));
 if etapa=2 then
  base:=base||jsonb_build_array(jsonb_build_object('id','artPrf','tipo','campo','ok',integracao_atribuicoes_privado.preenchido(campos->'artPrf')),
   jsonb_build_object('id','estudoAmbiental','tipo','escolha','ok',coalesce(campos->>'estudoAmbiental','') in ('sim','nao')),
   jsonb_build_object('id','estudoRisco','tipo','escolha','ok',coalesce(campos->>'estudoRisco','') in ('sim','nao')),
   jsonb_build_object('id','termos','tipo','manual','ok',integracao_atribuicoes_privado.verdadeiro(n#>'{checks,termos}')));
  if campos->>'estudoAmbiental'='sim' then base:=base||jsonb_build_array(jsonb_build_object('id','artAmbiental','tipo','campo','ok',integracao_atribuicoes_privado.preenchido(campos->'artAmbiental')));end if;
 end if;
 return integracao_atribuicoes_privado.avaliar_lista(base,n,coalesce(config->'ajustes'->('nucleo:'||nome),'{}'),coalesce((config->>'municipal')::boolean,false));
end $$;
create function integracao_atribuicoes_privado.normalizar_municipio(v text) returns text language sql immutable set search_path='' as $$select lower(trim(regexp_replace(normalize(coalesce(v,''),NFD),U&'[\0300-\036f]','','g')))$$;
create function integracao_atribuicoes_privado.validar_nucleo(antes jsonb,depois jsonb,chave text,referencia uuid,tipo_perfil text,operacao text) returns void language plpgsql security definer set search_path='' as $$
declare etapa integer:=coalesce((antes->>'etapa')::integer,0);nova integer:=coalesce((depois->>'etapa')::integer,0);nome text;config jsonb;ajuste jsonb;municipio text;municipio_nome text;municipio_uf text;municipios integer;chaves text[];campos text[];campo text;ativos integer;prontos integer;falhas jsonb;aliases text[];
begin
 if operacao='INSERT' and coalesce((depois->>'etapa')::integer,0)=0 and coalesce(depois->'checks','{}')='{}'::jsonb and coalesce(depois->'campos','{}')='{}'::jsonb then return;end if;
 if not ((etapa=1 and tipo_perfil='Topografia') or (etapa=2 and tipo_perfil='Projetos')) then raise exception 'Fluxo setorial do nucleo preservado' using errcode='42501';end if;
 if abs(nova-etapa)>1 then raise exception 'Nao e permitido pular etapas do nucleo' using errcode='42501';end if;
 perform integracao_atribuicoes_privado.travar_fluxo(coalesce(referencia::text,chave));
 if nova<etapa and (length(trim(coalesce(depois#>>'{reaberturaFluxo,motivo}','')))<3 or depois#>>'{reaberturaFluxo,de}' is distinct from etapa::text or depois#>>'{reaberturaFluxo,para}' is distinct from nova::text or antes->'reaberturaFluxo' is not distinct from depois->'reaberturaFluxo') then raise exception 'Retrocesso do nucleo exige motivo novo' using errcode='42501';end if;
 select k.municipio,coalesce(nullif(k.estado,''),'SC') into municipio_nome,municipio_uf from public.processos_kanban k where k.id=referencia or k.id::text=chave;
 if found then
  if nullif(trim(municipio_nome),'') is null then raise exception 'Municipio canonico do nucleo ausente' using errcode='PT409';end if;
  select count(*)::integer,min(m.id::text) into municipios,municipio from public.fin_receb_municipios m where integracao_atribuicoes_privado.normalizar_municipio(m.nome)=integracao_atribuicoes_privado.normalizar_municipio(municipio_nome) and coalesce(nullif(m.uf,''),'SC')=municipio_uf;
  if municipios>1 then raise exception 'Municipio canonico ambiguo' using errcode='PT409';end if;
  if municipios=0 then municipio:='municipio_'||integracao_atribuicoes_privado.normalizar_municipio(municipio_nome)||'_'||municipio_uf;end if;
 else municipio:=coalesce(antes->>'municipioId',depois->>'municipioId');end if;
 config:=integracao_atribuicoes_privado.config_fluxo(municipio);nome:=case etapa when 1 then 'topografia' else 'projeto' end;ajuste:=coalesce(config->'ajustes'->('nucleo:'||nome),'{}');
 chaves:=case etapa when 2 then array['termos'] else '{}'::text[] end;
 select coalesce(array_agg(x),'{}') into chaves from unnest(chaves) x where not coalesce(ajuste->'desativados','[]') ? x;
 select chaves||coalesce(array_agg(e->>'id'),'{}') into chaves from jsonb_array_elements(integracao_atribuicoes_privado.lista(ajuste->'extras')) e where coalesce(e->>'tipo','manual')<>'campo';
 campos:=case etapa when 2 then array['artPrf','estudoAmbiental','artAmbiental','estudoRisco'] else '{}'::text[] end;
 select campos||coalesce(array_agg(e->>'id'),'{}') into campos from jsonb_array_elements(integracao_atribuicoes_privado.lista(ajuste->'extras')) e where e->>'tipo'='campo';
 for campo in select jsonb_object_keys(coalesce(antes->'checks','{}')||coalesce(depois->'checks','{}')) loop
  if antes#>array['checks',campo] is distinct from depois#>array['checks',campo] and (not(campo=any(chaves)) or coalesce(jsonb_typeof(depois#>array['checks',campo]),'null') not in ('boolean','null')) then raise exception 'Requisito do nucleo automatico ou de outra etapa' using errcode='42501';end if;
 end loop;
 for campo in select jsonb_object_keys(coalesce(antes->'campos','{}')||coalesce(depois->'campos','{}')) loop
  if antes#>array['campos',campo] is distinct from depois#>array['campos',campo] and not(campo=any(campos)) then raise exception 'Campo do nucleo de outra etapa' using errcode='42501';end if;
 end loop;
 if nova>etapa then
  aliases:=array[chave,referencia::text];
  with candidatos as (select colecao,registro_id,dados,referencia_id,1 prioridade from public.integracao_moradores union all select colecao,registro_id,dados,referencia_id,2 from public.integracao_complementos),
  atuais as (select distinct on(colecao,registro_id) * from candidatos where colecao='processos' order by colecao,registro_id,prioridade),
  membros as (select e.dados from atuais e left join public.fin_receb_clientes c on c.id=e.referencia_id where e.dados->>'nucleoId'=any(aliases) and coalesce(c.ativo,true) and coalesce(e.dados->>'situacao','Ativo')='Ativo' and e.dados#>'{extras,arquivamento,ativo}' is distinct from 'true'::jsonb)
  select count(*)::integer,count(*) filter(where coalesce((dados->>'etapa')::integer,0)>=case etapa when 1 then 4 else 5 end)::integer into ativos,prontos from membros;
  falhas:=integracao_atribuicoes_privado.avaliar_nucleo(depois,etapa,config,ativos,prontos);
  if jsonb_array_length(falhas)>0 then raise exception 'Requisitos do nucleo ainda pendentes. Atualize os dados.' using errcode='PT409',detail=falhas::text;end if;
 end if;
end $$;
create function integracao_atribuicoes_privado.preenchido(v jsonb) returns boolean language sql immutable set search_path='' as $$select nullif(trim(integracao_atribuicoes_privado.texto(v)),'') is not null$$;
create function integracao_atribuicoes_privado.verdadeiro(v jsonb) returns boolean language sql immutable set search_path='' as $$select case when v is null or v='null'::jsonb or v='false'::jsonb or v='0'::jsonb or v='""'::jsonb then false else true end$$;
create function integracao_atribuicoes_privado.lista(v jsonb) returns jsonb language sql immutable set search_path='' as $$select case when jsonb_typeof(v)='array' then v else '[]'::jsonb end$$;
create function integracao_atribuicoes_privado.numero(v jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare s text:=trim(integracao_atribuicoes_privado.texto(v));n numeric;
begin
 if s='' then return null;end if;
 if position(',' in s)>0 then s:=replace(replace(s,'.',''),',','.');end if;
 begin n:=s::numeric;exception when others then return null;end;
 if n::text in ('NaN','Infinity','-Infinity') then return null;end if;return n;
end $$;
create function integracao_atribuicoes_privado.campo_preenchido(def jsonb,v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare linha jsonb;sub jsonb;
begin
 if def->>'tipo'='grupo' then
  if integracao_atribuicoes_privado.verdadeiro(def->'repetir') then
   if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then return false;end if;
   for linha in select value from jsonb_array_elements(v) loop
    for sub in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(def->'subcampos')) loop
     if not integracao_atribuicoes_privado.preenchido(linha->(sub->>'id')) then return false;end if;
    end loop;
   end loop;
  else
   for sub in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(def->'subcampos')) loop
    if not integracao_atribuicoes_privado.preenchido(v->(sub->>'id')) then return false;end if;
   end loop;
  end if;return true;
 end if;return integracao_atribuicoes_privado.preenchido(v);
end $$;
create function integracao_atribuicoes_privado.config_valor(chave text) returns jsonb language plpgsql security definer set search_path='' as $$
declare atual jsonb;legado jsonb;
begin
 select dados->'valor' into atual from public.integracao_configuracoes where colecao='config' and registro_id=chave;
 if found then return atual;end if;
 select dados->'valor' into legado from public.integracao_complementos where colecao='config' and registro_id=chave;
 return legado;
end $$;
create function integracao_atribuicoes_privado.config_fluxo(municipio text) returns jsonb language plpgsql security definer set search_path='' as $$
declare local_config jsonb;padrao jsonb:=integracao_atribuicoes_privado.padroes_fluxo();ajustes jsonb;municipal boolean;
begin
 local_config:=integracao_atribuicoes_privado.config_valor('ajustesMunicipio')->municipio;
 municipal:=nullif(local_config->'ajustesRequisitos','null'::jsonb) is not null;
 ajustes:=coalesce(nullif(local_config->'ajustesRequisitos','null'::jsonb),integracao_atribuicoes_privado.config_valor('ajustesRequisitos'),'{}');
 return jsonb_build_object('ajustes',ajustes,'municipal',municipal,
 'campos',coalesce(nullif(local_config->'campos','null'::jsonb),integracao_atribuicoes_privado.config_valor('campos'),padrao->'campos'),
 'checklist',coalesce(nullif(local_config->'checklistCampo','null'::jsonb),integracao_atribuicoes_privado.config_valor('checklistCampo'),padrao->'checklist'));
end $$;
create function integracao_atribuicoes_privado.nucleo_fluxo(chave text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;referencia uuid;k public.processos_kanban;
begin
 if coalesce(chave,'')='' then return null;end if;
 select dados,referencia_id into d,referencia from public.integracao_nucleos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;
 if d is null then
  select dados,referencia_id into d,referencia from public.integracao_complementos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;
 end if;
 select * into k from public.processos_kanban where id::text=chave or id=referencia limit 1;
 if d is null and k.id is null then return null;end if;
 if coalesce(k.excluido_erp,false) or d#>'{extras,arquivamento,ativo}'='true'::jsonb then return null;end if;
 return coalesce(d,'{}')||jsonb_build_object('id',chave,'etapa',coalesce(d->'etapa','0'::jsonb));
end $$;
create function integracao_atribuicoes_privado.avaliar_lista(base jsonb,p jsonb,ajuste jsonb,municipal boolean) returns jsonb language plpgsql immutable set search_path='' as $$
declare req jsonb;chave text;fixo boolean;ok boolean;tipo text;falhas jsonb:='[]';
begin
 for req in select value from jsonb_array_elements(base) loop
  chave:=req->>'id';fixo:=coalesce((req->>'fixo')::boolean,false) and not municipal;
  if not fixo and coalesce(ajuste->'desativados','[]') ? chave then continue;end if;
  ok:=coalesce((req->>'ok')::boolean,false);tipo:=req->>'tipo';
  if not fixo and coalesce(ajuste->'opcionais','[]') ? chave then ok:=true;if tipo<>'auto' then tipo:='marcador';end if;end if;
  if tipo='marcador' and coalesce(ajuste->'obrigatorios','[]') ? chave then ok:=integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave);end if;
  if not ok then falhas:=falhas||jsonb_build_array(chave);end if;
 end loop;
 for req in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(ajuste->'extras')) loop
  chave:=req->>'id';ok:=case when req->>'tipo'='campo' then integracao_atribuicoes_privado.preenchido(p->'campos'->chave) when integracao_atribuicoes_privado.verdadeiro(req->'opcional') then true else integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave) end;
  if not ok then falhas:=falhas||jsonb_build_array(chave);end if;
 end loop;return falhas;
end $$;
create function integracao_atribuicoes_privado.avaliar_fluxo(p jsonb,etapa integer,config jsonb,nucleo jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare base jsonb:='[]';falhas jsonb:='[]';req jsonb;def jsonb;item jsonb;linha jsonb;unidades jsonb;ajuste jsonb;nome text;chave text;lado text;valor jsonb;ok boolean;fixo boolean;opcional boolean;tipo text;confrontantes boolean:=true;info_campo boolean:=true;area boolean:=true;memorial boolean:=true;lote boolean:=true;
begin
 nome:=case etapa when 3 then 'topografia' when 4 then 'projeto' else null end;
 if nome is null then raise exception 'Etapa fora do contrato setorial';end if;
 ajuste:=coalesce(config->'ajustes'->nome,'{}');
 unidades:=integracao_atribuicoes_privado.lista(p->'unidades');
 if jsonb_array_length(unidades)=0 then unidades:=jsonb_build_array(jsonb_build_object('area','','memorial','','loteQuadra',p#>'{campos,loteQuadra}'));end if;
 for item in select value from jsonb_array_elements(unidades) loop
  area:=area and coalesce(integracao_atribuicoes_privado.numero(item->'area')>0,false);
  valor:=to_jsonb(trim(integracao_atribuicoes_privado.texto(item->'memorial')));
  memorial:=memorial and char_length(valor#>>'{}')+char_length(regexp_replace(valor#>>'{}',U&'[^\+010000-\+10FFFF]','','g'))>=40;
  lote:=lote and integracao_atribuicoes_privado.preenchido(item->'loteQuadra');
 end loop;
 if etapa=3 then
  for chave,lado in select * from (values ('2be328c2-7ccd-4448-a942-cfc6f62631fc','frente'),('bbb40008-d693-4be1-8021-613da327e8ce','fundo'),('d7d5ae44-f5af-4970-9d21-081840964ece','direito'),('0ca10151-b790-409b-a056-c9f8a963f3dc','esquerdo')) c loop
   valor:=case when coalesce(p->'extras','{}') ? chave then p->'extras'->chave else p#>array['campo','confrontantes',lado] end;
   confrontantes:=confrontantes and integracao_atribuicoes_privado.preenchido(valor);
  end loop;
  for item in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(config->'checklist')) loop
   if integracao_atribuicoes_privado.verdadeiro(item->'ativo') and integracao_atribuicoes_privado.verdadeiro(item->'obrigatorio') then
    valor:=p#>array['campo','respostas',item->>'id'];
    ok:=case item->>'tipo' when 'check' then valor='true'::jsonb when 'simnao' then valor in ('"sim"'::jsonb,'"nao"'::jsonb) else integracao_atribuicoes_privado.preenchido(valor) end;
    info_campo:=info_campo and coalesce(ok,false);
   end if;
  end loop;
  base:=jsonb_build_array(jsonb_build_object('id','confrontantes','tipo','auto','fixo',true,'ok',confrontantes),
   jsonb_build_object('id','nucleo','tipo','auto','ok',nucleo is not null),
   jsonb_build_object('id','foto_fachada','tipo','auto','ok',exists(select 1 from jsonb_array_elements(integracao_atribuicoes_privado.lista(p#>'{campo,fotos}')) f where f->>'tipo'='fachada')),
   jsonb_build_object('id','info_campo','tipo','auto','ok',info_campo),jsonb_build_object('id','area','tipo','auto','ok',area),jsonb_build_object('id','memorial','tipo','auto','ok',memorial));
  foreach chave in array array['medicao','lepac','conferencia'] loop base:=base||jsonb_build_array(jsonb_build_object('id',chave,'tipo','manual','ok',integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave)));end loop;
 else
  base:=jsonb_build_array(jsonb_build_object('id','loteQuadra','tipo','auto','ok',lote),
   jsonb_build_object('id','termo_gerado','tipo','auto','ok',exists(select 1 from jsonb_array_elements(integracao_atribuicoes_privado.lista(p->'documentosGerados')) g where g->>'tipo'='termo_compromisso')));
  foreach chave in array array['confrontacoes','termoAssinado'] loop base:=base||jsonb_build_array(jsonb_build_object('id',chave,'tipo','manual','ok',integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave)));end loop;
 end if;
 for def in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(config#>'{campos,lista}')) loop
  if integracao_atribuicoes_privado.verdadeiro(def->'ativo') and def->>'obrigatorioEtapa'=nome and def->>'id' not in ('cp_familia','2be328c2-7ccd-4448-a942-cfc6f62631fc','bbb40008-d693-4be1-8021-613da327e8ce','d7d5ae44-f5af-4970-9d21-081840964ece','0ca10151-b790-409b-a056-c9f8a963f3dc') then
   base:=base||jsonb_build_array(jsonb_build_object('id','extra_'||(def->>'id'),'tipo','auto','ok',integracao_atribuicoes_privado.campo_preenchido(def,p->'extras'->(def->>'id'))));
  end if;
 end loop;
 return integracao_atribuicoes_privado.avaliar_lista(base,p,ajuste,coalesce((config->>'municipal')::boolean,false));
end $$;
create function integracao_atribuicoes_privado.validar_avanco(p jsonb,etapa integer,municipio text,ativo boolean) returns void language plpgsql security definer set search_path='' as $$
declare nucleo jsonb;config jsonb;falhas jsonb;grupo integer:=case etapa when 3 then 1 when 4 then 2 else -1 end;
begin
 if not coalesce(ativo,false) or coalesce(p->>'situacao','Ativo')<>'Ativo' then raise exception 'Morador inativo nao avanca' using errcode='42501';end if;
 nucleo:=integracao_atribuicoes_privado.nucleo_fluxo(p->>'nucleoId');
 if nucleo is null or coalesce((nucleo->>'etapa')::integer,0)<grupo then raise exception 'Aguardando conclusao da etapa do nucleo' using errcode='PT409';end if;
 config:=integracao_atribuicoes_privado.config_fluxo(municipio);
 falhas:=integracao_atribuicoes_privado.avaliar_fluxo(p,etapa,config,nucleo);
 if jsonb_array_length(falhas)>0 then raise exception 'Requisitos da etapa ainda pendentes. Atualize o cadastro.' using errcode='PT409',detail=falhas::text;end if;
end $$;

-- END EXISTING WORKFLOW EVALUATION
create function integracao_atribuicoes_privado.validar_chaves_fluxo(antes jsonb,depois jsonb,etapa integer,municipio text default null) returns void
language plpgsql security definer set search_path='' as $$
declare nome text;config jsonb;ajustes jsonb;chaves text[];campos text[];chave text;
begin
 nome:=case etapa when 3 then 'topografia' when 4 then 'projeto' else null end;
 if nome is null then return;end if;
 config:=integracao_atribuicoes_privado.config_fluxo(coalesce(municipio,antes->>'municipioId'));
 ajustes:=config->'ajustes'->nome;
 chaves:=case etapa when 3 then array['medicao','lepac','conferencia'] else array['confrontacoes','termoAssinado'] end;
 select coalesce(array_agg(x),'{}') into chaves from unnest(chaves) x where not coalesce(ajustes->'desativados','[]') ? x;
 select chaves||coalesce(array_agg(e->>'id'),'{}') into chaves from jsonb_array_elements(coalesce(ajustes->'extras','[]')) e where coalesce(e->>'tipo','manual')<>'campo';
 select coalesce(array_agg(e->>'id'),'{}') into campos from jsonb_array_elements(coalesce(ajustes->'extras','[]')) e where e->>'tipo'='campo';
 for chave in select jsonb_object_keys(coalesce(antes->'checks','{}')||coalesce(depois->'checks','{}')) loop
  if antes#>array['checks',chave] is distinct from depois#>array['checks',chave] and coalesce(jsonb_typeof(depois#>array['checks',chave]),'null') not in ('boolean','null') then raise exception 'Requisito manual exige valor booleano' using errcode='42501';end if;
  if antes#>array['checks',chave] is distinct from depois#>array['checks',chave] and not(chave=any(chaves)) then raise exception 'Requisito de outra etapa ou automatico nao pode ser alterado' using errcode='42501';end if;
 end loop;
 for chave in select jsonb_object_keys(coalesce(antes->'campos','{}')||coalesce(depois->'campos','{}')) loop
  if antes#>array['campos',chave] is distinct from depois#>array['campos',chave] and not(chave=any(campos)) then raise exception 'Campo operacional de outra etapa nao pode ser alterado' using errcode='42501';end if;
 end loop;
end $$;

create function integracao_atribuicoes_privado.proteger_mutacao() returns trigger language plpgsql security definer set search_path='' as $$
declare antes jsonb;depois jsonb;recurso text:=tg_argv[0];p public.profiles;setor text;etapa integer;doc jsonb;anterior jsonb;municipio text;morador_ativo boolean;
begin
 if not integracao_atribuicoes_privado.contratado() then if tg_op='DELETE' then return old;else return new;end if;end if;
 antes:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 depois:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 if tg_table_name='integracao_complementos' then
  if tg_op='UPDATE' and antes->'colecao' is distinct from depois->'colecao' and (antes->>'colecao' in ('processos','nucleos','remessas','metas','ordensServico','planos','conversas','mensagens') or depois->>'colecao' in ('processos','nucleos','remessas','metas','ordensServico','planos','conversas','mensagens')) then raise exception 'Colecao do complemento nao pode ser transferida' using errcode='42501';end if;
  recurso:=case coalesce(depois->>'colecao',antes->>'colecao') when 'processos' then 'clientes' when 'nucleos' then 'nucleos' when 'remessas' then 'remessas' when 'metas' then 'metas' when 'ordensServico' then 'ordens_servico' when 'planos' then 'planos' when 'conversas' then 'chat' when 'mensagens' then 'chat' else null end;
  if recurso is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 end if;
 if not integracao_atribuicoes_privado.permitido(recurso,case tg_op when 'INSERT' then 'criar' when 'DELETE' then 'excluir' else 'editar' end) then raise exception 'Ação não autorizada pelo contrato' using errcode='42501';end if;
 if tg_table_name='planos_trabalho' and tg_op='UPDATE' and antes->'created_by' is distinct from depois->'created_by' then raise exception 'Autoria do plano nao pode ser transferida por editar' using errcode='42501';end if;
 if tg_table_name='processos_kanban' and tg_op='UPDATE' and coalesce((depois->>'excluido_erp')::boolean,false) and not coalesce((antes->>'excluido_erp')::boolean,false) and not integracao_atribuicoes_privado.permitido('nucleos','excluir') then raise exception 'Exclusão de núcleo não autorizada' using errcode='42501';end if;
 if tg_table_name='metas' and tg_op in ('INSERT','UPDATE') and depois->>'status'='Concluído' and antes->>'status' is distinct from 'Concluído' and not integracao_atribuicoes_privado.permitido('metas','aprovar') then raise exception 'Aprovação de meta não autorizada' using errcode='42501';end if;
 if recurso='metas' and tg_table_name<>'metas' and tg_op in ('INSERT','UPDATE') and depois#>>'{dados,status}'='Concluído' and antes#>>'{dados,status}' is distinct from 'Concluído' and not integracao_atribuicoes_privado.permitido('metas','aprovar') then raise exception 'Aprovacao de meta nao autorizada' using errcode='42501';end if;
 if tg_table_name='fin_receb_clientes' and tg_op='UPDATE' and antes->'ativo' is distinct from depois->'ativo' then raise exception 'Situação do morador é uma ação separada do cadastro' using errcode='42501';end if;
 if (tg_table_name='integracao_moradores' or (tg_table_name='integracao_complementos' and recurso='clientes')) and tg_op in ('INSERT','UPDATE') then
  select * into p from public.profiles where id=auth.uid();
  setor:=case p.tipo when 'Topografia' then 'topografia' when 'Projetos' then 'projeto' else 'consulta' end;
  antes:=coalesce(antes->'dados','{}');depois:=coalesce(depois->'dados','{}');
  select municipio_id::text,ativo into municipio,morador_ativo from public.fin_receb_clientes where id=new.referencia_id;
  municipio:=coalesce(municipio,antes->>'municipioId',depois->>'municipioId');
  if (antes->'situacao' is distinct from depois->'situacao' and tg_op<>'INSERT') or (tg_op='INSERT' and coalesce(depois->>'situacao','Ativo')<>'Ativo') then raise exception 'Situação do morador não é permissão de editar cadastro' using errcode='42501';end if;
  etapa:=coalesce((antes->>'etapa')::integer,0);
  if (coalesce(antes->'etapa','0') is distinct from coalesce(depois->'etapa','0') or coalesce(antes->'checks','{}') is distinct from coalesce(depois->'checks','{}') or coalesce(antes->'campos','{}') is distinct from coalesce(depois->'campos','{}')) then
   if depois ? 'etapa' and (jsonb_typeof(depois->'etapa')<>'number' or (depois->>'etapa')::numeric<>trunc((depois->>'etapa')::numeric)) then raise exception 'Etapa deve ser um numero inteiro' using errcode='42501';end if;
   if not ((etapa=3 and setor='topografia') or (etapa=4 and setor='projeto')) then
    if not(tg_op='INSERT' and coalesce((depois->>'etapa')::integer,0)=0 and coalesce(depois->'checks','{}')='{}'::jsonb and coalesce(depois->'campos','{}')='{}'::jsonb) then raise exception 'Fluxo setorial preservado: cadastro não altera etapas ou requisitos de outro setor' using errcode='42501';end if;
   end if;
   if abs(coalesce((depois->>'etapa')::integer,0)-etapa)>1 then raise exception 'Não é permitido pular etapas' using errcode='42501';end if;
   perform integracao_atribuicoes_privado.travar_fluxo(antes->>'nucleoId');
   perform integracao_atribuicoes_privado.travar_fluxo(depois->>'nucleoId');
   if coalesce((depois->>'etapa')::integer,0)<etapa and
     (length(trim(coalesce(depois#>>'{reaberturaFluxo,motivo}','')))<3 or
      depois#>>'{reaberturaFluxo,de}' is distinct from etapa::text or
      depois#>>'{reaberturaFluxo,para}' is distinct from depois->>'etapa' or
      antes->'reaberturaFluxo' is not distinct from depois->'reaberturaFluxo') then
     raise exception 'Retrocesso exige motivo novo para esta transicao' using errcode='42501';
   end if;
   perform integracao_atribuicoes_privado.validar_chaves_fluxo(antes,depois,etapa,municipio);
   if coalesce((depois->>'etapa')::integer,0)>etapa then
    perform integracao_atribuicoes_privado.validar_avanco(depois,etapa,municipio,coalesce(morador_ativo,true));
   end if;
  end if;
  for doc in select value from jsonb_array_elements(coalesce(depois->'docs','[]')) loop
   select value into anterior from jsonb_array_elements(coalesce(antes->'docs','[]')) where value->>'id'=doc->>'id';
   if anterior->>'status' in ('validado','rejeitado') and doc is distinct from anterior then raise exception 'Resultado documental validado não é alterado por editar cadastro' using errcode='42501';end if;
   if doc->>'status' in ('validado','rejeitado') and (anterior is null or anterior->'status' is distinct from doc->'status') then raise exception 'Validação documental é ação do fluxo, não de editar cadastro' using errcode='42501';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(coalesce(antes->'docs','[]')) a where not exists(select 1 from jsonb_array_elements(coalesce(depois->'docs','[]')) n where n->>'id'=a->>'id')) and not integracao_atribuicoes_privado.permitido('documentos','excluir',false) then raise exception 'Remoção de documento não autorizada' using errcode='42501';end if;
 end if;
 if (tg_table_name='integracao_nucleos' or (tg_table_name='integracao_complementos' and recurso='nucleos')) and tg_op in ('INSERT','UPDATE') and
  (coalesce(antes#>'{dados,etapa}','0') is distinct from coalesce(depois#>'{dados,etapa}','0') or coalesce(antes#>'{dados,checks}','{}') is distinct from coalesce(depois#>'{dados,checks}','{}') or coalesce(antes#>'{dados,campos}','{}') is distinct from coalesce(depois#>'{dados,campos}','{}')) then
  if depois#>'{dados,etapa}' is not null and (jsonb_typeof(depois#>'{dados,etapa}')<>'number' or (depois#>>'{dados,etapa}')::numeric<>trunc((depois#>>'{dados,etapa}')::numeric)) then raise exception 'Etapa do nucleo deve ser inteira' using errcode='42501';end if;
  select * into p from public.profiles where id=auth.uid();
  perform integracao_atribuicoes_privado.validar_nucleo(coalesce(antes->'dados','{}'),coalesce(depois->'dados','{}'),new.registro_id,new.referencia_id,p.tipo,tg_op);
 end if;
 if tg_op='UPDATE' and tg_table_name like 'integracao_%' and tg_table_name<>'integracao_moradores' and recurso<>'clientes' then
  antes:=coalesce(antes->'dados','{}');depois:=coalesce(depois->'dados','{}');
  if ((coalesce((depois->>'excluida')::boolean,false) and not coalesce((antes->>'excluida')::boolean,false)) or (depois->'excluidaEm' is not null and antes->'excluidaEm' is distinct from depois->'excluidaEm') or (depois#>'{extras,arquivamento,ativo}'='true'::jsonb and antes#>'{extras,arquivamento,ativo}' is distinct from 'true'::jsonb)) and integracao_atribuicoes_privado.escolha(recurso,'excluir') is false then raise exception 'Exclusão não autorizada pelo contrato' using errcode='42501';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger atribuicoes_proteger before insert or update or delete on public.integracao_complementos for each row execute function integracao_atribuicoes_privado.proteger_mutacao('legado');
do $$declare t text;r text;begin
 for t,r in select * from (values ('fin_receb_clientes','clientes'),('integracao_moradores','clientes'),('processos_kanban','nucleos'),('metas','metas'),('integracao_nucleos','nucleos'),('integracao_remessas','remessas'),('integracao_metas','metas'),('integracao_ordens_servico','ordens_servico'),('integracao_chat','chat'),('planos_trabalho','planos')) q loop
  execute format('create trigger atribuicoes_proteger before insert or update or delete on public.%I for each row execute function integracao_atribuicoes_privado.proteger_mutacao(%L)',t,r);
 end loop;
end $$;

create function integracao_atribuicoes_privado.auditar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='contratos' or integracao_atribuicoes_privado.contratado() then
  insert into integracao_atribuicoes_privado.auditoria(ator,evento,recurso,acao,registro,antes_hash,depois_hash,origem_sha256)
  values(auth.uid(),'mutacao',tg_table_name,tg_op,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'registro_id',to_jsonb(old)->>'registro_id',to_jsonb(new)->>'usuario_id'),case when tg_op<>'INSERT' then md5(to_jsonb(old)::text) end,case when tg_op<>'DELETE' then md5(to_jsonb(new)::text) end,case when tg_table_name='contratos' then coalesce(to_jsonb(new)->>'origem_sha256',to_jsonb(old)->>'origem_sha256') else (select c.origem_sha256 from integracao_atribuicoes_privado.contratos c where c.usuario_id=auth.uid()) end);
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
do $$declare t text;begin
 foreach t in array array['fin_receb_clientes','integracao_moradores','processos_kanban','fin_receb_remessas','integracao_nucleos','integracao_remessas','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','metas','ordens_servico','documentos'] loop
  execute format('create trigger atribuicoes_auditar after insert or update or delete on public.%I for each row execute function integracao_atribuicoes_privado.auditar()',t);
 end loop;
end $$;
create trigger auditar_contrato after insert or update or delete on integracao_atribuicoes_privado.contratos for each row execute function integracao_atribuicoes_privado.auditar();

revoke all on all functions in schema integracao_atribuicoes_privado from public,anon,authenticated;
grant execute on function integracao_atribuicoes_privado.escolha(text,text),integracao_atribuicoes_privado.permitido(text,text,boolean),integracao_atribuicoes_privado.escopo_plano(uuid) to authenticated;
revoke all on function public.integracao_atribuicoes_contrato_ler(uuid),public.integracao_atribuicoes_autorizar(text,text,text,uuid) from public,anon;
grant execute on function public.integracao_atribuicoes_contrato_ler(uuid),public.integracao_atribuicoes_autorizar(text,text,text,uuid) to authenticated;

create policy atribuicoes_comentario_ler on public.comentarios_plano for select to authenticated using(integracao_atribuicoes_privado.escolha('planos','ler') is true and integracao_atribuicoes_privado.escopo_plano(plano_id));
create policy atribuicoes_comentario_criar on public.comentarios_plano for insert to authenticated with check(integracao_atribuicoes_privado.escolha('planos','editar') is true and autor_id=auth.uid() and integracao_atribuicoes_privado.escopo_plano(plano_id));
create policy atribuicoes_comentario_editar on public.comentarios_plano for update to authenticated using(integracao_atribuicoes_privado.escolha('planos','editar') is true and autor_id=auth.uid() and integracao_atribuicoes_privado.escopo_plano(plano_id)) with check(integracao_atribuicoes_privado.escolha('planos','editar') is true and autor_id=auth.uid() and integracao_atribuicoes_privado.escopo_plano(plano_id));
create function integracao_atribuicoes_privado.auditoria_imutavel() returns trigger language plpgsql security invoker set search_path='' as $$begin raise exception 'Auditoria imutável';end$$;
create trigger auditoria_imutavel before update or delete or truncate on integracao_atribuicoes_privado.auditoria for each statement execute function integracao_atribuicoes_privado.auditoria_imutavel();
revoke all on function integracao_atribuicoes_privado.auditoria_imutavel() from public,anon,authenticated;

-- Extend draft validation only; no workflow grant is applied. Preserve CAS, self-denial and audit.
CREATE OR REPLACE FUNCTION public.integracao_atribuicoes_salvar(
  p_usuario_id uuid, p_revisao_esperada bigint, p_matriz jsonb,
  p_motivo text, p_requisicao_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_r public.integracao_atribuicoes_rascunhos%ROWTYPE;
  v_a public.integracao_atribuicoes_auditoria%ROWTYPE;
  v_item jsonb;
  v_motivo text := pg_catalog.btrim(p_motivo);
  v_agora timestamptz;
  v_resultado jsonb;
BEGIN
  IF v_ator IS NULL OR public.is_erp_admin() IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrador ativo necessario';
  END IF;
  IF p_usuario_id = v_ator THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Edicao de rascunho proprio proibida';
  END IF;
  IF p_usuario_id IS NULL OR NOT EXISTS
    (SELECT 1 FROM public.profiles AS p WHERE p.id = p_usuario_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Usuario de destino invalido';
  END IF;
  IF p_revisao_esperada IS NULL OR p_revisao_esperada < 0 OR p_requisicao_id IS NULL
    OR v_motivo IS NULL OR pg_catalog.char_length(v_motivo) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Revisao, motivo e requisicao obrigatorios';
  END IF;
  -- Contrato fechado; nao aceita cargo/setor/ativo/ator ou campos arbitrarios.
  IF p_matriz IS NULL OR pg_catalog.jsonb_typeof(p_matriz) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(p_matriz::text) > 32768 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Matriz de rascunho invalida';
  END IF;
  IF (p_matriz - ARRAY['schema_version','atribuicoes','fluxo_moradores']::text[]) <> '{}'::jsonb
    OR p_matriz->'schema_version' IS DISTINCT FROM '1'::jsonb
    OR pg_catalog.jsonb_typeof(p_matriz->'atribuicoes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Contrato de rascunho invalido';
  END IF;
  IF pg_catalog.jsonb_array_length(p_matriz->'atribuicoes') > 66 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Muitas celulas no rascunho';
  END IF;
  IF p_matriz ? 'fluxo_moradores' THEN
    IF pg_catalog.jsonb_typeof(p_matriz->'fluxo_moradores') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Rascunho de fluxo invalido';
    END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(p_matriz->'fluxo_moradores') f
      WHERE pg_catalog.jsonb_typeof(f.value) IS DISTINCT FROM 'string'
      OR f.value #>> '{}' NOT IN ('herdar','permitir','negar')
      OR NOT (f.key IN ('situacao','validar_documentos','validacao_justificada','requisitos_config')
        OR f.key ~ '^(mobilizacao|contrato|documental|topografia|projeto|prefeitura)\.(consultar|campos_operacionais|requisitos_manuais|avancar|reabrir)$')) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Acao ou decisao de fluxo invalida';
    END IF;
  END IF;
  FOR v_item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_matriz->'atribuicoes') AS e(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Celula de rascunho invalida';
    END IF;
    IF (v_item - ARRAY['recurso','acao','decisao','escopo']::text[]) <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(v_item->'recurso') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_item->'acao') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_item->'decisao') IS DISTINCT FROM 'string'
      OR (v_item->>'recurso') NOT IN ('clientes','nucleos','remessas','planos','metas_ordens',
        'calendario','chat','documentos','solicitacoes','agentes_ia','concessoes')
      OR (v_item->>'acao') NOT IN ('ler','criar','editar','aprovar','exportar','excluir')
      OR (v_item->>'decisao') NOT IN ('herdar','permitir','negar')
      OR v_item->'escopo' IS DISTINCT FROM '{"tipo":"atual"}'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Recurso, acao, decisao ou escopo invalidos';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_matriz->'atribuicoes') AS e(value)
    GROUP BY e.value->>'recurso', e.value->>'acao' HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Celula duplicada no rascunho';
  END IF;

  -- O INSERT concorrente aguarda o PK; FOR UPDATE serializa salvamentos do destino.
  -- A linha inicial e removida pelo rollback automatico se qualquer validacao falhar.
  INSERT INTO public.integracao_atribuicoes_rascunhos(usuario_id, alterado_por)
    VALUES (p_usuario_id, v_ator) ON CONFLICT (usuario_id) DO NOTHING;
  SELECT r.* INTO STRICT v_r FROM public.integracao_atribuicoes_rascunhos AS r
    WHERE r.usuario_id = p_usuario_id FOR UPDATE;
  SELECT a.* INTO v_a FROM public.integracao_atribuicoes_auditoria AS a
    WHERE a.ator_id = v_ator AND a.requisicao_id = p_requisicao_id;
  IF FOUND THEN
    IF v_a.usuario_id IS DISTINCT FROM p_usuario_id
      OR v_a.revisao_anterior IS DISTINCT FROM p_revisao_esperada
      OR v_a.matriz_nova IS DISTINCT FROM p_matriz OR v_a.motivo IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Requisicao idempotente reutilizada com outro conteudo';
    END IF;
    RETURN v_a.resultado;
  END IF;
  IF v_r.revisao <> p_revisao_esperada THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Conflito de revisao; recarregue o rascunho';
  END IF;
  v_agora := pg_catalog.clock_timestamp();
  UPDATE public.integracao_atribuicoes_rascunhos AS r SET
    revisao = v_r.revisao + 1, matriz = p_matriz,
    atualizado_em = v_agora, alterado_por = v_ator WHERE r.usuario_id = p_usuario_id;
  v_resultado := pg_catalog.jsonb_build_object(
    'modo', 'rascunho_sem_efeito', 'acesso_efetivo_alterado', false,
    'usuario_id', p_usuario_id, 'revisao', v_r.revisao + 1,
    'matriz', p_matriz, 'atualizado_em', v_agora,
    'alterado_por', v_ator, 'requisicao_id', p_requisicao_id);
  INSERT INTO public.integracao_atribuicoes_auditoria(
    ator_id, requisicao_id, usuario_id, revisao_anterior, revisao,
    matriz_anterior, matriz_nova, motivo, criado_em, resultado
  ) VALUES (
    v_ator, p_requisicao_id, p_usuario_id, v_r.revisao, v_r.revisao + 1,
    CASE WHEN v_r.revisao = 0 THEN NULL ELSE v_r.matriz END,
    p_matriz, v_motivo, v_agora, v_resultado
  );
  RETURN v_resultado;
END;
$$;

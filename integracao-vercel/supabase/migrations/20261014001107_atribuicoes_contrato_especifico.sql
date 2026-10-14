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
 select * into p from public.profiles where id=auth.uid();
 if not found or p.ativo is not true then return false;end if;
 select * into c from integracao_atribuicoes_privado.contratos where usuario_id=auth.uid();
 if not found then return null;end if;
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

-- RESTRICTIVE policies intersect every existing permissive route.
do $$declare t text;r text;begin
 for t,r in select * from (values ('fin_receb_clientes','clientes'),('integracao_moradores','clientes'),('processos_kanban','nucleos'),('integracao_nucleos','nucleos'),('fin_receb_remessas','remessas'),('integracao_remessas','remessas'),('metas','metas'),('integracao_metas','metas'),('ordens_servico','ordens_servico'),('integracao_ordens_servico','ordens_servico'),('erp_conversas','chat'),('erp_mensagens','chat'),('integracao_chat','chat'),('documentos','documentos')) q loop
  execute format('create policy atribuicoes_excluir on public.%I as restrictive for delete to authenticated using(integracao_atribuicoes_privado.permitido(%L,''excluir''))',t,r);
 end loop;
end $$;

-- Resolve the current municipal configuration on the server. Only manual requirements
-- and operational fields of this stage are writable; automatic checks never are.
create function integracao_atribuicoes_privado.validar_chaves_fluxo(antes jsonb,depois jsonb,etapa integer) returns void
language plpgsql stable security definer set search_path='' as $$
declare nome text;config jsonb;municipal jsonb;ajustes jsonb;chaves text[];campos text[];chave text;
begin
 nome:=case etapa when 3 then 'topografia' when 4 then 'projeto' else null end;
 if nome is null then return;end if;
 select dados->'valor' into config from public.integracao_configuracoes where colecao='config' and registro_id='ajustesRequisitos';
 select dados->'valor'->(antes->>'municipioId') into municipal from public.integracao_configuracoes where colecao='config' and registro_id='ajustesMunicipio';
 ajustes:=coalesce(municipal->'ajustesRequisitos',config,'{}')->nome;
 chaves:=case etapa when 3 then array['medicao','lepac','conferencia'] else array['confrontacoes','termoAssinado'] end;
 select coalesce(array_agg(x),'{}') into chaves from unnest(chaves) x where not coalesce(ajustes->'desativados','[]') ? x;
 select chaves||coalesce(array_agg(e->>'id'),'{}') into chaves from jsonb_array_elements(coalesce(ajustes->'extras','[]')) e where coalesce(e->>'tipo','manual')<>'campo';
 select coalesce(array_agg(e->>'id'),'{}') into campos from jsonb_array_elements(coalesce(ajustes->'extras','[]')) e where e->>'tipo'='campo';
 for chave in select jsonb_object_keys(coalesce(antes->'checks','{}')||coalesce(depois->'checks','{}')) loop
  if antes#>array['checks',chave] is distinct from depois#>array['checks',chave] and not(chave=any(chaves)) then raise exception 'Requisito de outra etapa ou automatico nao pode ser alterado' using errcode='42501';end if;
 end loop;
 for chave in select jsonb_object_keys(coalesce(antes->'campos','{}')||coalesce(depois->'campos','{}')) loop
  if antes#>array['campos',chave] is distinct from depois#>array['campos',chave] and not(chave=any(campos)) then raise exception 'Campo operacional de outra etapa nao pode ser alterado' using errcode='42501';end if;
 end loop;
end $$;

create function integracao_atribuicoes_privado.proteger_mutacao() returns trigger language plpgsql security definer set search_path='' as $$
declare antes jsonb;depois jsonb;recurso text:=tg_argv[0];p public.profiles;setor text;etapa integer;doc jsonb;anterior jsonb;
begin
 if not integracao_atribuicoes_privado.contratado() then if tg_op='DELETE' then return old;else return new;end if;end if;
 antes:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 depois:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 if not integracao_atribuicoes_privado.permitido(recurso,case tg_op when 'INSERT' then 'criar' when 'DELETE' then 'excluir' else 'editar' end) then raise exception 'Ação não autorizada pelo contrato' using errcode='42501';end if;
 if tg_table_name='planos_trabalho' and tg_op='UPDATE' and antes->'created_by' is distinct from depois->'created_by' then raise exception 'Autoria do plano nao pode ser transferida por editar' using errcode='42501';end if;
 if tg_table_name='processos_kanban' and tg_op='UPDATE' and coalesce((depois->>'excluido_erp')::boolean,false) and not coalesce((antes->>'excluido_erp')::boolean,false) and not integracao_atribuicoes_privado.permitido('nucleos','excluir') then raise exception 'Exclusão de núcleo não autorizada' using errcode='42501';end if;
 if tg_table_name='metas' and tg_op in ('INSERT','UPDATE') and depois->>'status'='Concluído' and antes->>'status' is distinct from 'Concluído' and not integracao_atribuicoes_privado.permitido('metas','aprovar') then raise exception 'Aprovação de meta não autorizada' using errcode='42501';end if;
 if tg_table_name='fin_receb_clientes' and tg_op='UPDATE' and antes->'ativo' is distinct from depois->'ativo' then raise exception 'Situação do morador é uma ação separada do cadastro' using errcode='42501';end if;
 if tg_table_name='integracao_moradores' and tg_op in ('INSERT','UPDATE') then
  select * into p from public.profiles where id=auth.uid();
  setor:=case p.tipo when 'Topografia' then 'topografia' when 'Projetos' then 'projeto' else 'consulta' end;
  antes:=coalesce(antes->'dados','{}');depois:=coalesce(depois->'dados','{}');
  if (antes->'situacao' is distinct from depois->'situacao' and tg_op<>'INSERT') or (tg_op='INSERT' and coalesce(depois->>'situacao','Ativo')<>'Ativo') then raise exception 'Situação do morador não é permissão de editar cadastro' using errcode='42501';end if;
  etapa:=coalesce((antes->>'etapa')::integer,0);
  if (antes->'etapa' is distinct from depois->'etapa' or antes->'checks' is distinct from depois->'checks' or antes->'campos' is distinct from depois->'campos') then
   if not ((etapa=3 and setor='topografia') or (etapa=4 and setor='projeto')) then
    if not(tg_op='INSERT' and coalesce((depois->>'etapa')::integer,0)=0 and coalesce(depois->'checks','{}')='{}'::jsonb and coalesce(depois->'campos','{}')='{}'::jsonb) then raise exception 'Fluxo setorial preservado: cadastro não altera etapas ou requisitos de outro setor' using errcode='42501';end if;
   end if;
   if abs(coalesce((depois->>'etapa')::integer,etapa)-etapa)>1 then raise exception 'Não é permitido pular etapas' using errcode='42501';end if;
   if coalesce((depois->>'etapa')::integer,etapa)<etapa and
     (length(trim(coalesce(depois#>>'{reaberturaFluxo,motivo}','')))<3 or
      depois#>>'{reaberturaFluxo,de}' is distinct from etapa::text or
      depois#>>'{reaberturaFluxo,para}' is distinct from depois->>'etapa' or
      antes->'reaberturaFluxo' is not distinct from depois->'reaberturaFluxo') then
     raise exception 'Retrocesso exige motivo novo para esta transicao' using errcode='42501';
   end if;
   perform integracao_atribuicoes_privado.validar_chaves_fluxo(antes,depois,etapa);
  end if;
  for doc in select value from jsonb_array_elements(coalesce(depois->'docs','[]')) loop
   select value into anterior from jsonb_array_elements(coalesce(antes->'docs','[]')) where value->>'id'=doc->>'id';
   if anterior->>'status' in ('validado','rejeitado') and doc is distinct from anterior then raise exception 'Resultado documental validado não é alterado por editar cadastro' using errcode='42501';end if;
   if doc->>'status' in ('validado','rejeitado') and (anterior is null or anterior->'status' is distinct from doc->'status') then raise exception 'Validação documental é ação do fluxo, não de editar cadastro' using errcode='42501';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(coalesce(antes->'docs','[]')) a where not exists(select 1 from jsonb_array_elements(coalesce(depois->'docs','[]')) n where n->>'id'=a->>'id')) and not integracao_atribuicoes_privado.permitido('documentos','excluir',false) then raise exception 'Remoção de documento não autorizada' using errcode='42501';end if;
 end if;
 if tg_op='UPDATE' and tg_table_name like 'integracao_%' and tg_table_name<>'integracao_moradores' then
  antes:=coalesce(antes->'dados','{}');depois:=coalesce(depois->'dados','{}');
  if ((coalesce((depois->>'excluida')::boolean,false) and not coalesce((antes->>'excluida')::boolean,false)) or (depois->'excluidaEm' is not null and antes->'excluidaEm' is distinct from depois->'excluidaEm') or (depois#>'{extras,arquivamento,ativo}'='true'::jsonb and antes#>'{extras,arquivamento,ativo}' is distinct from 'true'::jsonb)) and integracao_atribuicoes_privado.escolha(recurso,'excluir') is false then raise exception 'Exclusão não autorizada pelo contrato' using errcode='42501';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
do $$declare t text;r text;begin
 for t,r in select * from (values ('fin_receb_clientes','clientes'),('integracao_moradores','clientes'),('processos_kanban','nucleos'),('metas','metas'),('integracao_nucleos','nucleos'),('integracao_remessas','remessas'),('integracao_metas','metas'),('integracao_ordens_servico','ordens_servico'),('integracao_chat','chat'),('planos_trabalho','planos')) q loop
  execute format('create trigger atribuicoes_proteger before insert or update or delete on public.%I for each row execute function integracao_atribuicoes_privado.proteger_mutacao(%L)',t,r);
 end loop;
end $$;

create function integracao_atribuicoes_privado.auditar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='contratos' or integracao_atribuicoes_privado.contratado() then
  insert into integracao_atribuicoes_privado.auditoria(ator,evento,recurso,acao,registro,antes_hash,depois_hash)
  values(auth.uid(),'mutacao',tg_table_name,tg_op,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'registro_id',to_jsonb(old)->>'registro_id',to_jsonb(new)->>'usuario_id'),case when tg_op<>'INSERT' then md5(to_jsonb(old)::text) end,case when tg_op<>'DELETE' then md5(to_jsonb(new)::text) end);
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

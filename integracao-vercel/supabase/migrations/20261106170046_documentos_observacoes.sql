-- Evolução aditiva. Não altera moradores nem reclassifica observações existentes.
-- Aplicar somente após verificar backup recuperável. Reversão: revogar RPC e
-- privilégios de escrita; conservar estas tabelas/histórico e retornar o frontend.
-- Não usar DROP na reversão: observações criadas depois da publicação são dados reais.
begin;

create schema integracao_documentos_observacoes_privado;
revoke all on schema integracao_documentos_observacoes_privado from public, anon, authenticated;
grant usage on schema integracao_documentos_observacoes_privado to authenticated;

create function integracao_documentos_observacoes_privado.conteudo_valido(p_conteudo jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare bloco jsonb; trecho jsonb; identificadores text[] := '{}'; caracteres bigint := 0;
  trechos bigint := 0; tem_texto boolean := false;
begin
  if jsonb_typeof(p_conteudo) is distinct from 'object'
    or p_conteudo->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_conteudo->'blocks') is distinct from 'array' then
    raise exception 'Formato da observação inválido' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_conteudo) chave where chave not in ('version','blocks'))
    or jsonb_array_length(p_conteudo->'blocks') not between 1 and 200
    or octet_length(p_conteudo::text) > 131072 then
    raise exception 'Observação excede os limites ou contém campos não permitidos' using errcode = '22023';
  end if;
  for bloco in select value from jsonb_array_elements(p_conteudo->'blocks') loop
    if jsonb_typeof(bloco) is distinct from 'object' then
      raise exception 'Linha da observação inválida' using errcode = '22023';
    end if;
    if exists(select 1 from jsonb_object_keys(bloco) chave where chave not in ('id','type','checked','runs'))
      or jsonb_typeof(bloco->'id') is distinct from 'string'
      or not coalesce((bloco->>'id') ~ '^[A-Za-z0-9_-]{1,64}$',false)
      or (bloco->>'id') = any(identificadores)
      or not coalesce(bloco->>'type' in ('paragraph','bullet','ordered','check'),false)
      or jsonb_typeof(bloco->'runs') is distinct from 'array' then
      raise exception 'Linha ou formatação da observação inválida' using errcode = '22023';
    end if;
    if jsonb_array_length(bloco->'runs') = 0 then
      raise exception 'Linha sem conteúdo estruturado' using errcode = '22023';
    end if;
    identificadores := array_append(identificadores,bloco->>'id');
    if (bloco->>'type' = 'check' and jsonb_typeof(bloco->'checked') is distinct from 'boolean')
      or (bloco->>'type' <> 'check' and bloco ? 'checked') then
      raise exception 'Estado do checklist inválido' using errcode = '22023';
    end if;
    for trecho in select value from jsonb_array_elements(bloco->'runs') loop
      if jsonb_typeof(trecho) is distinct from 'object' then
        raise exception 'Trecho de texto inválido' using errcode = '22023';
      end if;
      if exists(select 1 from jsonb_object_keys(trecho) chave where chave not in ('text','bold','italic'))
        or jsonb_typeof(trecho->'text') is distinct from 'string'
        or (trecho ? 'bold' and trecho->'bold' is distinct from 'true'::jsonb)
        or (trecho ? 'italic' and trecho->'italic' is distinct from 'true'::jsonb) then
        raise exception 'Texto ou formatação não permitidos' using errcode = '22023';
      end if;
      caracteres := caracteres + char_length(trecho->>'text'); trechos := trechos + 1;
      tem_texto := tem_texto or (trecho->>'text') ~ '\S';
      if caracteres > 20000 or trechos > 1000 then
        raise exception 'Observação excede o limite de tamanho' using errcode = '22023';
      end if;
    end loop;
  end loop;
  if not tem_texto then raise exception 'Escreva uma observação antes de salvar' using errcode = '22023'; end if;
  return true;
end $$;
revoke all on function integracao_documentos_observacoes_privado.conteudo_valido(jsonb) from public, anon;
grant execute on function integracao_documentos_observacoes_privado.conteudo_valido(jsonb) to authenticated;

-- SECURITY INVOKER é deliberado: a consulta do morador e integracao_acesso
-- executam com as políticas já existentes para o usuário, inclusive contratos.
create function integracao_documentos_observacoes_privado.morador(p_processo_id text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare m record; cliente uuid; aliases integer; ativo boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo) then return null; end if;
  -- A mesma precedência de reunirComplementos/projetar: a tabela do módulo
  -- prevalece sobre a entrada legada de mesma identidade, sem atualizar nenhuma.
  select origem.* into m from (
    select 1 prioridade,registro_id,dados,referencia_tabela,referencia_id,criado_por from public.integracao_moradores where colecao='processos' and registro_id=p_processo_id
    union all
    select 2,registro_id,dados,referencia_tabela,referencia_id,criado_por from public.integracao_complementos where colecao='processos' and registro_id=p_processo_id
  ) origem order by prioridade limit 1;
  if found then
    if not public.integracao_acesso(m.referencia_tabela,m.referencia_id,m.criado_por) then return null; end if;
    if m.referencia_tabela='fin_receb_clientes' then cliente:=m.referencia_id; end if;
  else
    -- Morador exclusivamente financeiro: somente o UUID canônico visível pela
    -- RLS é aceito. A funcionalidade não cria complemento nem adivinha um alias.
    select id into cliente from public.fin_receb_clientes where id::text=p_processo_id;
    if not found then return null; end if;
  end if;
  if cliente is not null then
    select count(distinct registro_id)::integer into aliases from (
      select registro_id from public.integracao_moradores where colecao='processos' and referencia_tabela='fin_receb_clientes' and referencia_id=cliente
      union all
      select c.registro_id from public.integracao_complementos c where c.colecao='processos' and c.referencia_tabela='fin_receb_clientes' and c.referencia_id=cliente
        and not exists(select 1 from public.integracao_moradores atual where atual.colecao='processos' and atual.registro_id=c.registro_id)
    ) vinculados;
    if aliases>1 or (m.registro_id is null and aliases>0) then return null; end if;
    select c.ativo into ativo from public.fin_receb_clientes c where c.id=cliente;
    if not found then return null; end if;
  else ativo:=coalesce(m.dados->>'situacao','Ativo')='Ativo'; end if;
  return jsonb_build_object('ativo',ativo,'arquivado',coalesce(m.dados#>>'{extras,arquivamento,ativo}','false')='true');
end $$;
revoke all on function integracao_documentos_observacoes_privado.morador(text) from public,anon;
grant execute on function integracao_documentos_observacoes_privado.morador(text) to authenticated;

create function integracao_documentos_observacoes_privado.pode_ler(p_processo_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select integracao_documentos_observacoes_privado.morador(p_processo_id) is not null;
$$;

create function integracao_documentos_observacoes_privado.administrador()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo
    and p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos'));
$$;

create function integracao_documentos_observacoes_privado.pode_escrever(p_processo_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select integracao_documentos_observacoes_privado.pode_ler(p_processo_id)
    and integracao_atribuicoes_privado.permitido('clientes','editar',true)
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo
      and (p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Financeiro','Comercial','Atendimentos','Topografia','Projetos','Pós-protocolo','Jurídico')
        or lower(trim(p.setor))='financeiro'))
    and integracao_documentos_observacoes_privado.morador(p_processo_id) @> '{"ativo":true,"arquivado":false}'::jsonb;
$$;
revoke all on function integracao_documentos_observacoes_privado.pode_ler(text),
  integracao_documentos_observacoes_privado.administrador(),
  integracao_documentos_observacoes_privado.pode_escrever(text) from public,anon;
grant execute on function integracao_documentos_observacoes_privado.pode_ler(text),
  integracao_documentos_observacoes_privado.administrador(),
  integracao_documentos_observacoes_privado.pode_escrever(text) to authenticated;

create table public.integracao_documentos_observacoes (
  id uuid primary key,
  processo_id text not null check(length(processo_id) between 1 and 256),
  conteudo jsonb not null check(integracao_documentos_observacoes_privado.conteudo_valido(conteudo)),
  versao integer not null default 1 check(versao > 0),
  autor_id uuid not null default auth.uid() references auth.users(id),
  autor_nome text not null default '', autor_setor text not null default '',
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  ultimo_editor_id uuid not null default auth.uid() references auth.users(id),
  ultima_acao text not null default 'criar' check(ultima_acao in ('criar','editar','excluir','restaurar')),
  excluido_em timestamptz
);
comment on table public.integracao_documentos_observacoes is
  'Observações estruturadas de contexto Documentos. Registros antigos em integracao_moradores.dados.observacoes permanecem intactos. Exclusão é lógica; histórico privado imutável.';
create index integracao_documentos_observacoes_processo_idx
  on public.integracao_documentos_observacoes(processo_id,criado_em desc,id) where excluido_em is null;
create index integracao_documentos_observacoes_excluidas_idx
  on public.integracao_documentos_observacoes(processo_id,excluido_em desc,id) where excluido_em is not null;
alter table public.integracao_documentos_observacoes enable row level security;
revoke all on public.integracao_documentos_observacoes from public,anon,authenticated;
grant select on public.integracao_documentos_observacoes to authenticated;
grant insert(id,processo_id,conteudo) on public.integracao_documentos_observacoes to authenticated;
grant update(conteudo,versao,excluido_em) on public.integracao_documentos_observacoes to authenticated;

create policy documentos_observacoes_ler on public.integracao_documentos_observacoes for select to authenticated
  using(integracao_documentos_observacoes_privado.pode_ler(processo_id)
    and (excluido_em is null or autor_id=(select auth.uid()) or integracao_documentos_observacoes_privado.administrador()));
create policy documentos_observacoes_criar on public.integracao_documentos_observacoes for insert to authenticated
  with check(autor_id=(select auth.uid()) and excluido_em is null and versao=1
    and integracao_documentos_observacoes_privado.pode_escrever(processo_id));
create policy documentos_observacoes_editar on public.integracao_documentos_observacoes for update to authenticated
  using(integracao_documentos_observacoes_privado.pode_escrever(processo_id)
    and (autor_id=(select auth.uid()) or integracao_documentos_observacoes_privado.administrador()))
  with check(integracao_documentos_observacoes_privado.pode_escrever(processo_id)
    and (autor_id=(select auth.uid()) or integracao_documentos_observacoes_privado.administrador()));

create function integracao_documentos_observacoes_privado.proteger()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid() and ativo;
  if not found or not integracao_documentos_observacoes_privado.pode_escrever(new.processo_id) then
    raise exception 'Sem autorização para alterar observações deste morador' using errcode='42501';
  end if;
  perform integracao_documentos_observacoes_privado.conteudo_valido(new.conteudo);
  if tg_op='INSERT' then
    new.versao:=1; new.autor_id:=auth.uid(); new.autor_nome:=coalesce(p.nome,'Equipe'); new.autor_setor:=coalesce(nullif(p.setor,''),p.tipo,'');
    new.criado_em:=clock_timestamp(); new.atualizado_em:=new.criado_em; new.excluido_em:=null; new.ultima_acao:='criar';
  else
    if row(new.id,new.processo_id,new.autor_id,new.autor_nome,new.autor_setor,new.criado_em)
      is distinct from row(old.id,old.processo_id,old.autor_id,old.autor_nome,old.autor_setor,old.criado_em) then
      raise exception 'Identidade e autoria da observação são imutáveis' using errcode='42501';
    end if;
    if old.autor_id<>auth.uid() and not integracao_documentos_observacoes_privado.administrador() then
      raise exception 'Você só pode alterar suas próprias observações' using errcode='42501';
    end if;
    if new.versao<>old.versao+1 then
      raise exception 'Conflito de versão. A observação foi alterada em outra sessão' using errcode='40001';
    end if;
    if old.excluido_em is not null and new.excluido_em is not null then
      raise exception 'Restaure a observação antes de editar' using errcode='22023';
    end if;
    if (old.excluido_em is null) is distinct from (new.excluido_em is null) then
      if new.conteudo is distinct from old.conteudo then
        raise exception 'Exclusão e restauração não alteram o conteúdo' using errcode='22023';
      end if;
      new.ultima_acao:=case when new.excluido_em is null then 'restaurar' else 'excluir' end;
      if new.excluido_em is not null then new.excluido_em:=clock_timestamp(); end if;
    else new.ultima_acao:='editar'; end if;
    new.atualizado_em:=clock_timestamp();
  end if;
  new.ultimo_editor_id:=auth.uid();
  return new;
end $$;
revoke all on function integracao_documentos_observacoes_privado.proteger() from public,anon,authenticated;
create trigger documentos_observacoes_proteger before insert or update on public.integracao_documentos_observacoes
  for each row execute function integracao_documentos_observacoes_privado.proteger();

create table integracao_documentos_observacoes_privado.historico (
  observacao_id uuid not null, versao integer not null, processo_id text not null,
  acao text not null, autor_id uuid not null, registrado_em timestamptz not null default clock_timestamp(),
  registro jsonb not null, primary key(observacao_id,versao)
);
alter table integracao_documentos_observacoes_privado.historico enable row level security;
revoke all on integracao_documentos_observacoes_privado.historico from public,anon,authenticated;
create function integracao_documentos_observacoes_privado.registrar_historico()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.ultimo_editor_id is distinct from auth.uid() then
    raise exception 'Identidade obrigatória para registrar histórico' using errcode='42501';
  end if;
  insert into integracao_documentos_observacoes_privado.historico(observacao_id,versao,processo_id,acao,autor_id,registro)
    values(new.id,new.versao,new.processo_id,new.ultima_acao,auth.uid(),to_jsonb(new));
  return null;
end $$;
revoke all on function integracao_documentos_observacoes_privado.registrar_historico() from public,anon,authenticated;
create trigger documentos_observacoes_historico after insert or update on public.integracao_documentos_observacoes
  for each row execute function integracao_documentos_observacoes_privado.registrar_historico();
create trigger documentos_observacoes_revisao after insert or update on public.integracao_documentos_observacoes
  for each statement execute function integracao_crm_privado.sinalizar_revisao('clientes');

create function public.integracao_documentos_observacoes_operar(p_acao text,p_processo_id text,p_dados jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.integracao_documentos_observacoes; alvo uuid; esperada integer; inicio integer; limite integer;
  excluidas boolean; itens jsonb; total bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo) then
    raise exception 'Sessão ativa obrigatória' using errcode='42501';
  end if;
  if not integracao_documentos_observacoes_privado.pode_ler(p_processo_id) then
    raise exception 'Morador indisponível ou sem autorização' using errcode='42501';
  end if;
  if jsonb_typeof(p_dados) is distinct from 'object' or octet_length(p_dados::text)>140000 then
    raise exception 'Dados da operação inválidos' using errcode='22023';
  end if;
  if p_acao='listar' then
    if exists(select 1 from jsonb_object_keys(p_dados) chave where chave not in ('inicio','limite','excluidas'))
      or (p_dados ? 'inicio' and (jsonb_typeof(p_dados->'inicio')<>'number' or not (p_dados->>'inicio') ~ '^[0-9]{1,9}$'))
      or (p_dados ? 'limite' and (jsonb_typeof(p_dados->'limite')<>'number' or not (p_dados->>'limite') ~ '^[0-9]{1,3}$'))
      or (p_dados ? 'excluidas' and jsonb_typeof(p_dados->'excluidas')<>'boolean') then
      raise exception 'Paginação inválida' using errcode='22023';
    end if;
    inicio:=coalesce((p_dados->>'inicio')::integer,0); limite:=coalesce((p_dados->>'limite')::integer,20);
    excluidas:=coalesce((p_dados->>'excluidas')::boolean,false);
    if limite not between 1 and 100 then raise exception 'Limite de página inválido' using errcode='22023'; end if;
    select count(*) into total from public.integracao_documentos_observacoes o where o.processo_id=p_processo_id and (o.excluido_em is not null)=excluidas;
    select coalesce(jsonb_agg(to_jsonb(pagina)),'[]') into itens from (
      select * from public.integracao_documentos_observacoes o where o.processo_id=p_processo_id and (o.excluido_em is not null)=excluidas
      order by o.criado_em desc,o.id limit limite offset inicio
    ) pagina;
    return jsonb_build_object('itens',itens,'total',total);
  end if;
  if p_acao not in ('salvar','excluir','restaurar') or p_acao is null then raise exception 'Operação inválida' using errcode='22023'; end if;
  if not integracao_documentos_observacoes_privado.pode_escrever(p_processo_id) then
    raise exception 'Sem autorização para alterar observações deste morador' using errcode='42501';
  end if;
  if exists(select 1 from jsonb_object_keys(p_dados) chave where chave not in ('id','versao','conteudo'))
    or jsonb_typeof(p_dados->'id') is distinct from 'string'
    or not coalesce((p_dados->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
    or jsonb_typeof(p_dados->'versao') is distinct from 'number'
    or not coalesce((p_dados->>'versao') ~ '^[0-9]{1,9}$',false)
    or (p_acao <> 'salvar' and p_dados ? 'conteudo') then
    raise exception 'Identificador ou versão da observação inválidos' using errcode='22023';
  end if;
  alvo:=(p_dados->>'id')::uuid; esperada:=(p_dados->>'versao')::integer;
  if p_acao='salvar' then perform integracao_documentos_observacoes_privado.conteudo_valido(p_dados->'conteudo'); end if;
  perform pg_advisory_xact_lock(hashtextextended('documentos-observacao:'||alvo::text,0));
  select * into r from public.integracao_documentos_observacoes where id=alvo and processo_id=p_processo_id for update;
  if not found then
    if p_acao<>'salvar' or esperada<>0 then raise exception 'Observação indisponível ou sem autorização' using errcode='42501'; end if;
    begin
      insert into public.integracao_documentos_observacoes(id,processo_id,conteudo)
        values(alvo,p_processo_id,p_dados->'conteudo') returning * into r;
    exception when unique_violation then
      raise exception 'Não foi possível usar este identificador de observação' using errcode='42501';
    end;
    return to_jsonb(r);
  end if;
  if r.autor_id<>auth.uid() and not integracao_documentos_observacoes_privado.administrador() then
    raise exception 'Você só pode alterar suas próprias observações' using errcode='42501';
  end if;
  -- Retries não duplicam criação/histórico nem repetem uma alteração confirmada.
  if p_acao='salvar' and esperada=0 and r.versao=1 and r.autor_id=auth.uid()
    and r.conteudo=p_dados->'conteudo' and r.excluido_em is null then return to_jsonb(r); end if;
  if r.versao=esperada+1 and r.ultimo_editor_id=auth.uid() and (
    (p_acao='salvar' and r.ultima_acao='editar' and r.conteudo=p_dados->'conteudo' and r.excluido_em is null)
    or (p_acao='excluir' and r.ultima_acao='excluir' and r.excluido_em is not null)
    or (p_acao='restaurar' and r.ultima_acao='restaurar' and r.excluido_em is null)
  ) then return to_jsonb(r); end if;
  if r.versao<>esperada then raise exception 'Conflito de versão. A observação foi alterada em outra sessão' using errcode='40001'; end if;
  if p_acao='salvar' then
    if r.excluido_em is not null then raise exception 'Restaure a observação antes de editar' using errcode='22023'; end if;
    if r.conteudo=p_dados->'conteudo' then return to_jsonb(r); end if;
    update public.integracao_documentos_observacoes set conteudo=p_dados->'conteudo',versao=versao+1 where id=alvo and versao=esperada returning * into r;
  elsif p_acao='excluir' then
    if r.excluido_em is not null then raise exception 'Observação já excluída' using errcode='22023'; end if;
    update public.integracao_documentos_observacoes set excluido_em=clock_timestamp(),versao=versao+1 where id=alvo and versao=esperada returning * into r;
  else
    if r.excluido_em is null then raise exception 'Observação já está ativa' using errcode='22023'; end if;
    update public.integracao_documentos_observacoes set excluido_em=null,versao=versao+1 where id=alvo and versao=esperada returning * into r;
  end if;
  if not found then raise exception 'Conflito de versão. Confira a observação atual' using errcode='40001'; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.integracao_documentos_observacoes_operar(text,text,jsonb) from public,anon;
grant execute on function public.integracao_documentos_observacoes_operar(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

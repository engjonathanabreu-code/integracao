-- Prepared, disabled support protocol. No business table, receipt or local queue is changed.
-- Binding an operator and enabling execution require a separately reviewed activation.
create schema integracao_suporte_privado;
revoke all on schema integracao_suporte_privado from public,anon,authenticated,service_role;
create table integracao_suporte_privado.config (
 id boolean primary key default true check(id), operador uuid references public.profiles(id),
 habilitado boolean not null default false,
 ttl_segundos integer not null default 300 check(ttl_segundos between 60 and 900),
 intervalo_segundos integer not null default 60 check(intervalo_segundos between 30 and 3600),
 lease_segundos integer not null default 60 check(lease_segundos between 15 and 120 and lease_segundos<=ttl_segundos),
 retencao_dias integer not null default 90 check(retencao_dias between 7 and 3650)
);
insert into integracao_suporte_privado.config(id) values(true);
create table integracao_suporte_privado.dispositivos (
 usuario_id uuid not null references public.profiles(id),instalacao_id uuid not null,
 diagnostico_instalacao_id uuid not null,prova_hash bytea not null,
 versao text not null check(versao ~ '^[a-zA-Z0-9._-]{1,64}$'), protocolo integer not null check(protocolo=1),
 ultimo_contato timestamptz not null default clock_timestamp(), primary key(usuario_id,instalacao_id)
);
create table integracao_suporte_privado.solicitacoes (
 id uuid primary key, atendimento uuid not null, operador uuid not null references public.profiles(id),operador_sessao uuid not null,
 usuario_id uuid not null,instalacao_id uuid not null,
 tipo text not null check(tipo in ('diagnostico','consultar_recibo','retomar_automaticas','reler_confirmacao','solicitar_atualizacao','revisar_bloqueios')),
 pedido uuid,estado text not null default 'criada' check(estado in ('criada','recebida','iniciada','concluida','negada','vencida','cancelada','resultado_incerto')),
 criado_em timestamptz not null default clock_timestamp(),expira_em timestamptz not null,
 consumidor uuid,executor_sessao uuid,lease_ate timestamptz,recebimentos integer not null default 0,
 recebido_em timestamptz,iniciado_em timestamptz,concluido_em timestamptz,
 resultado jsonb,recibo_no_servidor boolean not null default false,
 foreign key(usuario_id,instalacao_id) references integracao_suporte_privado.dispositivos(usuario_id,instalacao_id),
 check(tipo not in ('consultar_recibo','reler_confirmacao') or pedido is not null)
);
create unique index suporte_um_ativo_aparelho on integracao_suporte_privado.solicitacoes(usuario_id,instalacao_id)
 where estado in ('criada','recebida','iniciada');
create index suporte_historico_alvo on integracao_suporte_privado.solicitacoes(usuario_id,instalacao_id,criado_em desc);
create table integracao_suporte_privado.auditoria (
 id bigint generated always as identity primary key,solicitacao_id uuid not null references integracao_suporte_privado.solicitacoes(id),
 ator uuid,evento text not null check(evento in ('criada','recebida','iniciada','concluida','negada','vencida','cancelada','resultado_incerto','resultado_tardio')),
 resultado jsonb,
 motivo text check(motivo in ('EXPIRADA','LEASE_EXPIRADA','OPERADOR_REVOGADO','SUPORTE_DESATIVADO','LIMITE_RECEBIMENTOS','CANCELAMENTO_SOLICITADO')),
 criado_em timestamptz not null default clock_timestamp()
);
create unique index suporte_um_resultado_tardio on integracao_suporte_privado.auditoria(solicitacao_id) where evento='resultado_tardio';
alter table integracao_suporte_privado.config enable row level security;
alter table integracao_suporte_privado.dispositivos enable row level security;
alter table integracao_suporte_privado.solicitacoes enable row level security;
alter table integracao_suporte_privado.auditoria enable row level security;
revoke all on all tables in schema integracao_suporte_privado from public,anon,authenticated,service_role;
revoke all on all sequences in schema integracao_suporte_privado from public,anon,authenticated,service_role;

create function integracao_suporte_privado.auditoria_imutavel() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin raise exception 'Auditoria de suporte somente de acréscimo' using errcode='42501';end $$;
create trigger auditoria_imutavel before update or delete on integracao_suporte_privado.auditoria
 for each row execute function integracao_suporte_privado.auditoria_imutavel();

create function integracao_suporte_privado.sessao_valida(usuario uuid,sessao uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select usuario is not null and sessao is not null
  and exists(select 1 from public.profiles p where p.id=usuario and p.ativo)
  and exists(select 1 from auth.sessions s where s.id=sessao and s.user_id=usuario and (s.not_after is null or s.not_after>clock_timestamp()))
$$;
create function integracao_suporte_privado.args_validos(valor jsonb,permitidos text[],obrigatorios text[]) returns void
 language plpgsql immutable security invoker set search_path='' as $$
begin
 if valor is null or jsonb_typeof(valor)<>'object' or octet_length(valor::text)>65536
  or valor-permitidos<>'{}'::jsonb or not(valor ?& obrigatorios) then
  raise exception 'Argumentos de suporte inválidos' using errcode='22023';
 end if;
end $$;
create function integracao_suporte_privado.uuid_arg(valor jsonb) returns uuid
 language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(valor)<>'string' or (valor#>>'{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or valor is null then
  raise exception 'Identificador de suporte inválido' using errcode='22023';
 end if;
 return (valor#>>'{}')::uuid;
end $$;
-- Installation IDs are labels, not credentials. Only a browser retaining this
-- per-account, 256-bit local proof can receive commands for the registered ID.
-- Keep only a hash; never include the proof/hash in results, audit or panel data.
create function integracao_suporte_privado.prova_hash(valor jsonb) returns bytea
 language plpgsql immutable security invoker set search_path='' as $$
begin
 if valor is null or jsonb_typeof(valor)<>'string' or (valor#>>'{}') !~ '^[0-9a-fA-F]{64}$' then
  raise exception 'Prova de instalação inválida' using errcode='22023';
 end if;
 return pg_catalog.sha256(pg_catalog.decode(valor#>>'{}','hex'));
end $$;
create function integracao_suporte_privado.resultado_valido(valor jsonb) returns void
 language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; dependencia jsonb;
begin
 perform integracao_suporte_privado.args_validos(valor,array['codigo','itens'],array['codigo','itens']);
 if jsonb_typeof(valor->'codigo')<>'string' or valor->>'codigo' not in
  ('DIAGNOSTICO','RECIBO_LOCAL','RECIBO_ENCONTRADO','SEM_RECIBO','LEITURA_CONFIRMADA','LEITURA_DIVERGENTE','REVISAO_NECESSARIA','EM_ANDAMENTO','ATUALIZACAO_SOLICITADA','SESSAO_ALTERADA','SEM_ALTERACAO','PERSISTENCIA_INDISPONIVEL','ARQUIVO_LOCAL_AUSENTE','RESULTADO_INCERTO','PEDIDO_AUSENTE')
  or jsonb_typeof(valor->'itens')<>'array' or jsonb_array_length(valor->'itens')>100 then
  raise exception 'Resultado de suporte inválido' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(valor->'itens') loop
  perform integracao_suporte_privado.args_validos(item,
   array['id','pedido','estado','codigo','fase','tentativas','temRecibo','dependencias','restricao','espera'],
   array['id','pedido','estado','codigo','fase','tentativas','temRecibo','dependencias','restricao','espera']);
  perform integracao_suporte_privado.uuid_arg(item->'id');perform integracao_suporte_privado.uuid_arg(item->'pedido');
  if jsonb_typeof(item->'estado')<>'string' or item->>'estado' not in
   ('persistencia_falhou','legado_revisao','pendente_local','resultado_desconhecido','confirmado_aguardando_leitura','bloqueado_conflito','bloqueado_validacao','falha_transitoria','confirmado','substituido','dispensado')
   or jsonb_typeof(item->'codigo')<>'string' or not(item->>'codigo' ~ '^[0-9A-Z]{5}$' or item->>'codigo' in
   ('SEM_ERRO','OUTRO','SESSAO_EXPIRADA','SESSAO_AUSENTE','TRANSPORTE','LEITURA_DIVERGENTE','ARQUIVO_LOCAL_AUSENTE','RESPONSAVEL_INDISPONIVEL','IDENTIDADE_OUTRA_META','PERSISTENCIA_INDISPONIVEL','PERSISTENCIA_ABORTADA','FILA_BLOQUEADA'))
   or (item->'fase'<>'null'::jsonb and (jsonb_typeof(item->'fase')<>'string' or item->>'fase' not in ('preparacao','envio','recibo','releitura')))
   or jsonb_typeof(item->'tentativas')<>'number' or item->>'tentativas' !~ '^[0-9]{1,9}$'
   or jsonb_typeof(item->'temRecibo')<>'boolean' or jsonb_typeof(item->'dependencias')<>'array' or jsonb_array_length(item->'dependencias')>100
   or (item->'restricao'<>'null'::jsonb and (jsonb_typeof(item->'restricao')<>'string' or item->>'restricao' not in
    ('fin_receb_clientes_dia_vencimento_check','fin_receb_clientes_numero_parcelas_check','integracao_moradores_colecao_check','integracao_moradores_dados_check','processos_kanban_etapa_atual_check','processos_kanban_etapa_prefeitura_check','processos_kanban_prioridade_check','profiles_tipo_check')))
   or jsonb_typeof(item->'espera')<>'string' or item->>'espera' not in
    ('nao_verificado','encerrado','revisao','retomada_manual','intervalo_de_tentativa','reserva_ativa','pedido_anterior','dependencia','pronto_para_verificacao') then
   raise exception 'Diagnóstico de suporte inválido' using errcode='22023';
  end if;
  for dependencia in select value from jsonb_array_elements(item->'dependencias') loop perform integracao_suporte_privado.uuid_arg(dependencia);end loop;
 end loop;
end $$;
create function integracao_suporte_privado.registrar(sid uuid,evento text,motivo text default null) returns void
 language sql volatile security invoker set search_path='' as $$
 insert into integracao_suporte_privado.auditoria(solicitacao_id,ator,evento,motivo) values(sid,auth.uid(),evento,motivo)
$$;
create function integracao_suporte_privado.visivel(s integracao_suporte_privado.solicitacoes) returns jsonb
 language sql immutable security invoker set search_path='' as $$
 select to_jsonb(s)-array['operador_sessao','executor_sessao','consumidor','lease_ate']||jsonb_build_object('leitura_comprovacao','relato_aparelho')
$$;
create function integracao_suporte_privado.expirar(alvo uuid default null,instalacao uuid default null) returns void
 language plpgsql volatile security invoker set search_path='' as $$
declare c integracao_suporte_privado.config; s integracao_suporte_privado.solicitacoes; novo text; motivo text;agora timestamptz:=clock_timestamp();
begin
 select * into c from integracao_suporte_privado.config where id;
 for s in select * from integracao_suporte_privado.solicitacoes q where q.estado in ('criada','recebida','iniciada')
  and (alvo is null or q.usuario_id=alvo) and (instalacao is null or q.instalacao_id=instalacao)
  and (q.expira_em<=agora or (q.estado='iniciada' and q.lease_ate<=agora)
   or not c.habilitado or c.operador is distinct from q.operador or not integracao_suporte_privado.sessao_valida(q.operador,q.operador_sessao)
   or (q.estado='recebida' and q.lease_ate<=agora and q.recebimentos>=3)) for update skip locked loop
  motivo:=case when not c.habilitado then 'SUPORTE_DESATIVADO'
   when c.operador is distinct from s.operador or not integracao_suporte_privado.sessao_valida(s.operador,s.operador_sessao) then 'OPERADOR_REVOGADO'
   when s.estado='iniciada' and s.lease_ate<=agora then 'LEASE_EXPIRADA'
   when s.estado='recebida' and s.lease_ate<=agora and s.recebimentos>=3 then 'LIMITE_RECEBIMENTOS' else 'EXPIRADA' end;
  novo:=case when s.estado='iniciada' then 'resultado_incerto' when motivo in ('SUPORTE_DESATIVADO','OPERADOR_REVOGADO','LIMITE_RECEBIMENTOS') then 'negada' else 'vencida' end;
  update integracao_suporte_privado.solicitacoes set estado=novo,concluido_em=agora where id=s.id;
  perform integracao_suporte_privado.registrar(s.id,novo,motivo);
 end loop;
end $$;

create function integracao_suporte_privado.operar(acao text,args jsonb) returns jsonb
 language plpgsql volatile security definer set search_path='' as $$
declare c integracao_suporte_privado.config; s integracao_suporte_privado.solicitacoes;alvo uuid;instalacao uuid;nonce uuid;atendimento_id uuid;pedido_id uuid;consumidor_id uuid;
 usuario uuid:=auth.uid();sessao uuid;prova bytea;quantidade integer;agora timestamptz:=clock_timestamp();tipo_acao text;novo_estado text;resultado_arg jsonb;d jsonb;historico jsonb;auditoria jsonb;
begin
 if acao is null or acao not in ('capacidade','listar','contatar','solicitar','receber','autorizar','validar_execucao','concluir','cancelar') then raise exception 'Ação de suporte inválida' using errcode='22023';end if;
 select * into c from integracao_suporte_privado.config where id for share;
 begin sessao:=nullif(auth.jwt()->>'session_id','')::uuid;exception when invalid_text_representation then sessao:=null;end;
 if acao='capacidade' then
  perform integracao_suporte_privado.args_validos(args,array[]::text[],array[]::text[]);
  return jsonb_build_object('operador',coalesce(c.operador=usuario and integracao_suporte_privado.sessao_valida(usuario,sessao),false),'habilitado',coalesce(c.habilitado,false));
 end if;
 if not integracao_suporte_privado.sessao_valida(usuario,sessao) then raise exception 'Suporte não autorizado' using errcode='42501';end if;
 if acao in ('listar','solicitar','cancelar') and (c.operador is null or c.operador<>usuario) then raise exception 'Suporte não autorizado' using errcode='42501';end if;
 if acao='listar' then
  perform integracao_suporte_privado.args_validos(args,array[]::text[],array[]::text[]);
  perform integracao_suporte_privado.expirar();
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ultimo_contato desc),'[]') into d from (
   select coalesce(n.usuario_id,h.usuario_id) usuario_id,p.nome,coalesce(n.instalacao_id,h.instalacao_id) instalacao_id,
    coalesce(n.versao,h.versao) versao,coalesce(n.ultimo_contato,h.ultimo_contato) ultimo_contato,n.protocolo,n.diagnostico_instalacao_id,
    h.ultimo_contato ultimo_relato,coalesce(h.resumo,'[]'::jsonb) resumo
   from integracao_suporte_privado.dispositivos n full join public.integracao_sincronizacao_dispositivos h on h.usuario_id=n.usuario_id and h.instalacao_id=n.diagnostico_instalacao_id
   join public.profiles p on p.id=coalesce(n.usuario_id,h.usuario_id)
  )t;
  select coalesce(jsonb_agg(integracao_suporte_privado.visivel(t) order by t.criado_em desc),'[]') into historico from (select * from integracao_suporte_privado.solicitacoes order by criado_em desc limit 100)t;
  select coalesce(jsonb_agg((to_jsonb(t)-'criado_em')||jsonb_build_object('em',t.criado_em) order by t.id desc),'[]') into auditoria from (select * from integracao_suporte_privado.auditoria order by id desc limit 100)t;
  return jsonb_build_object('config',to_jsonb(c)-array['id','operador'],'dispositivos',d,'solicitacoes',historico,'auditoria',auditoria);
 elsif acao='cancelar' then
  perform integracao_suporte_privado.args_validos(args,array['id'],array['id']);nonce:=integracao_suporte_privado.uuid_arg(args->'id');
  perform integracao_suporte_privado.expirar();select * into s from integracao_suporte_privado.solicitacoes where id=nonce for update;
  if not found then raise exception 'Solicitação indisponível' using errcode='42501';end if;
  if s.estado in ('criada','recebida','iniciada') then
   novo_estado:=case when s.estado='iniciada' then 'resultado_incerto' else 'cancelada' end;
   update integracao_suporte_privado.solicitacoes set estado=novo_estado,concluido_em=agora where id=s.id returning * into s;
   perform integracao_suporte_privado.registrar(s.id,novo_estado,'CANCELAMENTO_SOLICITADO');
  end if;
  return integracao_suporte_privado.visivel(s);
 end if;
 -- Disabled support never delivers or executes commands. The review-only owner
 -- can still inspect history and revoke pending commands through the paths above.
 if not coalesce(c.habilitado,false) or c.operador is null then
  if acao='receber' then return jsonb_build_object('comando',null,'habilitado',false);end if;
  raise exception 'Suporte desativado' using errcode='42501';
 end if;
 if acao='contatar' then
  perform integracao_suporte_privado.args_validos(args,array['instalacao_id','diagnostico_instalacao_id','prova_instalacao','versao','protocolo'],array['instalacao_id','diagnostico_instalacao_id','prova_instalacao','versao','protocolo']);
  instalacao:=integracao_suporte_privado.uuid_arg(args->'instalacao_id');prova:=integracao_suporte_privado.prova_hash(args->'prova_instalacao');
  if jsonb_typeof(args->'versao')<>'string' or args->>'versao' !~ '^[a-zA-Z0-9._-]{1,64}$' or args->'protocolo'<>'1'::jsonb then raise exception 'Dispositivo inválido' using errcode='22023';end if;
  insert into integracao_suporte_privado.dispositivos(usuario_id,instalacao_id,diagnostico_instalacao_id,prova_hash,versao,protocolo,ultimo_contato)
   values(usuario,instalacao,integracao_suporte_privado.uuid_arg(args->'diagnostico_instalacao_id'),prova,args->>'versao',1,agora)
   on conflict(usuario_id,instalacao_id) do update set versao=excluded.versao,protocolo=excluded.protocolo,ultimo_contato=excluded.ultimo_contato
   where integracao_suporte_privado.dispositivos.prova_hash=excluded.prova_hash
    and integracao_suporte_privado.dispositivos.diagnostico_instalacao_id=excluded.diagnostico_instalacao_id;
  get diagnostics quantidade=row_count;
  if quantidade<>1 then raise exception 'Instalação indisponível' using errcode='42501';end if;
  return jsonb_build_object('habilitado',true);
 elsif acao='solicitar' then
  perform integracao_suporte_privado.args_validos(args,array['id','atendimento','usuario_id','instalacao_id','tipo','pedido'],array['id','atendimento','usuario_id','instalacao_id','tipo']);
  nonce:=integracao_suporte_privado.uuid_arg(args->'id');atendimento_id:=integracao_suporte_privado.uuid_arg(args->'atendimento');
  alvo:=integracao_suporte_privado.uuid_arg(args->'usuario_id');instalacao:=integracao_suporte_privado.uuid_arg(args->'instalacao_id');
  if args ? 'pedido' and args->'pedido'<>'null'::jsonb then pedido_id:=integracao_suporte_privado.uuid_arg(args->'pedido');end if;
  tipo_acao:=args->>'tipo';
  if jsonb_typeof(args->'tipo')<>'string' or tipo_acao not in ('diagnostico','consultar_recibo','retomar_automaticas','reler_confirmacao','solicitar_atualizacao','revisar_bloqueios')
   or (tipo_acao in ('consultar_recibo','reler_confirmacao') and pedido_id is null) then raise exception 'Tipo ou pedido inválido' using errcode='22023';end if;
  -- Serializes nonces and rate limits across different support tabs.
  perform pg_advisory_xact_lock(hashtextextended('integracao-suporte-operador:'||usuario::text,0));
  select * into s from integracao_suporte_privado.solicitacoes where id=nonce;
  if found then
   if s.operador<>usuario or s.atendimento<>atendimento_id or s.usuario_id<>alvo or s.instalacao_id<>instalacao or s.tipo<>tipo_acao or s.pedido is distinct from pedido_id then raise exception 'Identidade de solicitação já utilizada' using errcode='22023';end if;
   return integracao_suporte_privado.visivel(s);
  end if;
  perform integracao_suporte_privado.expirar(alvo,instalacao);
  if not exists(select 1 from integracao_suporte_privado.dispositivos n join public.profiles p on p.id=n.usuario_id where n.usuario_id=alvo and n.instalacao_id=instalacao and p.ativo and n.protocolo=1 and n.ultimo_contato>agora-interval '120 seconds') then raise exception 'Aparelho indisponível ou incompatível' using errcode='22023';end if;
  if exists(select 1 from integracao_suporte_privado.solicitacoes q where q.usuario_id=alvo and q.instalacao_id=instalacao and (q.estado in ('criada','recebida','iniciada') or q.criado_em>agora-make_interval(secs=>c.intervalo_segundos))) then raise exception 'Aguarde a solicitação anterior' using errcode='55000';end if;
  insert into integracao_suporte_privado.solicitacoes(id,atendimento,operador,operador_sessao,usuario_id,instalacao_id,tipo,pedido,expira_em)
   values(nonce,atendimento_id,usuario,sessao,alvo,instalacao,tipo_acao,pedido_id,agora+make_interval(secs=>c.ttl_segundos)) returning * into s;
  perform integracao_suporte_privado.registrar(s.id,'criada');return integracao_suporte_privado.visivel(s);
 elsif acao='receber' then
  perform integracao_suporte_privado.args_validos(args,array['instalacao_id','consumidor','prova_instalacao'],array['instalacao_id','consumidor','prova_instalacao']);
  instalacao:=integracao_suporte_privado.uuid_arg(args->'instalacao_id');consumidor_id:=integracao_suporte_privado.uuid_arg(args->'consumidor');
  prova:=integracao_suporte_privado.prova_hash(args->'prova_instalacao');
  if not exists(select 1 from integracao_suporte_privado.dispositivos n where n.usuario_id=usuario and n.instalacao_id=instalacao and n.prova_hash=prova) then raise exception 'Instalação indisponível' using errcode='42501';end if;
  perform integracao_suporte_privado.expirar(usuario,instalacao);
  select * into s from integracao_suporte_privado.solicitacoes q where q.usuario_id=usuario and q.instalacao_id=instalacao and q.estado='recebida' and q.consumidor=consumidor_id and q.executor_sessao=sessao and q.lease_ate>agora for update skip locked;
  if found then return jsonb_build_object('habilitado',true,'comando',integracao_suporte_privado.visivel(s));end if;
  select * into s from integracao_suporte_privado.solicitacoes q where q.usuario_id=usuario and q.instalacao_id=instalacao
   and (q.estado='criada' or (q.estado='recebida' and q.lease_ate<=agora and q.recebimentos<3)) order by q.criado_em for update skip locked limit 1;
  if not found then return jsonb_build_object('comando',null,'habilitado',true);end if;
  update integracao_suporte_privado.solicitacoes set estado='recebida',consumidor=consumidor_id,executor_sessao=sessao,recebido_em=agora,recebimentos=recebimentos+1,lease_ate=least(expira_em,agora+make_interval(secs=>c.lease_segundos)) where id=s.id returning * into s;
  perform integracao_suporte_privado.registrar(s.id,'recebida');return jsonb_build_object('habilitado',true,'comando',integracao_suporte_privado.visivel(s));
 elsif acao in ('autorizar','validar_execucao','concluir') then
  if acao in ('autorizar','validar_execucao') then perform integracao_suporte_privado.args_validos(args,array['id','instalacao_id','consumidor','prova_instalacao'],array['id','instalacao_id','consumidor','prova_instalacao']);
  else perform integracao_suporte_privado.args_validos(args,array['id','instalacao_id','consumidor','prova_instalacao','estado','resultado'],array['id','instalacao_id','consumidor','prova_instalacao','estado','resultado']);end if;
  nonce:=integracao_suporte_privado.uuid_arg(args->'id');instalacao:=integracao_suporte_privado.uuid_arg(args->'instalacao_id');consumidor_id:=integracao_suporte_privado.uuid_arg(args->'consumidor');
  prova:=integracao_suporte_privado.prova_hash(args->'prova_instalacao');
  if not exists(select 1 from integracao_suporte_privado.dispositivos n where n.usuario_id=usuario and n.instalacao_id=instalacao and n.prova_hash=prova) then raise exception 'Instalação indisponível' using errcode='42501';end if;
  perform integracao_suporte_privado.expirar(usuario,instalacao);
  select * into s from integracao_suporte_privado.solicitacoes where id=nonce and usuario_id=usuario and instalacao_id=instalacao for update;
  if not found or s.consumidor is distinct from consumidor_id or s.executor_sessao is distinct from sessao then raise exception 'Solicitação indisponível' using errcode='42501';end if;
  if acao='validar_execucao' then
   return jsonb_build_object('autorizado',s.estado='iniciada' and s.expira_em>agora and s.lease_ate>agora);
  end if;
  if acao='autorizar' then
   if s.estado<>'recebida' or s.expira_em<=agora or s.lease_ate<=agora then return jsonb_build_object('autorizado',false);end if;
   update integracao_suporte_privado.solicitacoes set estado='iniciada',iniciado_em=agora where id=s.id;
   perform integracao_suporte_privado.registrar(s.id,'iniciada');return jsonb_build_object('autorizado',true);
  end if;
  novo_estado:=args->>'estado';resultado_arg:=args->'resultado';
  if jsonb_typeof(args->'estado')<>'string' or novo_estado not in ('concluida','negada','resultado_incerto') then raise exception 'Estado inválido' using errcode='22023';end if;
  perform integracao_suporte_privado.resultado_valido(resultado_arg);
  if s.estado in ('concluida','negada','resultado_incerto') and s.resultado is not null then
   if s.estado<>novo_estado or s.resultado<>resultado_arg then raise exception 'Resultado já registrado' using errcode='22023';end if;
   return jsonb_build_object('aceito',true,'estado',s.estado,'recibo_no_servidor',s.recibo_no_servidor,'leitura_comprovacao','relato_aparelho');
  end if;
  if s.estado<>'iniciada' or s.expira_em<=agora or s.lease_ate<=agora then
   if s.iniciado_em is not null and s.estado in ('negada','vencida','cancelada','resultado_incerto') then
    insert into integracao_suporte_privado.auditoria(solicitacao_id,ator,evento,resultado) values(s.id,usuario,'resultado_tardio',resultado_arg) on conflict do nothing;
   end if;
   return jsonb_build_object('aceito',false,'estado',s.estado);
  end if;
  update integracao_suporte_privado.solicitacoes q set estado=novo_estado,resultado=resultado_arg,concluido_em=agora,
   recibo_no_servidor=exists(select 1 from public.integracao_pedidos p where p.usuario_id=q.usuario_id and p.pedido=q.pedido)
   where q.id=s.id returning * into s;
  perform integracao_suporte_privado.registrar(s.id,novo_estado);
  return jsonb_build_object('aceito',true,'estado',s.estado,'recibo_no_servidor',s.recibo_no_servidor,'leitura_comprovacao','relato_aparelho');
 end if;
 raise exception 'Ação indisponível' using errcode='22023';
end $$;
create function public.integracao_suporte_operar(acao text,args jsonb default '{}'::jsonb) returns jsonb
 language sql volatile security invoker set search_path='' as $$
 select integracao_suporte_privado.operar(acao,args)
$$;
revoke all on all functions in schema integracao_suporte_privado from public,anon,authenticated,service_role;
grant usage on schema integracao_suporte_privado to authenticated;
grant execute on function integracao_suporte_privado.operar(text,jsonb) to authenticated;
revoke all on function public.integracao_suporte_operar(text,jsonb) from public,anon,service_role;
grant execute on function public.integracao_suporte_operar(text,jsonb) to authenticated;
comment on schema integracao_suporte_privado is 'Suporte limitado e desativado por padrão; operador único configurado somente por administração SQL após revisão. Nenhum comando genérico ou conteúdo cadastral.';

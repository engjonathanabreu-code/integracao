-- Alarme de "laço de repetição" no banco.
--
-- Em 24–25/11/2026 três requisições ficaram ~15 horas sendo repetidas pelo PostgREST
-- (SQLSTATE 40001), a ~170 transações desfeitas por segundo, sem que ninguém percebesse.
-- A causa foi removida (20260928152249 e 20261125135233). Esta migration instala só o
-- alarme: a cada 2 minutos o pg_cron chama integracao_monitor_privado.verificar(), que lê
-- uma linha de pg_stat_database, compara com a amostra anterior e, se as transações
-- desfeitas dispararem em duas verificações seguidas, registra um alerta e cria UMA
-- notificação para a diretoria.
--
-- A função NUNCA encerra sessões nem altera nada fora das próprias tabelas, da notificação
-- e do histórico de execuções do próprio job no pg_cron.
--
-- Reexecutável: pode ser aplicada de novo sem perder amostras, alertas nem os limites já
-- ajustados (as funções são recriadas; o job é reagendado com o mesmo nome).
-- Reversão: supabase/operacoes/monitor-lacos-repeticao-reversao.sql
-- Documento: docs/monitor-lacos-repeticao-20261125.md

create schema if not exists integracao_monitor_privado;
revoke all on schema integracao_monitor_privado from public, anon, authenticated;

-- Limites em uma linha, para ajuste por UPDATE sem reescrever a função.
create table if not exists integracao_monitor_privado.configuracao (
  id boolean primary key default true check (id),
  ativo boolean not null default true,
  -- A amostra atual é comparada com a de ~janela_minutos antes. Mantenha igual ao intervalo
  -- do agendamento (2 min): assim "duas verificações seguidas" são dois intervalos distintos.
  janela_minutos integer not null default 2 check (janela_minutos between 1 and 60),
  -- Dispara quando as desfeitas por minuto passam deste valor E superam as confirmadas.
  limite_desfeitas_minuto integer not null default 600 check (limite_desfeitas_minuto > 0),
  -- Não repete alerta do mesmo tipo dentro deste intervalo.
  silencio_minutos integer not null default 60 check (silencio_minutos >= 1),
  -- Sessão suspeita: conexão aberta há mais que isto...
  sessao_antiga_minutos integer not null default 10 check (sessao_antiga_minutos >= 1),
  -- ...com transação iniciada há menos que isto (sinal de reexecução).
  transacao_recente_segundos integer not null default 5 check (transacao_recente_segundos >= 1)
);
insert into integracao_monitor_privado.configuracao (id) values (true) on conflict (id) do nothing;

create table if not exists integracao_monitor_privado.amostras (
  id bigint generated always as identity primary key,
  instante timestamptz not null default clock_timestamp(),
  xact_rollback bigint not null,
  xact_commit bigint not null,
  -- Esta verificação ficou acima do limite (usado para exigir duas seguidas).
  acima boolean not null default false
);
create index if not exists amostras_instante_idx on integracao_monitor_privado.amostras (instante);

create table if not exists integracao_monitor_privado.alertas (
  id bigint generated always as identity primary key,
  instante timestamptz not null default clock_timestamp(),
  tipo text not null,
  detalhes jsonb not null default '{}'::jsonb,
  notificado boolean not null default false
);
create index if not exists alertas_tipo_instante_idx on integracao_monitor_privado.alertas (tipo, instante);

-- RLS habilitado e sem políticas: nenhum papel de API lê ou grava, mesmo que receba grant.
alter table integracao_monitor_privado.configuracao enable row level security;
alter table integracao_monitor_privado.amostras enable row level security;
alter table integracao_monitor_privado.alertas enable row level security;
revoke all on all tables in schema integracao_monitor_privado from public, anon, authenticated;
revoke all on all sequences in schema integracao_monitor_privado from public, anon, authenticated;

-- Única leitura de pg_stat_database. Fica separada da regra para que a regra possa ser
-- testada com contadores conhecidos; não há parâmetro nem "modo de teste".
create or replace function integracao_monitor_privado.ler_contadores(
  out xact_rollback bigint, out xact_commit bigint)
language sql stable set search_path = '' as $$
  select d.xact_rollback, d.xact_commit
    from pg_catalog.pg_stat_database d
   where d.datname = pg_catalog.current_database();
$$;

-- Sessões do PostgREST (papel authenticator) com conexão antiga e transação recém-iniciada.
-- Devolve só pid, início da conexão e o começo do texto do comando; o texto em
-- pg_stat_activity não traz os valores dos parâmetros.
create or replace function integracao_monitor_privado.sessoes_suspeitas(
  antiga_minutos integer, recente_segundos integer)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'pid', s.pid,
           'backend_start', s.backend_start,
           'consulta', s.consulta) order by s.backend_start), '[]'::jsonb)
    from (
      select a.pid, a.backend_start,
             left(regexp_replace(coalesce(a.query, ''), '\s+', ' ', 'g'), 120) as consulta
        from pg_catalog.pg_stat_activity a
       where a.usename = 'authenticator'
         and a.state = 'active'
         and a.backend_start < clock_timestamp() - make_interval(mins => antiga_minutos)
         and a.xact_start > clock_timestamp() - make_interval(secs => recente_segundos)
       order by a.backend_start
       limit 10
    ) s;
$$;

create or replace function integracao_monitor_privado.verificar()
returns jsonb language plpgsql security definer
set search_path = '' set lock_timeout = '3s' as $$
declare
  -- Valores usados se a linha de configuração tiver sido apagada.
  v_ativo boolean := true;
  v_janela integer := 2;
  v_limite integer := 600;
  v_silencio integer := 60;
  v_sessao_antiga integer := 10;
  v_transacao_recente integer := 5;
  c_tipo constant text := 'laco_repeticao';
  c_job constant text := 'integracao-monitor-lacos';
  c_tolerancia constant interval := interval '30 seconds';
  cfg record;
  agora timestamptz := clock_timestamp();
  atual_desfeitas bigint;
  atual_confirmadas bigint;
  anterior record;
  referencia record;
  desfeitas bigint;
  confirmadas bigint;
  minutos numeric;
  por_minuto numeric;
  reiniciado boolean := false;
  acima boolean := false;
  alertar boolean := false;
  silenciado boolean := false;
  sessoes jsonb := '[]'::jsonb;
  detalhes jsonb;
  autor uuid;
  notificacao_id text;
  notificado boolean := false;
  alerta_id bigint;
begin
  -- Uma verificação por vez (execução manual junto com a agendada não duplica alerta).
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('integracao_monitor_privado.verificar')) then
    return jsonb_build_object('executado', false, 'motivo', 'outra verificação em andamento');
  end if;

  select * into cfg from integracao_monitor_privado.configuracao where id;
  if found then
    v_ativo := cfg.ativo; v_janela := cfg.janela_minutos; v_limite := cfg.limite_desfeitas_minuto;
    v_silencio := cfg.silencio_minutos; v_sessao_antiga := cfg.sessao_antiga_minutos;
    v_transacao_recente := cfg.transacao_recente_segundos;
  end if;
  if not v_ativo then
    return jsonb_build_object('executado', false, 'motivo', 'monitor desligado na configuração');
  end if;

  select c.xact_rollback, c.xact_commit into atual_desfeitas, atual_confirmadas
    from integracao_monitor_privado.ler_contadores() c;
  if atual_desfeitas is null or atual_confirmadas is null then
    return jsonb_build_object('executado', false, 'motivo', 'contadores indisponíveis');
  end if;

  -- Verificação imediatamente anterior (para exigir duas seguidas).
  select a.instante, a.acima into anterior
    from integracao_monitor_privado.amostras a order by a.instante desc, a.id desc limit 1;

  -- Amostra de referência: a mais recente com pelo menos ~janela_minutos de idade. Se uma
  -- execução do agendamento tiver sido pulada, aceita uma amostra de até 3 janelas atrás.
  select a.instante, a.xact_rollback, a.xact_commit into referencia
    from integracao_monitor_privado.amostras a
   where a.instante <= agora - make_interval(mins => v_janela) + c_tolerancia
     and a.instante >= agora - make_interval(mins => 3 * v_janela)
   order by a.instante desc, a.id desc limit 1;

  if referencia.instante is not null then
    -- Reinício do banco zera pg_stat_database: contador menor que o de qualquer amostra
    -- desde a referência significa que a diferença não é confiável; não avalia nem alerta.
    reiniciado := exists (
      select 1 from integracao_monitor_privado.amostras a
       where a.instante >= referencia.instante
         and (a.xact_rollback > atual_desfeitas or a.xact_commit > atual_confirmadas));
    if not reiniciado then
      desfeitas := atual_desfeitas - referencia.xact_rollback;
      confirmadas := atual_confirmadas - referencia.xact_commit;
      minutos := extract(epoch from agora - referencia.instante) / 60.0;
      por_minuto := round(desfeitas / minutos, 1);
      acima := por_minuto > v_limite and desfeitas > confirmadas;
    end if;
  end if;

  insert into integracao_monitor_privado.amostras (instante, xact_rollback, xact_commit, acima)
  values (agora, atual_desfeitas, atual_confirmadas, acima);

  -- Duas verificações consecutivas acima do limite (a anterior precisa ser recente).
  alertar := acima and coalesce(anterior.acima, false)
    and anterior.instante >= agora - make_interval(mins => 3 * v_janela);

  if alertar and exists (
       select 1 from integracao_monitor_privado.alertas x
        where x.tipo = c_tipo and x.instante > agora - make_interval(mins => v_silencio)) then
    alertar := false;
    silenciado := true;
  end if;

  if alertar then
    detalhes := jsonb_build_object(
      'desfeitas_por_minuto', por_minuto,
      'desfeitas_na_janela', desfeitas,
      'confirmadas_na_janela', confirmadas,
      'janela_minutos', round(minutos, 2),
      'limite_desfeitas_minuto', v_limite);

    begin
      sessoes := integracao_monitor_privado.sessoes_suspeitas(v_sessao_antiga, v_transacao_recente);
      detalhes := detalhes || jsonb_build_object('sessoes_suspeitas', sessoes);
    exception when others then
      detalhes := detalhes || jsonb_build_object('erro_sessoes', sqlerrm);
    end;

    -- A notificação é opcional: qualquer falha fica registrada no alerta e a verificação segue.
    begin
      -- criado_por é obrigatório (FK para auth.users): o Administrador ativo de menor id.
      select p.id into autor
        from public.profiles p
        join auth.users u on u.id = p.id
       where p.ativo and p.tipo = 'Administrador'
       order by p.id limit 1;
      if autor is null then
        detalhes := detalhes || jsonb_build_object('erro_notificacao', 'nenhum Administrador ativo para assinar a notificação');
      else
        notificacao_id := gen_random_uuid()::text;
        -- Mesmo formato de novaNotificacao() no cliente: data em ISO 8601 UTC com
        -- milissegundos (Date.toISOString) e rota de uma página que todos acessam.
        insert into public.integracao_notificacoes (colecao, registro_id, dados, criado_por)
        values ('notificacoes', notificacao_id, jsonb_build_object(
          'id', notificacao_id,
          'data', to_char(agora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'titulo', 'Banco: possível laço de repetição',
          'texto', 'O banco está desfazendo cerca de ' || round(por_minuto)::text
            || ' transações por minuto, mais do que confirma. Acione o suporte técnico agora:'
            || ' o sistema não corrige isso sozinho.',
          'rota', jsonb_build_object('pag', 'home'),
          'setores', jsonb_build_array('diretoria'),
          'usuarios', '[]'::jsonb,
          'lidaPor', '[]'::jsonb), autor);
        notificado := true;
        detalhes := detalhes || jsonb_build_object('notificacao_id', notificacao_id);
      end if;
    exception when others then
      notificado := false;
      detalhes := (detalhes - 'notificacao_id') || jsonb_build_object('erro_notificacao', sqlerrm);
    end;

    insert into integracao_monitor_privado.alertas (instante, tipo, detalhes, notificado)
    values (agora, c_tipo, detalhes, notificado) returning id into alerta_id;
  end if;

  -- Retenção das próprias tabelas.
  delete from integracao_monitor_privado.amostras a where a.instante < agora - interval '7 days';
  delete from integracao_monitor_privado.alertas x where x.instante < agora - interval '90 days';

  -- Histórico do pg_cron: só as execuções deste job. Ignorado se o pg_cron não existir
  -- ou se o papel não tiver permissão.
  begin
    delete from cron.job_run_details d
     using cron.job j
     where j.jobid = d.jobid and j.jobname = c_job
       and d.end_time < agora - interval '3 days';
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'executado', true,
    'desfeitas_por_minuto', por_minuto,
    'desfeitas_na_janela', desfeitas,
    'confirmadas_na_janela', confirmadas,
    'contadores_reiniciados', reiniciado,
    'acima_do_limite', acima,
    'silenciado', silenciado,
    'alerta_id', alerta_id,
    'notificado', notificado);
end;
$$;

revoke all on function integracao_monitor_privado.ler_contadores() from public, anon, authenticated;
revoke all on function integracao_monitor_privado.sessoes_suspeitas(integer, integer) from public, anon, authenticated;
revoke all on function integracao_monitor_privado.verificar() from public, anon, authenticated;

comment on schema integracao_monitor_privado is
  'Alarme de laço de repetição (transações desfeitas em excesso). Ver docs/monitor-lacos-repeticao-20261125.md.';

-- Agendamento a cada 2 minutos, com nome fixo. Só é criado onde o pg_cron existe (em
-- produção existe); sem ele a migration instala tudo e avisa que o alarme não está agendado.
do $agendar$
begin
  if to_regclass('cron.job') is null or to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron ausente: integracao_monitor_privado.verificar() NÃO foi agendada; o alarme não roda sozinho.';
    return;
  end if;
  -- Remove o job de mesmo nome antes de criar, para não depender do comportamento de
  -- cada versão do pg_cron ao reagendar.
  execute $sql$select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'integracao-monitor-lacos'$sql$;
  execute $sql$select cron.schedule('integracao-monitor-lacos', '*/2 * * * *', 'select integracao_monitor_privado.verificar()')$sql$;
end
$agendar$;

-- Reversão de supabase/migrations/20261125142032_monitor_lacos_repeticao.sql.
-- Desagenda o job do pg_cron e remove funções, tabelas e o schema do monitor (amostras,
-- alertas e limites ajustados são perdidos). NÃO apaga as notificações já criadas em
-- public.integracao_notificacoes nem toca em qualquer outro objeto.
-- Sem CASCADE de propósito: se alguém tiver criado outro objeto no schema, a reversão
-- falha inteira em vez de removê-lo.
begin;
do $desagendar$
begin
  if to_regclass('cron.job') is not null then
    execute $sql$select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'integracao-monitor-lacos'$sql$;
  end if;
end
$desagendar$;
drop function if exists integracao_monitor_privado.verificar();
drop function if exists integracao_monitor_privado.sessoes_suspeitas(integer, integer);
drop function if exists integracao_monitor_privado.ler_contadores();
drop table if exists integracao_monitor_privado.alertas;
drop table if exists integracao_monitor_privado.amostras;
drop table if exists integracao_monitor_privado.configuracao;
drop schema if exists integracao_monitor_privado;
commit;

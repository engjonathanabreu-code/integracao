# Alarme de laço de repetição no banco — 25/11/2026

## O que detecta

Em 24–25/11/2026 três requisições ficaram cerca de 15 horas sendo repetidas pelo PostgREST
(SQLSTATE `40001`), a ~170 transações desfeitas por segundo, sem ninguém perceber. A causa foi
removida (`docs/conflitos-negocio-sem-retry-20261125.md`). Este alarme existe para o caso de algo
parecido reaparecer por outro caminho.

`supabase/migrations/20261125141221_monitor_lacos_repeticao.sql` cria o schema `integracao_monitor_privado` e agenda no pg_cron, a cada
2 minutos, o job `integracao-monitor-lacos`, que chama `integracao_monitor_privado.verificar()`.
A função:

1. grava uma amostra de `xact_rollback` e `xact_commit` do banco (`pg_stat_database`);
2. compara com a amostra de ~2 minutos antes e calcula as transações desfeitas por minuto;
3. considera a verificação "acima do limite" quando as desfeitas passam de **600 por minuto** e
   também superam as confirmadas no mesmo intervalo;
4. com **duas verificações seguidas** acima do limite, grava um alerta em
   `integracao_monitor_privado.alertas` e cria **uma** notificação para o setor `diretoria`
   ("Banco: possível laço de repetição"). O alerta guarda os números e as sessões suspeitas
   (conexões do papel `authenticator` abertas há mais de 10 minutos com transação iniciada há
   menos de 5 segundos): pid, início da conexão e os 120 primeiros caracteres do comando;
5. não repete o alerta por 60 minutos. Se o laço continuar, avisa de novo a cada hora.

O incidente real (~10.200 desfeitas por minuto) seria avisado em até ~4 minutos após o início.

## O que fazer ao receber a notificação

Acionar o suporte técnico imediatamente. O alarme **não age sozinho**: não encerra sessões nem
corrige nada. Para o suporte:

```sql
select instante, notificado, detalhes from integracao_monitor_privado.alertas order by instante desc limit 5;
select instante, xact_rollback, xact_commit, acima from integracao_monitor_privado.amostras order by instante desc limit 20;
```

As sessões listadas em `detalhes.sessoes_suspeitas` indicam qual função está sendo repetida. Encerrar
uma sessão é decisão humana, depois de conferir o comando; a causa (uma recusa de negócio saindo
com `40001`) precisa ser corrigida em seguida, ou o laço volta na próxima requisição igual.

## Limites e ajuste

Ficam em uma linha de `integracao_monitor_privado.configuracao`; ajustar é um `update`, sem
reescrever a função:

| Coluna | Padrão | Significado |
| --- | --- | --- |
| `ativo` | `true` | `false` faz a função sair sem gravar nada |
| `janela_minutos` | 2 | idade da amostra de comparação; manter igual ao intervalo do job |
| `limite_desfeitas_minuto` | 600 | desfeitas por minuto acima das quais a verificação conta |
| `silencio_minutos` | 60 | intervalo mínimo entre alertas |
| `sessao_antiga_minutos` | 10 | conexão considerada antiga |
| `transacao_recente_segundos` | 5 | transação considerada recém-iniciada |

Exemplo: `update integracao_monitor_privado.configuracao set limite_desfeitas_minuto = 1200;`

## Custo

A cada 2 minutos: uma leitura de uma linha de `pg_stat_database`, algumas consultas por índice nas
próprias tabelas, um `insert` e três `delete` de retenção. `pg_stat_activity` só é lido quando um
alerta é gravado (no máximo uma vez por hora). Retenção feita pela própria função: amostras por
7 dias (~5.000 linhas), alertas por 90 dias e execuções deste job em `cron.job_run_details` por
3 dias (~2.200 linhas).

## Limitações

- Não detecta laço lento, abaixo do limite, nem laço em que as desfeitas não superem as
  confirmadas (um sistema muito ocupado esconde um laço pequeno).
- Depende do pg_cron: se o job for removido, pausado ou o pg_cron parar, não há alarme, e nada
  avisa disso. Conferir com `select jobname, schedule, active from cron.job;`.
- Não age sozinho e só avisa dentro do sistema: se ninguém da diretoria abrir o Integração, o aviso
  espera.
- A notificação é assinada pelo Administrador ativo de menor `id`. Sem nenhum, ou se a gravação da
  notificação falhar, o alerta fica registrado com `notificado = false` e o motivo em `detalhes`.
- Depois de um reinício do banco os contadores zeram; a verificação seguinte não é avaliada.
- O começo do comando guardado no alerta vem de `pg_stat_activity`, que não traz os valores dos
  parâmetros; um comando com valores escritos no próprio texto teria esses valores gravados (até
  120 caracteres). As tabelas do monitor não são legíveis por `anon` nem `authenticated`.

## Por que `statement_timeout` não interrompe esse laço

O `statement_timeout` limita a duração de **um comando**. No laço, nenhum comando demora: a função
recusa em milissegundos, a transação é desfeita e o PostgREST abre outra transação e envia o
comando de novo. Cada tentativa é um comando novo, com o cronômetro zerado. O mesmo vale para
`idle_in_transaction_session_timeout` (a sessão nunca fica parada) e `transaction_timeout` (cada
transação dura milissegundos). O que se acumula é o número de tentativas, e é isso que este alarme
mede.

## Como desligar e reverter

- Pausar sem remover: `update integracao_monitor_privado.configuracao set ativo = false;`
- Parar o agendamento: `select cron.unschedule('integracao-monitor-lacos');`
- Remover tudo: `supabase/operacoes/monitor-lacos-repeticao-reversao.sql` (desagenda o job e remove
  funções, tabelas e schema; não apaga notificações já criadas).

A migration pode ser reaplicada: mantém amostras, alertas e limites ajustados e recria o job. Onde o
pg_cron não existe ela instala tudo e emite um aviso de que nada foi agendado.

## Validação executada

Sem acesso a produção. `tests/monitor-lacos-repeticao.test.js` roda a migration e a reversão em
PGlite com a tabela, as políticas e os gatilhos de `integracao_notificacoes` extraídos dos arquivos do
repositório. Os contadores são controlados substituindo, só no teste, a função interna
`ler_contadores()`; o pg_cron é imitado por um schema `cron` mínimo.

Não foi validado: pg_cron real (execução agendada, permissão para limpar `cron.job_run_details`),
`pg_stat_database` e `pg_stat_activity` reais sob carga, e a permissão do dono da função para ler o
texto das consultas do papel `authenticator`. Depois de aplicar em produção, conferir:

```sql
select jobname, schedule, active from cron.job where jobname = 'integracao-monitor-lacos';
select integracao_monitor_privado.verificar();
select integracao_monitor_privado.sessoes_suspeitas(0, 3600);
select status, return_message, end_time from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname = 'integracao-monitor-lacos' order by end_time desc limit 3;
```

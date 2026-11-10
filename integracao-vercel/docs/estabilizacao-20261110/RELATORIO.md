# Integração — diário, migração e recuperação seletiva

Atualização de 10/11/2026. A continuação foi autorizada pelo usuário, incluindo aplicação no Integração após os testes. Branch: `codex/estabilizacao-20261110`. Base de produção reconfirmada: `850530d8b40e1301492b85ad5fb998b53aa3b839`. Os achados e resultados da etapa anterior foram preservados em HISTORICO-PARCIAL.md.

## Entrega desta continuação

- Diário v2 integrado ao hook e habilitado por padrão; deltas por ação, dependências, transações IndexedDB, claims por conta, aviso entre abas e bloqueio seletivo.
- Migração idempotente com texto original/checksum, mesmo pedido para resultados desconhecidos e quarentena/exportação para originais inválidos. Cache antigo permanece intacto.
- Prévia e recuperação por item na interface, com escolhas revalidadas, substituição auditável e preservação do original. Confirmações com recibo não são reenviadas.
- Consulta de recibo somente leitura, conferindo identidade do payload e escopo RLS.
- Ferramenta de recuperação seletiva da outbox, com prova do provedor, CAS da prévia, auditoria e autorização histórica individual. Nenhum envio/backlog foi liberado.
- Service worker deixa de forçar ativação no meio de edições; reversão deve conservar o diário v2.

## Evidências executadas

| Verificação | Resultado |
|---|---|
| npm test durante integração | 1.130 passaram, 0 falharam |
| npm run build com testes de recuperação | 1.134 passaram, 0 falharam; Vite concluído |
| Núcleo IndexedDB em duas abas reais | 13 cenários passaram |
| Hook integrado em navegador | 10 cenários passaram |
| PostgreSQL 17.6 com duas conexões | 23 cenários passaram |
| Browsers de módulos da etapa anterior | ponto-offline, crm-leads e crm-modal passaram |

Os cenários integrados incluem migração, reload sem duplicação, nova edição, unidade recusada sem bloquear outra, escolha seletiva, duas abas, resposta perdida, releitura falha após recibo, edição durante envio e quota/retomada. Banco/testes usam dados fictícios e provedores simulados; não houve escrita em registros de usuários para testar.

Não há lint/typecheck configurados. Permanece o aviso preexistente de chunk grande. Os outros 48 browsers originais, aparelhos físicos e piloto em rascunhos reais de funcionários não foram executados. O total de testes não demonstra que todos os casos históricos de funcionários foram recuperados.

## Aplicação e preservação

Quatro migrations desta tarefa, individualmente revisadas: outbox desabilitada, aliases tipados, consulta de recibo e recuperação seletiva. Não executar db push de toda a pasta: a PR 97/migration interrompida permanecem fora do escopo. A RPC antiga é mantida; o patch de aliases verifica fingerprint antes de alterá-la. Nenhuma FK, RLS ou proteção CAS é removida.

Na fila do calendário foram observados 76 pendentes, sem envio registrado. Nenhum item foi autorizado para envio, apagado, reenviado ou marcado como enviado. O novo controle de envio permanece desabilitado e com corte NULL. A publicação do calendário não significa liberação dessa fila.

Rollback do banco por snapshot não é permitido. Migrations aditivas podem permanecer. Após uso do diário v2, o caminho seguro é correção compatível; a versão antiga não mostra suas pendências. O aplicativo mantém exportação e originais para recuperação. Interromper expansão em caso de mistura de contas, perda de intenção, duplicação de efeitos ou divergência de confirmação.

## Limites do pedido original mais amplo

Esta continuação fecha a integração do diário, a migração e as ferramentas de recuperação, mas não equivale a certificar toda a auditoria ampla: origem do volume de ponto, otimização de qualificações, revisão completa de todas as Edge Functions, todas as 26 telas e consistência por snapshot da RPC de resumo continuam com os limites registrados no histórico. O resumo rejeita páginas incompletas e classes HTTP incorretas, mas ainda não detecta substituições de mesma contagem entre páginas. Não foi feita rotação de credenciais embutidas em funções antigas.

A análise de segurança do Supabase também apontou avisos preexistentes em funções compartilhadas e configuração de Auth. Não foram alteradas permissões de ERP/Financeiro fora dos objetos desta entrega.

## Implantação

Registro do commit, migrations efetivamente aplicadas, deployment e verificação do asset serão acrescentados após a publicação autorizada. Preparação não é publicação; READY não comprova recuperação de cada navegador real.

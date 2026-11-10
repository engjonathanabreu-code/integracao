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
| npm run build final, incluindo vínculo canônico de meta | 1.136 passaram, 0 falharam; Vite concluído |
| Núcleo IndexedDB em duas abas reais | 13 cenários passaram |
| Hook integrado em navegador | 11 cenários passaram |
| Recuperação pelos botões em viewport 390 px | Passou, sem transbordamento horizontal |
| PostgreSQL 17.6 com duas conexões | 23 cenários passaram |
| Browsers de módulos da etapa anterior | ponto-offline, crm-leads e crm-modal passaram |

Os cenários integrados incluem migração, reload sem duplicação, nova edição, unidade recusada sem bloquear outra, escolha seletiva, duas abas, resposta perdida, releitura falha após recibo, edição durante envio e quota/retomada e criação de meta com erpId nulo. Banco/testes usam dados fictícios e provedores simulados; não houve escrita em registros de usuários para testar.

Não há lint/typecheck configurados. Permanece o aviso preexistente de chunk grande. Os outros 48 browsers originais, aparelhos físicos e piloto em rascunhos reais de funcionários não foram executados. O total de testes não demonstra que todos os casos históricos de funcionários foram recuperados.

## Aplicação e preservação

Quatro migrations desta tarefa, individualmente revisadas: outbox desabilitada, aliases tipados, consulta de recibo e recuperação seletiva. Não executar db push de toda a pasta: a PR 97/migration interrompida permanecem fora do escopo. A RPC antiga é mantida; o patch de aliases verifica fingerprint antes de alterá-la. Nenhuma FK, RLS ou proteção CAS é removida.

Na fila do calendário foram observados 76 pendentes, sem envio registrado. Nenhum item foi autorizado para envio, apagado, reenviado ou marcado como enviado. O novo controle de envio permanece desabilitado e com corte NULL. A publicação do calendário não significa liberação dessa fila.

Rollback do banco por snapshot não é permitido. Migrations aditivas podem permanecer. Após uso do diário v2, o caminho seguro é correção compatível; a versão antiga não mostra suas pendências. O aplicativo mantém exportação e originais para recuperação. Interromper expansão em caso de mistura de contas, perda de intenção, duplicação de efeitos ou divergência de confirmação.

## Limites do pedido original mais amplo

Esta continuação fecha a integração do diário, a migração e as ferramentas de recuperação, mas não equivale a certificar toda a auditoria ampla: origem do volume de ponto, otimização de qualificações, revisão completa de todas as Edge Functions, todas as 26 telas e consistência por snapshot da RPC de resumo continuam com os limites registrados no histórico. O resumo rejeita páginas incompletas e classes HTTP incorretas, mas ainda não detecta substituições de mesma contagem entre páginas. Não foi feita rotação de credenciais embutidas em funções antigas.

A análise de segurança do Supabase também apontou avisos preexistentes em funções compartilhadas e configuração de Auth. Não foram alteradas permissões de ERP/Financeiro fora dos objetos desta entrega.

## Implantação

As quatro migrations foram aplicadas individualmente no projeto ycdsyilyvaxslkwbkxyo e conferidas. Mapeamento local → registro remoto (o MCP atribui o instante da aplicação):

| Arquivo local | Versão remota |
|---|---|
| 20261110143311_calendario_outbox_duravel.sql | 20261110155130 |
| 20261110144604_aliases_tipados_gravacao.sql | 20261110155140 |
| 20261110152928_consulta_recibo_intencao_v2.sql | 20261110155148 |
| 20261110153758_recuperacao_seletiva_outbox.sql | 20261110155159 |

Readback confirmou envio desabilitado, corte NULL, zero itens da outbox, zero autorizações históricas e os mesmos 76 pendentes antigos. A função de recibo não permite anon; a recuperação privilegiada não permite authenticated; o alias tipado preserva descrição igual ao antigo ID. Nenhum registro operacional real foi alterado para testes.

`admin-create-usar` foi publicada na versão 2, ACTIVE, com código implantado conferido contra o patch. A autenticação continua no corpo da função; verify_jwt mantém a configuração anterior. Nenhum usuário foi criado para validar a função.

A primeira publicação (`dccd0d5`, deployment `dpl_5a2LeyCQE5HxC7rTxoe1YPN1GPUG`) chegou a READY. Um teste adicional mostrou que a confirmação de uma meta nova precisava aceitar o preenchimento canônico de erpId, inicialmente nulo no formulário. A meta já estava gravada e o recibo foi mantido; não houve reenvio. O ajuste valida que o vínculo recebido corresponde exatamente ao próprio ID, preservando diferenças em campos de negócio e identidades divergentes. Regressão Node e browser foram acrescentadas e passaram. Correção enviada em `6657846717ff793bbeaa18647336b1de5487f5a2`; a verificação final foi concluída conforme abaixo.

O endereço público respondeu 200, servindo o diário e a interface de recuperação; sw.js não contém chamada a skipWaiting. A atualização não comprova recuperação dos rascunhos de todos os funcionários: cada navegador importa os próprios dados ao abrir a nova versão.

Duas ações opcionais foram rejeitadas pela revisão automática: criar acesso temporário ao preview protegido e cancelar o primeiro deployment durante a investigação do teste extra. Nenhum link foi criado nem proteção desabilitada; o diagnóstico continuou isolado e a correção compatível foi publicada pelo fluxo autorizado. A verificação HTTP usa somente o alias público existente.

### Verificação final da produção

Deployment `dpl_6rLZXyhJqCVEwquJGC6961PFTavG`, commit `6657846717ff793bbeaa18647336b1de5487f5a2`, main, target production: READY, alias `https://integracao-beige.vercel.app`, sem erro de alias. Logs remotos confirmam build concluído e deployment completed.

Leitura pública após READY retornou HTTP 200 e asset `/assets/index-a_2cI6Bh.js`, SHA-256 `254f923bd92f44aff3d7c3bed82769f6991d0a9c968e66499c679546c026c298`. O arquivo contém o diário v2 e a interface de pendências; service worker sem ativação forçada. Nenhuma sessão real foi usada nessa verificação.

Commits desta continuação: `e19cdbd` (diário), `860ceef` (outbox seletiva), `dccd0d5` (evidências), `6657846` (confirmação canônica). Nenhuma PR foi aberta. Esta atualização final do relatório permanece na branch de trabalho, sem provocar uma nova publicação apenas documental.

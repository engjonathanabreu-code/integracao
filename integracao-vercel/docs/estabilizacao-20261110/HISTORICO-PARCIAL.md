# Estabilização do Integração — entrega parcial, sem prontidão para publicação

Data: 10/11/2026. Base: 850530d8b40e1301492b85ad5fb998b53aa3b839. Branch local: codex/estabilizacao-20261110. Produção reconfirmada no início: mesmo commit, deployment dpl_HDtjKsHZvFrEA3wnum55oZGzfQ5C READY, alias integracao-beige.vercel.app. Nenhum push, PR, deploy, migration remota, envio ou saneamento de registros reais foi executado. A autorização posterior para aplicar no Supabase foi registrada, mas os critérios técnicos da estabilização completa ainda não foram atendidos.

## Resultado concreto

- Refresh/REST: geração de sessão, cancelamento e captura de identidade impedem respostas antigas de substituir a sessão, inclusive A → logout → B. Leituras paginadas, tokens e retornos de arquivos também conferem a sessão.
- Hook compartilhado: abertura antiga não publica nem limpa os controles de uma abertura nova; finalizações antigas não liberam busy da sessão nova. Arquivos recebem barreiras de contexto próprias.
- Editor conciliado: escolhas explícitas são consideradas; a escolha é revalidada contra a versão remota mostrada. Um valor descartado pelo editor direto retorna conflito revisável em vez de sucesso sem gravação. A política histórica automática do hook principal NÃO foi integralmente reformulada.
- Igualdade: ordem de chaves de objetos deixa de gerar deltas; arrays continuam ordenados, dinheiro não é convertido pelo comparador e ausência não equivale a null. A nova comparação revelou uma escrita inútil de solicitacaoConclusao=null; a normalização passou a atuar somente quando há solicitação a limpar.
- Aliases: referências conhecidas são remapeadas; título/descrição/documentos não são substituídos por coincidirem com um ID. Migration separada corrige o mesmo defeito na RPC, protegida pelo fingerprint observado da função. Não foi aplicada remotamente.
- Resumo: páginas vazias/incompletas, identificadores repetidos, total inválido e mudança explícita de total são recusados. 401/403/409/422/429 mantêm classes úteis, detalhes upstream são sanitizados e há orçamento total. A RPC atual não fornece revisão/snapshot: consistência entre páginas com substituições de mesma contagem continua pendente.
- CRM: invalidação depende de conta e avisos do domínio clientes, com agrupamento de avisos e espera quando a aba está oculta. Atualização só de card não refaz a carteira completa. Dados de outra conta não entram na carteira e a última leitura válida é preservada quando uma atualização falha. Ainda há leitura integral em avisos de clientes; cache incremental por revisão está pendente.
- Edge administrativa: patch local elimina user_metadata.is_admin como autorização e exige perfil ativo com autoridade administrativa verificada. Fonte implantada v1 e testes negativos foram conferidos sem chamar a função real. Implantação e auditoria completa de elegibilidade administrativa continuam pendentes.
- Calendário: worker e rotas usam outbox com claim transacional, lease, corpo estável, chave de idempotência, recibo e estado incerto. O resumo diário deduplica e deixa de drenar convites. Migration aditiva nasce desabilitada, com corte NULL e sem copiar backlog. Ver OUTBOX.md para ativação/rollback e limitações.

- Diário v2: núcleo separado com transações IndexedDB, pedidos imutáveis, dependências, claim, recibo antes da releitura e preservação de originais. Passou em 13 cenários de duas abas reais, mas NÃO está integrado ao hook; não resolve ainda o requisito da aplicação. Ver FILA-V2.md.

## Evidência e testes

| Execução | Passaram | Falharam | Observação |
|---|---:|---:|---|
| Baseline npm test, antes dos patches | 1.063 | 0 | Não comprova ausência das lacunas |
| Nove regressões novas, antes dos patches | 0 | 9 | Sessão, comparação, escolhas e resumo |
| Mesmas regressões após correção | 9 | 0 | Fixtures e transporte fictício |
| Edge administrativa antes do patch | 1 | 2 | Metadado editável/inatividade reproduzidos |
| Edge administrativa após patch | 3 | 0 | SDK simulado; nenhuma conta criada |
| npm test após ampliação inicial | 1.120 | 0 | Inclui memoriais explicitamente |
| npm run build antes do diário v2 | 1.123 | 0 | Suite + Vite; três novos testes HTTP de outbox incluídos |
| npm run build final, com diário v2 | 1.126 | 0 | Inclui três testes adicionais; Vite 4,89 s |
| PostgreSQL 17.6 local | 13 cenários | 0 | Duas conexões reais; políticas/tabelas auxiliares sintéticas |
| Browser ponto-offline | 1 arquivo | 0 | Rede externa bloqueada |
| Browser crm-leads | 1 arquivo | 0 | Fixtures locais |
| Browser crm-modal | 1 arquivo | 0 | Desktop/mobile 1440/390 |
| Browser diário v2 (novo) | 13 cenários | 0 | Duas abas/IndexedDB reais; sem integração ao hook |

Os testes de memoriais também foram executados separadamente: 6/6. A suíte final já os inclui; não somar duas vezes. Além do novo browser do diário v2, há 48 dos 51 arquivos browser originais ainda NÃO EXECUTADOS nesta tarefa. Não houve teste físico de iPad/Windows nem piloto real. Não há scripts de lint/typecheck. A build mantém o aviso preexistente de chunk grande (~2,83 MB antes de gzip).

Os treze cenários PostgreSQL incluem campos independentes e mesmo campo concorrentes, replay de recibo, pedido com payload diferente, rollback por FK, RLS de registro invisível, alias tipado, outbox desabilitada, acesso autenticado negado, exclusão de backlog, incompatibilidade de payload, claim exclusivo/finalização e lease incerto. O teste cria e remove somente bancos integracao_test_* pelo socket local. Isso não comprova todas as policies de produção.

Na primeira suíte ampliada, duas falhas eram mensagens específicas da busca e uma era a nova escrita inútil de null. Foram corrigidas e os testes originais voltaram a passar; não foram relaxadas as verificações de quantidade de writes.

## Critérios ainda não atendidos

1. **Fila durável por intenção/unidade de negócio: não integrada à aplicação.** O núcleo experimental está separado e validado isoladamente; O lote legado continua atômico entre módulos e uma operação inválida ainda pode bloquear outra independente. O teste PostgreSQL confirma o rollback correto da RPC; isso não resolve a decomposição do lote.
2. **Duas abas: reprodução ainda falha o requisito.** tests/diagnostico-fila-estabilizacao.mjs reproduziu duas instâncias sobrescrevendo a mesma chave. Não houve prova de perda real em funcionário. A fila atual não foi substituída por uma solução incompleta de snapshots.
3. Migração idempotente/auditável da fila antiga, checksum/original, crash em cada etapa, quota/exportação segura e compatibilidade de cliente antigo/nova fila ainda precisam ser implementados e homologados.
4. A política automática central ainda pode descartar intenção em clocks herdados/empatados. O patch do editor direto não resolve todos os caminhos de mutate nem todas as mensagens de sucesso da aplicação.
5. Causas históricas dos conflitos de IDs em meta_historico, meta_comentarios e integracao_moradores, e da FK de responsáveis, não foram determinadas. Não houve substituição de autores/responsáveis nem recriação de IDs para contornar recusas.
6. Paginação consistente por revisão/cursor no servidor, invalidação incremental, todos os guardas de navegação e service worker antigo/nova fila ainda não foram homologados.
7. Origem do volume de ponto continua sem atribuição. Duas abas locais produziram uma leitura por aba no ensaio observado; não usar esse resultado como reprodução do excesso de produção.
8. Funções Edge sincronizar-processos-crm, sincronizar-meta-crm e salvar-observacao-processo têm caminhos privilegiados que exigem contrato de autorização por objeto/operação e testes negativos completos. Fontes implantadas foram lidas; nenhuma chamada de escrita foi feita. Há credenciais de integração embutidas em código existente; valores não são reproduzidos neste relatório e não houve rotação.
9. Outbox: falta ferramenta de reconciliação assistida com prova do provedor, envio histórico seletivo e teste de transição com consumidor antigo. Não habilitar antes disso. A idempotência do provedor expira em 24 horas; estado incerto não pode virar retry automático.
10. Qualificações por núcleo, planos de consulta equivalentes sob RLS, inventário completo de triggers/grants/policies, todos os contratos HTTP e consumidores externos ainda não foram concluídos. Testes de método/autenticação não equivalem a auditoria completa de objeto, schema, limite e prazo.

## Matriz de aceitação do pedido

| Caso | Cobertura nesta execução |
|---|---|
| 1 Campos diferentes | Editor/suite + duas conexões PostgreSQL |
| 2 Mesmo campo/escolha | Editor direto e SQL; central parcial |
| 3 Duas abas | Lacuna reproduzida; NÃO ATENDIDO |
| 4 Contas/sessão/arquivo | REST, refresh, hook e arquivos testados; demais telas parciais |
| 5 Resposta de write perdida | Harness existente e replay SQL |
| 6 Recibo com releitura falha | Harness existente passou |
| 7 Edição durante envio | Harness existente passou |
| 8 Estados de reserva | Patch cancelado preservado; conjunto completo pendente |
| 9 Unidade inválida independente | NÃO ATENDIDO no mecanismo legado |
| 10 IDs/igual/diferente/invisível | SQL e suites existentes; origens históricas pendentes |
| 11 Responsável inválido/legado | Sem saneamento; solução completa pendente |
| 12 Migração fila antiga | NÃO IMPLEMENTADA |
| 13 Quota/crash/durabilidade | Matriz completa pendente |
| 14 Oscilação/backoff/cancelamento | Parcial; fila nova pendente |
| 15 Classes HTTP | Resumo e testes existentes; cobertura global parcial |
| 16 Paginação | Validação estrutural corrigida; snapshot consistente pendente |
| 17 Navegação rápida | Três browsers selecionados; cobertura completa pendente |
| 18 Realtime/cache | Carteira corrigida parcialmente; revisão perdida pendente |
| 19 Efeito externo concorrente | Worker, HTTP simulado e SQL real; recuperação/rollout pendentes |
| 20 PWA/rollback fila nova | NÃO EXECUTADO |
| 21 Regressão de módulos | Suite completa passou; navegadores e pilotos parciais |

## Preservação e próximos passos

O patch de reserva cancelada de 850530d permanece. Não houve alteração de dados, valores financeiros, autores, responsáveis, anexos, auditorias, permissões existentes ou contratos ERP/Financeiro em produção. Nenhum cache/IndexedDB foi limpo. PR 97 e migration interrompida não foram retomadas.

A próxima etapa necessária é implementar/testar a fila durável por unidade e sua migração entre abas, mantendo recebimentos desconhecidos no mesmo pedido. A classificação deve partir de base original + intenção + remoto; snapshots parciais não autorizam recriação. Um particionamento por tabela seria inseguro para pai/filhos/auditoria/anexos e não foi apresentado como solução.

Recuperação real continua separada: inventário privado → recibo/identidade → diff por campo → classificação → autorização seletiva → CAS/deltas → releitura. Não há ferramenta final de recuperação pronta nesta entrega. Nunca drenar ou importar todo snapshot.

Rollout ainda não autorizado tecnicamente: primeiro concluir os critérios acima; depois piloto sintético, revisão das migrations e consumidores, plano de rollback, versão/asset/browser verificados e janela de métricas. Não publicar com base somente no total de testes. Para os patches sem novo protocolo, rollback de aplicação é possível; para outbox, manter consumidor v2 desabilitado ou forward fix. Não recolocar sender antigo sobre estados incertos nem restaurar snapshot de banco.

Metas propostas, ainda sem série pós-publicação: zero cruzamento de conta, zero intenção perdida, zero envio duplicado, zero retry automático de recusa determinística inalterada; registrar idade/estado da fila, latência, tentativas, recibos, leituras por aba e resultados incertos sem payloads. Interromper expansão diante de violação desses invariantes.

## Arquivos de apoio

- PLANO.md: baseline, contratos centrais e sequência incremental.
- inventario.json: árvore original e referências estáticas de RPC.
- contratos-estaticos.json: telas/handlers/chamadores e referências de testes; não é cobertura dinâmica completa.
- funcoes-observadas.sql: definições consultadas de integracao_gravar e integracao_moradores_carga.
- OUTBOX.md: protocolo preparado, limitações e transição necessária.
- FILA-V2.md: núcleo de diário preparado e limites de integração.

## Commits locais revisáveis

- 20bc545 — baseline e reproduções.
- c08773c — geração de sessão e escolhas de conflito.
- 3a2f990 — completude do resumo e classes HTTP.
- 3ca528a — invalidação da carteira CRM.
- abd14c2 — aliases tipados no cliente e contexto de arquivos.
- 551ec1b — patch de autorização administrativa.
- 6877126 — outbox transacional desabilitada.
- 8e542d1 — migration de aliases na RPC e concorrência PostgreSQL.
- 736690a — núcleo isolado do diário v2, ainda sem ativação.

Não há PR desta branch. O diretório node_modules é somente um link local de ferramentas, não versionado. O PostgreSQL foi compilado e executado localmente em socket privado; os bancos temporários de teste foram removidos pelo próprio teste, sem usar cópia de produção.

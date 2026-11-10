# Estabilização — baseline e plano incremental

Base confirmada em 10/11/2026: main 850530d8b40e1301492b85ad5fb998b53aa3b839, produção dpl_HDtjKsHZvFrEA3wnum55oZGzfQ5C READY e alias integracao-beige.vercel.app. Branch codex/estabilizacao-20261110, worktree isolada, inicialmente limpa. Node 22.16.0; dependências locais existentes utilizadas sem copiar envs. README histórico não representa a persistência atual.

Inventário estático reproduzido: 226 arquivos src, 19 handlers + 2 helpers, 101 SQLs, 168 .test.js e 51 .browser.cjs. Ver inventario.json; referências dinâmicas e consumidores externos requerem revisão complementar. Não há workflows GitHub rastreados. Vercel publica main por integração Git; nenhum push autorizado nesta etapa. Crons com efeito externo: financeiro-lembretes e calendario-resumo. Não chamar em produção.

## Contratos confirmados

- Edição compartilhada: UI → mutate/mutateConfirmed → snapshot em memória → filaRascunho/storage → prepararEdicao + arquivos → integracao_gravar → transação atômica com RLS/CAS → integracao_pedidos → aliases → releitura → projeção/rebase → confirmação dos campos. O lote mistura domínios; não existe ainda recibo por intenção independente.
- Editor direto: editarConciliado → ler → conciliarMaisRecentes → delta → RPC com CAS. Escolhas eram ignoradas; ausência de delta podia representar perda da intenção, sem erro.
- Sessão: definirSessao → requisicao → refresh → REST. Refresh em voo não captura geração/identidade. Uploads e hook também precisam de barreiras próprias.
- Resumo: POST autenticado → RPC sob token do solicitante → primeira página com todos os clientes e total de COMPLEMENTOS → páginas de 500 complementos (total null nas seguintes) → resumo. A RPC implantada não expõe revisão/snapshot; contagem sozinha não prova consistência entre páginas.
- Calendário: trigger → fila → GET/POST de drain → provedor → PATCH. Sem claim, dois consumidores podem enviar o mesmo item. Resumo diário também drena backlog. Requer protocolo aditivo, recibo externo e estado incerto; chave do provedor isolada não basta.
- Ponto: hook → Web Locks por conta → fila offline → recibo → releitura estado → eventos locais/globais. É necessário reproduzir o agendamento para atribuir excesso; números de logs não provam causalidade com gravações.

## Ordem de implementação e riscos

1. Testes sintéticos de regressão antes dos patches; suite baseline separada de novos testes.
2. Barreiras de sessão e arquivos, escolhas do editor e comparação semântica estrita (arrays ordenados, null distinto de ausente). Risco: políticas antigas/testes codificam descarte silencioso; preservar merge compatível e informar intenções descartadas.
3. Contrato de paginação e classes HTTP; invalidação CRM por escopo e revisão sem ler milhares de itens a cada card. Snapshot consistente exige evolução compatível da RPC.
4. Fila de intenções versionada: unidade pai/filhos/auditoria/anexos, recibo estável, recuperação de resultado desconhecido, IndexedDB transacional entre abas, preservação de original/checksum e aliases tipados. NÃO ativar um particionador genérico por tabela: quebraria atomicidade.
5. Outbox com lease/claim e reconciliação; resumo diário com deduplicação. Não habilitar envs/envio nem drenar backlog de teste.
6. Revisão de APIs, Edge, RLS, qualificação e telas; testes reais PostgreSQL com duas conexões, browser isolado, npm test, memoriais .mjs e npm run build.
7. Recuperação seletiva e rollout somente depois dos critérios; PR 97 e migration interrompida excluídas. Não apagar filas, retirar CAS/FK/RLS ou alterar registros reais para passar testes.

Rollback de patches de aplicação sem novo protocolo: revert dos commits isolados. Fila nova exige leitor compatível nas duas versões; sem comprovação, bloqueio de rollout e forward fix. Não restaurar banco antigo sobre novos writes. Parar expansão diante de perda de intenção, cruzamento de conta, efeito externo duplicado ou regressão material.

## Limites

Este inventário inicial não é auditoria completa nem aprovação para publicação. Dados de produção consultados apenas por metadados/definições. Migrations aplicadas consultadas via conector; nenhuma aplicada pela tarefa. Causas de conflitos históricos de IDs e FK não podem ser inferidas apenas dos logs fornecidos. Ainda não há ambiente PostgreSQL validado nesta execução.

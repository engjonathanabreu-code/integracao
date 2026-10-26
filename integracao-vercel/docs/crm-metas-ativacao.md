# Ativação do CRM e metas de vendas

## Diagnóstico confirmado em 26/10/2026

Base: `106edfec541929d2caee8d0b33d79cc39462ac51` (PR 100). A produção Vercel consultada também estava nesse commit. Não há workflows GitHub versionados neste checkout; o deploy de produção consultado veio de `main`.

O fluxo atual é: `NegociacaoCRM` / movimentação do funil → `salvarNegociacaoCRM` (PATCH conciliado) ou `integracao_crm_converter_lead` → `integracao_crm_cards.status` → gatilhos `registrar_ativacao` e `z_meta_venda_origem` → `integracao_crm_ativacoes` → RPC `integracao_crm_metas_painel` → `MetasVendas`.

A sincronização com `integracao_moradores.dados.requerente.statusCRM` também passa pelos mesmos gatilhos. A ativação guarda o responsável principal do evento, os comerciais adicionais, valor, autor e horário do servidor. A chave primária por cartão e a condição de mudança de status impedem duplicação por repetição; desfazer a ativação remove sua contribuição. Transferir um cartão ativo não transfere retroativamente a venda.

Consultas somente leitura no projeto ERP (`ycdsyilyvaxslkwbkxyo`) confirmaram as definições e os gatilhos instalados. No caso informado, 24 ativações vigentes em Penha durante outubro já estavam persistidas, com responsável: 20 vieram de Cliente novo e 4 de Negociação. A meta individual consultada (01/09 a 30/11) tinha 26 ativações com transição comprovada no período, mas nenhuma vinda de Contrato. O filtro `a.etapa_anterior='Contrato'` da função de leitura excluía esses eventos. Nenhum nome de cliente, documento ou telefone foi necessário para a apuração.

## Correção e efeitos

A migration `20261026180103_crm_metas_ativacoes_comprovadas.sql` substitui somente o corpo de `erp_collab_private.metas_vendas_painel()`. O filtro aceita Cliente novo, Negociação, Contrato e Perdido como etapas anteriores de uma ativação comprovada. Mantém a autenticação, visibilidade das metas, responsável registrado, reversões, unidade (quantidade/valor) e limites inclusivos em America/Sao_Paulo. `CREATE OR REPLACE` preserva as permissões da função existente. Não há mudanças de tabelas, políticas, credenciais ou valores persistidos.

A leitura corrigida passa a incluir também eventos anteriores que já têm evidência suficiente. Isso pode elevar os medidores ao publicar a migration, sem recompor dados ou atribuições. Registros sem etapa anterior comprovada, inclusive cadastros inseridos diretamente como ativos sem uma transição, continuam excluídos. Qualquer recomposição desses casos exige investigação e autorização separadas; não está nesta correção.

O componente já consulta o RPC ao montar/reabrir, ao receber revisão de CRM/usuários, ao usar Atualizar medidores e a cada 60 segundos enquanto montado. Não armazena um total manual. A revisão de CRM existente é emitida pelo gatilho `integracao_revisao`; não foi necessário criar sincronização adicional.

## Verificação

- Teste de regressão reproduz zero antes da migration e um depois, preservando todos os eventos; reaplicar a migration mantém o resultado.
- PostgreSQL isolado (PGlite): quatro etapas de origem, conversão direta de lead, repetição do RPC e do PATCH, comerciais compartilhados, autor diferente do responsável, transferência, reversão/reativação, sincronização com Clientes, quantidade/valor, outro vendedor e outro período, limites de São Paulo, falta de valor/evidência e bloqueios de acesso.
- Suíte completa: 914 testes aprovados. Build Vite aprovado, com aviso de bundle acima de 2000 kB. Não há scripts de lint/typecheck no package.json.
- Chrome local: componentes reais `NegociacaoCRM` e `MetasVendas` usando o transporte da aplicação, com respostas de um PostgreSQL em memória. Ativação atualizou o medidor de 0 para 1 automaticamente; repetição e reload mantiveram 1. Layout do componente conferido em 390 px. O adaptador do teste bloqueia rede externa; permissões são verificadas separadamente nos testes SQL.
- Nenhuma escrita ou migration foi executada no banco real. QA autenticado com uma venda real fica para a publicação autorizada.

Reproduzir: em `integracao-vercel/`, `npm test` e `npm run build`. Para navegador, iniciar `npm run dev -- --host 127.0.0.1 --port 5189 --strictPort` e executar `node tests/crm-metas-ativacao.browser.mjs` com Playwright disponível (ou informar seu módulo em `PLAYWRIGHT_MODULE`). O teste usa Chrome instalado e dados fictícios.

## Publicação — depende de autorização específica

1. Após revisão e autorização, mesclar esta PR na `main` e acompanhar o deploy Vercel do Integração. As duas mudanças React ajustam apenas a explicação da regra; a mudança de contagem está na migration.
2. Aplicar **somente** `supabase/migrations/20261026180103_crm_metas_ativacoes_comprovadas.sql` no projeto `ycdsyilyvaxslkwbkxyo`, como migration de nome `crm_metas_ativacoes_comprovadas`, usando o conteúdo integral deste arquivo. Confirmar antes que a definição atual ainda corresponde à inspecionada; se houver mudança concorrente, reconciliar antes de aplicar. Não executar `supabase db push`, não aplicar migrations pendentes em lote e não retomar a PR 97.
3. Reabrir CRM → Metas com uma sessão autorizada; conferir os agregados por responsável/período e, numa ativação autorizada subsequente, confirmar uma única contribuição após recarregar. Sem mudança de status artificial ou ajustes manuais para recompor vendas antigas.

Rollback: restaurar somente a definição anterior de `erp_collab_private.metas_vendas_painel()` (trecho dessa função em `20260926201425_crm_metas_estrategias.sql`, usando `CREATE OR REPLACE`, sem executar o restante da migration antiga). Se necessário, reverter também os dois textos React. O rollback volta à regra restritiva anterior, preservando todos os eventos.

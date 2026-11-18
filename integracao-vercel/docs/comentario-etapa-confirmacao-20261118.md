# Confirmação de comentário de etapa

## Causa reproduzida

O formulário de etapa do Plano cria comentário com `data` do navegador. `prepararEdicao` insere `comentarios_plano` sem `created_at`, e a projeção usa o timestamp gerado pelo banco. A comparação exata dos dois relógios rejeitava a leitura correta como divergente. O recibo permanecia preservado e operações dependentes podiam aguardar a confirmação.

Correção restrita à inclusão de comentário em etapa existente: aceita o timestamp válido do servidor somente com operação de insert da mesma tabela, plano, etapa, identidade e texto, sem timestamp explícito. Autor, conteúdo, identidade e demais campos continuam sendo verificados. Edições de comentário existente não recebem essa normalização.

## Limites

O defeito foi reproduzido com preparação e projeção reais em dados sintéticos. Isso não identifica a causa das duas pendências LEITURA_DIVERGENTE da Francine ou do P0001 da Lorena sem diagnóstico específico da instalação. Não apagar filas, repetir gravações já recebidas nem reconhecer valores concorrentes automaticamente.

## Risco e reversão

Não há migration, mudança de permissões ou gravação de dados nesta alteração. O risco é confirmar incorretamente um comentário; testes negativos mantêm a exigência de conteúdo, vínculo e operação corretos. Reverter o commit/PR restaura a validação anterior, sem intervenção no banco. Pendências já confirmadas não são reabertas pelo rollback.

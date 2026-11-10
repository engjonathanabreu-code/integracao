# Continuação da auditoria — 10/11/2026

Escopo autorizado: corrigir pendências da auditoria, testar em ambiente isolado e aplicar no Integração. Produção inicial desta rodada: `6657846`; branch `codex/estabilizacao-20261110`. A PR 97 e a migration interrompida continuam excluídas.

## Diagnóstico e correções

- **Ponto:** cada aba consultava estado em seus próprios eventos/intervalos; a consulta bem-sucedida também emitia aviso genérico de ponto. Isso é uma fonte comprovada de leituras redundantes, não atribuição de todo o volume histórico. Agora há claim não enfileirado entre abas, prazo de leitura compartilhado, pausa da leitura sem fila em aba oculta, backoff/jitter, Retry-After, bloqueio de recusa determinística e conferência da sessão antes/depois de cada etapa. Batidas duráveis continuam enviando em aba oculta. Avisos da própria sincronização não a disparam novamente.
- **Resumo:** RPC v2 aditiva STABLE/SECURITY INVOKER consulta versão e página no mesmo snapshot SQL. Todas as páginas precisam da versão inicial. Substituição de registros sem mudar contagem é recusada. RPC antiga permanece intacta. Uma alteração em outro domínio também pode invalidar conservadoramente a leitura, pois a versão inclui todos os marcadores visíveis.
- **Carteira CRM:** manifesto por identidade e hash de conteúdo visível; resposta contém só registros alterados e manifesto atual para detectar exclusões. Cache em memória por conta; respostas incompletas falham sem apagar o último estado validado. Não é changefeed no banco: o servidor ainda apura a projeção autorizada, mas evita retransmitir milhares de cadastros completos a cada aviso. Sem service role, novas tabelas ou ampliação de RLS.
- **Qualificações:** materialização do cadastro canônico evita avaliações repetidas do mesmo helper; fingerprint protege contra sobrescrever função mais nova. Preserva filtros, ordenação, aliases, erros e permissões. Ainda reconstrói uma vez cada candidato antes de paginar; não equivale a resolver qualquer núcleo de volume ilimitado.
- **Navegação:** sucesso, erro e finally de mutação antiga não invocam callbacks nem limpam ocupado/revisão de uma tela/conta nova.
- **Identidades:** novas atribuições só aceitam perfil canônico ativo; vínculos históricos não são apagados. Histórico/comentário/checklist existente de outra meta não pode ser reutilizado. Isso bloqueia causas reproduzíveis; não atribui retrospectivamente todos os conflitos registrados em produção.
- **Edge:** sincronização geral exige autenticação e perfil ativo de Administrador, Diretor ou Comercial (decisão explícita do usuário). Meta e observação consultam também o contrato canônico de exportação/edição e usam cliente com JWT do solicitante e RLS, negam alvo ausente/invisível e não enviam ao CRM se a atualização não retornar linha. Método, corpo, timeout, redirecionamento e mensagens de erro foram delimitados. Não houve chamada real com efeitos para testar.

## Validação

- Build da primeira publicação: 1.159 testes passaram, 0 falharam; Vite concluído. Sem lint/typecheck configurados; aviso de chunk grande preexistente permanece.
- 14 testes focados iniciais de Edge/resumo; 11 negativos de Edge após leitura limitada do corpo; todos passaram. Provedores simulados, sem mensagens reais.
- PostgreSQL 17.6 real, socket isolado: duas conexões comprovaram snapshot antigo consistente e recusa de revisão obsoleta após alteração concorrente com mesma contagem; delta vazio, exclusão, negação por papel e equivalência de qualificações passaram.
- Qualificações, 301 moradores fictícios sob mesmo papel/RLS: 603 → 301 chamadas ao helper; ensaio observado 17,82 → 13,91 ms. É medição local instrumentada, não previsão de latência de produção. Resultado completo idêntico.
- Navegador: teste novo de contexto tardio passou para sucesso e falha; carteira incremental real passou com só um registro alterado e sem recarga por evento de card; diário integrado, ponto offline e ponto sem sessão de rede passaram; demais resultados estão no inventário de browsers anexo.

A primeira varredura executou os 53 entrypoints disponíveis então: 30 passaram e 23 falharam. A comparação executou os mesmos 23 testes na base 6657846: 22 já falhavam nela; somente folha-ponto passou na base. Essa regressão foi corrigida revalidando o vínculo na abertura da sessão, e o teste completo passou novamente. Algumas falhas se devem a seletores/contratos antigos (rótulo de busca, texto de sincronização ocultado, cards da visualização antiga, confirmação antes do download). A varredura também contém falhas que NÃO foram diagnosticadas integralmente; elas não contam como aprovação. Rodadas durante desenvolvimento foram exploratórias, sem alegação de certificação das 26 telas. Os scripts originais e logs foram conservados. iPad/Windows físicos e rascunhos reais de funcionários não foram testados.

## Banco e limites de segurança

Inventário agregado anterior: 144 tabelas públicas, 329 policies, 186 triggers, 130 funções públicas, 1.804 grants de tabela para os três papéis API. Foram inspecionadas definições e permissões dos objetos afetados, não auditados individualmente todos os 1.804 grants.

Consulta agregada encontrou zero perfis sem auth.users e zero responsáveis atuais sem perfil ativo. Nenhum vínculo foi saneado automaticamente. Causas históricas ainda dependem dos pedidos/rascunhos originais.

Advisors anteriores registram grupos preexistentes: RLS sem policy, funções SECURITY DEFINER executáveis por anon/authenticated e proteção de senha vazada desabilitada. Não foram alteradas indiscriminadamente as permissões compartilhadas do ERP/Financeiro.

Os arquivos versionados de Edge usam nomes de variáveis para credenciais, sem valores literais. O pacote implantável preserva a configuração de integração já existente, capturada em memória e validada contra a versão anterior. A remoção/rotação coordenada das credenciais antigas permanece uma ação separada; não é alegada como concluída.

## Aplicação e reversão

Migrations: `20261110162126_leitura_consistente_resumo`, `20261110162130_qualificacoes_consulta_materializada`, `20261110162539_carteira_crm_delta`. Aplicar individualmente, nunca db push indiscriminado. Não há backfill, exclusão, alteração de registros de negócio nem liberação de envios.

Rollback de aplicação para `6657846` conserva diário v2 e originais. Migrations de leitura aditivas podem permanecer; a otimização mantém assinatura/resultado. Para Edge, preferir correção compatível e manter a autorização ativa; não retornar ao acesso privilegiado sem validação. Nenhum snapshot do banco será restaurado.

## Pendências que não podem ser declaradas resolvidas por estes testes

- Piloto em aparelhos e rascunhos reais, e atribuição das recusas históricas por pedido.
- Classificação/revisão completa das falhas antigas de navegador e de todos os contratos HTTP além dos cenários existentes.
- Revisão de permissões compartilhadas e rotação coordenada de segredos de integrações externas.
- Medição de qualificações em grandes núcleos reais sob papéis equivalentes e janela de métricas após uso real.

## Registro de aplicação

Supabase aplicado e conferido:
- leitura_consistente_resumo: versão remota 20261110164124.
- qualificacoes_consulta_materializada: versão remota 20261110164127.
- carteira_crm_delta: versão remota 20261110164129.

As três funções de leitura são SECURITY INVOKER, sem EXECUTE para anon e com EXECUTE para authenticated. Materialização conferida na definição remota.

Edge: sincronizar-processos-crm v5, sincronizar-meta-crm v2 e salvar-observacao-processo v2, ACTIVE, verify_jwt=true. Readback byte a byte corresponde ao pacote preparado. Nenhuma chamada de sincronização foi disparada.

Advisors posteriores mantêm os quatro grupos anteriores; referências: [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [definer anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [definer authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Primeira publicação desta rodada: commit `e21d1b294dac46392f363d99235eab946a01bdab`, deployment `dpl_9tMhNCJM7g6Q2g26LBgdDBiveBbP`, READY, alias de produção confirmado. Complemento de confirmação descrito abaixo aguarda sua própria publicação.

## Reproduzir a validação isolada

Na pasta integracao-vercel, `npm run build` executa a suíte Node e a compilação. Para preparar a fixture SQL sintética: `INTEGRACAO_EXPORT_SQL=/tmp/integracao-leituras-fixture.sql node --test tests/auditoria-leituras-banco.test.js`. Com o PostgreSQL temporário em /tmp/integracao-pg-socket:55439, executar `python3 tests/auditoria-leituras-postgres.py`. O script aceita somente o socket e cria/remove bancos integracao_test_*; não consulta produção. Os browsers exigem o servidor de fixtures e PLAYWRIGHT_MODULE com rede externa bloqueada.

Commits de implementação: `3c96920` (ponto/contexto/identidade), `a3c1f24` (leituras), `5627d30` (Edge). Nenhuma PR foi aberta.

## Compatibilidade e observação após publicação

A abertura inicial revalida o vínculo de ponto, inclusive CLT → Contrato; consultas periódicas seguintes compartilham prazo entre abas. Sem sessão de rede, uma marcação offline pode ser persistida no escopo local; o envio continua exigindo sessão válida. Nenhuma fila é limpa na troca de conta.

O deploy não recarrega abas em edição. Usuários com a versão anterior aberta podem permanecer nela até a atualização normal; isso limita qualquer conclusão imediata sobre o uso real. A leitura por versão pode retornar conflito se o conjunto mudar durante a paginação; isso é intencional, e não uma coleção vazia.

A implantação não fornece, sozinha, uma série de tráfego posterior suficiente para demonstrar redução de chamadas ou recuperação de todos os usuários. Não foi executado piloto em contas reais.

## Complemento: confirmação de históricos e andamento

A comparação com a versão anterior não torna uma falha aceitável: a versão anterior já continha o diário. A investigação adicional reproduziu um defeito de confirmação no código: históricos de metas/processos usam `created_at` do servidor, enquanto a intenção contém a hora do aparelho. O recibo permanecia aguardando leitura e bloqueava edições dependentes. No simulador também faltava o default `created_at`; a hipótese inicial de aliases não se confirmou para esses registros, cujos IDs já eram UUIDs.

A correção compara todos os campos de negócio e exige data válida do servidor para novos históricos de processo e históricos/comentários de meta, sem exigir igualdade entre os relógios. Datas de início de etapa aceitam representações equivalentes do mesmo instante. O andamento respeita a coluna SQL de data civil; autoria continua conferida pelo complemento persistido. Observações preservam a comparação exata da data do complemento. Presença local de usuário (online/ultimaAtividade), que não gera gravação, não mantém recibo pendente; tipo/permissões continuam exatos. Não houve alteração de schema ou dados de usuários.

Testes focados: 16 passaram, incluindo projeção real de prepararEdicao/projetar, recusa de texto alterado, perda de complemento de autoria, registro ausente e instante diferente. Processos passaram em Administrador, Diretor de Projetos, Pós-protocolo, Comercial e Consulta, com verificação de encerramento da pendência nos papéis que editam. Planejamento passou em 1366, 1440, 1920, 3440 e 390 pixels com verificação de fila encerrada; diário integrado passou nos 11 cenários. Esses resultados substituem a classificação inicial de processos-protocolados e planejamento-densidade como falhas ainda sem diagnóstico.

Rollback deste complemento: reverter somente seu commit de aplicativo para `e21d1b2`, mantendo as três migrations aditivas e as funções Edge já verificadas. O retorno reintroduziria a confirmação pendente; nenhum procedimento apaga filas ou rascunhos.

Planejamento-notificacoes também passou após o complemento. A verificação pública da primeira publicação retornou HTTP 200 para página e bundle, com marcadores do diário e carteira incremental; service worker não força recarga.

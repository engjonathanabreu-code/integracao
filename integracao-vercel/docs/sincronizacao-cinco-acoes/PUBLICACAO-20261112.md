# Integração das cinco melhorias — 12/11/2026

A autorização posterior permite integrar e publicar o PR 110, incluindo sua migração de recibos. A base atual é 346d500, com as correções de recuperação já publicadas. O merge local preservou essa correção sem conflitos. O PR 97 não faz parte deste trabalho.

## Comportamentos

1. Jornadas com diário e cliente legado, recibos antigos/novos, resposta perdida, reload, desktop e mobile usam dados fictícios e rede externa bloqueada. Não comprovam recuperação dos aparelhos reais.
2. Recibos passam a guardar o resultado canônico de cada operação na mesma transação. A RPC mantém assinatura, aliases, locks, idempotência, permissões e leitura de confirmação. O fingerprint não é versão monotônica nem autorização para sobrescrita.
3. O diagnóstico de cada operação é local e limita identificadores, estados, fase, tempos, tentativas e dependências. A telemetria remota continua exclusivamente com contagens.
4. A comparação de horários aceita somente instantes equivalentes nas operações de calendário que efetivamente enviaram esses instantes. A correção de evento único e exportação permanece presente.
5. Falha na leitura de uma ficha preserva seu cache autorizado e permite atualizar fichas independentes. Preparação e confirmação permanecem estritas; ausência autorizada não é tratada como erro.

## Ajuste adicional de diagnóstico

A investigação de um erro 23514 constatou que o diário não preservava o nome da restrição. O ajuste adicional retém somente nomes de CHECK previamente conferidos no schema, sem mensagem, detalhes da linha ou valores do cadastro. Acrescenta orientação local por restrição e informa se o pedido aguarda revisão, intervalo, reserva, predecessor ou dependência. Não altera seleção, ordenação, envio ou resolução das intenções. Os testes cobrem dados privados, nomes desconhecidos, dependências ausentes/substituídas e ausência de mutação da fila. Não se afirma que a restrição ou dependência específica do caso real foi identificada: isso depende da exportação atual ou sessão autorizada. Não houve restauração de cópias antigas.

## Migração e reversão

A migração 20261112173052_recibos_canonicos_operacoes altera apenas o código de public.integracao_gravar(jsonb,uuid). A definição real prévia corresponde a 9afac4a610b268dec4ea50297b0b2fa3; a função é SECURITY INVOKER, search_path vazio, sem EXECUTE para PUBLIC/anon. A tabela de recibos tem RLS e políticas por auth.uid().

A cópia exata da função de produção foi preservada fora do repositório e restaurada em PostgreSQL descartável. Aplicar a migração produziu c919c662906a494e6e6caf87311e1bfc; a reversão voltou a 9afac4a610b268dec4ea50297b0b2fa3. Esse backup cobre o objeto alterado; não representa backup integral do banco. Não há atualização de cadastros, arquivos ou recibos existentes na migração.

O rollback do cliente usa a versão previamente publicada 346d500. O rollback da RPC usa supabase/operacoes/recibos-canonicos-reversao.sql, que verifica o checksum e mantém os recibos novos. Nunca limpar IndexedDB/localStorage ou apagar recibos. Recibos maiores aumentam armazenamento e resposta; acompanhar tamanho e falhas sem descartar histórico.

Advisors anteriores: 36 informações de RLS sem políticas, oito alertas de funções SECURITY DEFINER executáveis por anon, 36 por authenticated e um alerta de proteção de senhas; nenhum aponta para esta RPC/tabela. Esses achados preexistentes fora do escopo não foram alterados.

## Limites

Não existe mecanismo remoto de comandos nesta entrega. Não há sessão dos aparelhos afetados disponível para controle de tela. Os aparelhos de funcionários não foram acessados; telemetria antiga ou fila vazia de outra instalação não comprova resolução. Pendências de validação ou perfil não são descartadas nem normalizadas automaticamente. O desenho de suporte remoto contínuo permanece proposta separada, sem implementação.

A aplicação autorizada foi concluída no banco e o nome versionado foi alinhado ao histórico retornado pelo servidor. O checksum posterior corresponde ao ensaiado na cópia descartável; os 4.479 recibos anteriores mantiveram a mesma contagem e checksum, com RLS, políticas e grants preservados. Build local: 1.278 testes aprovados; navegador local estabilizado: 69/69 jornadas aprovadas. A validação remota final do cliente continua necessária antes do merge/publicação.

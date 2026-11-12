# Evolução da sincronização — trabalho remoto de 11/11/2026

Base: `c5a52bf2097a74bdd2bb8b9e1631250b11290916` (PR 109). Branch isolada: `feat/sincronizacao-cinco-acoes-20261111`. Não é uma publicação nem autorização para produção. Não retoma a PR 97.

## As cinco ações

1. **Duas contas/dispositivos:** não há duas sessões reais autorizadas disponíveis no navegador remoto. Nenhuma sessão interrompida foi retomada. Os testes usam duas contas fictícias em PostgreSQL descartável e as jornadas existentes de reload, duas abas, anexos, resposta perdida, permissões e reconexão; isso não comprova resolução das filas reais. O teste novo desktop/mobile usa o hook e IndexedDB reais com servidor fictício e rede externa bloqueada.
2. **Recibo transacional:** migration gerada pela CLI oficial, ainda não aplicada. Acrescenta `protocoloRecibo: 1`, pedido, horário do servidor e resultados por índice de operação ao mesmo recibo de `integracao_gravar`. Mantém a assinatura da RPC, aliases, idempotência por conta/pedido/payload, locks, rebase, RLS, grants e recibos anteriores. Cada resultado de registro guarda chave, campos canônicos enviados (e timestamps disponíveis), exclusão confirmada e fingerprint do snapshot da linha. Ações guardam o retorno JSON original sem impor formato. Uma linha não visível após a escrita é marcada indisponível, nunca excluída. O fingerprint não é contador monotônico nem uma condição de CAS: autorizar uma escrita continua exigindo o contrato de concorrência existente.
3. **Diagnóstico por operação:** dados locais limitados a UUID do pedido, versão do cliente, fase, tempos, tentativas, código permitido e UUIDs das dependências. Não inclui original, payload, conteúdo do recibo, caminho de arquivo, CPF, campos de cadastro ou mensagem do servidor. Distingue não enviado, recusado, resultado incerto, gravado aguardando leitura e leitura divergente. A propagação só é confirmada neste aparelho após leitura; os outros aparelhos continuam explicitamente não verificados. A telemetria remota mantém exclusivamente as contagens existentes.
4. **Contratos por campo:** equivalência de instante apenas em `eventos.inicio/fim` se a operação correspondente enviou exatamente esse instante ISO. Não modifica comparação global, datas civis, nulos, IDs, setor ou perfil. Testes negativos mantêm essas distinções. Reaproveita a correção financeira e as regras de arquivos já publicadas.
5. **Falhas por ficha:** refresh/open do diário preservam a base autorizada em cache da ficha com erro e continuam as demais. Um resultado vazio autorizado continua distinto de erro. Vínculos financeiros de intenções antigas também são preservados. O aviso só desaparece após nova leitura bem-sucedida daquele ID. Preparação, confirmação e revisão de uma operação exigem leitura estrita das fichas relacionadas; a fila não confirma nem libera dependências após falha. Durante a reserva não relê fichas avulsas sem relação, evitando consumir a lease com timeouts alheios.

## Revisão independente

Dois riscos P2 foram encontrados antes da entrega: vínculo financeiro existente apenas no complemento antigo e releitura de avulsos sem relação durante uma lease de 60 segundos. Ambos foram corrigidos; há regressão para o vínculo legado. A revisão executou os testes focados. PGlite usa uma única conexão, portanto não comprova locks entre conexões simultâneas.

## Riscos e condições anteriores à publicação

- A alteração do servidor amplia os recibos persistidos. Campos canônicos podem conter dados privados necessários à confirmação: ficam na tabela de recibos com a RLS por conta existente e nunca vão para diagnóstico. Medir crescimento/tamanho da resposta e retenção em homologação; não apagar recibos para reduzir espaço.
- A migration só aceita a definição exata da RPC pós-aliases (`md5 = 9afac4a610b268dec4ea50297b0b2fa3`). Qualquer mudança diferente exige nova revisão; não remover a proteção para aplicar.
- Validar a definição real atual, permissões, advisors e SQL em homologação antes da aplicação autorizada. Não existe stack Supabase local completo neste ambiente; os testes executam PostgreSQL descartável. Nenhum advisor remoto foi executado como parte desta implementação.
- Validar versões mistas cliente antigo/novo e recibo antigo/novo. A assinatura da RPC não mudou; o cliente novo aceita recibos sem o protocolo adicional e continua exigindo a leitura exata. O cliente antigo continua usando `aliases` e sua releitura. Os snapshots canônicos não dispensam revisão de leitura divergente.
- A suíte local de navegador não iniciou: o download oficial retornou arquivos inválidos/HTTP400 e o Chromium de sistema falhou na criação de socket (`Operation not permitted`). Não contar essas tentativas como testes aprovados. A CI existente utiliza a imagem oficial Playwright fixada e bloqueia rede externa no harness.
- Deploy automático desta branch está desativado nos dois arquivos Vercel. O workflow de PR executa apenas testes/build e upload de evidências, sem migration ou publicação. Merge/produção exigem autorização específica conforme AGENTS.md.

## Reversão preparada

1. Voltar o cliente para o deployment da base `c5a52bf`, preservando IndexedDB, localStorage, payloads fixados, originais e recibos. Não alterar nem reenfileirar pedidos incertos.
2. Reverter somente o código da RPC com `supabase/operacoes/recibos-canonicos-reversao.sql`, após revisão e autorização. O script exige obter de volta exatamente a assinatura anterior; recusa deriva de código. Nenhuma tabela, política, grant ou recibo é removido.
3. Recibos novos já gravados continuam sendo devolvidos pelo código anterior. Pedidos antigos continuam intactos. Teste SQL cobre isso.

## Validação real ainda necessária

Com duas contas e aparelhos autorizados, preparar registros de teste identificados e preservar/exportar filas antes de qualquer edição. Observar uma edição e um anexo, seu pedido/recibo, releitura na conta emissora e recebimento na segunda conta. Repetir após reload, desconexão/reconexão, duas abas e edição simultânea do mesmo campo e de campos independentes. Incluir conta sem permissão, perda da resposta após commit e aba com a versão anterior. Registrar UUIDs/versões/horários sem conteúdo privado. Não escolher conflitos reais pelo usuário, não contornar login e não reenviar pedido de resultado incerto sob outro ID.


## Resultado verificado da entrega local

- 17/17 testes focados passaram na versão final; revisão independente final executou 14/14 testes de fichas/evolução e não identificou outro P1/P2 concreto.
- A primeira suíte completa teve 1.258/1.259 aprovações e um timeout no subprocesso de recuperação. A reexecução isolada final de `recuperacao-ciclo.test.js` passou todos os seus 15 cenários em aproximadamente 21 segundos. Não declarar uma segunda execução completa aprovada: ela não ocorreu.
- Compilação final Vite aprovada (22,43 s). Permanecem avisos de bundle/imports. `git diff --check` e sintaxe dos dois novos scripts de navegador aprovados. Não há scripts de lint/tipos no package.json.
- Há 67 arquivos de jornadas de navegador preparados. A execução local não iniciou o navegador; a CI ainda não foi executada nesta alteração.
- O comando combinado de ajuste de teste, stage, commit e push foi rejeitado ANTES de executar pelo auto-review. A correção local do teste foi concluída depois como trabalho independente; stage/commit/push não foram repetidos. `HEAD` continua em `c5a52bf`. Não há commit novo nem PR deste trabalho.
- Motivo declarado da recusa: a revisão automática entendeu que a autorização de trabalho remoto não incluía publicação/push e exigiu autorização explícita antes de enviar a nova branch. O histórico recente foi consultado; não trouxe autorização nova para esse envio. A autorização anterior de publicação se referia à PR 109 já concluída. Não houve nova tentativa nem uso de outro canal para contornar a recusa.
- Para continuar a validação em CI: obter autorização explícita para commit/push desta branch e abertura de PR em rascunho, mantendo deploy automático desativado, sem merge/deploy/migration em produção.

Detalhes e hashes dos arquivos de implementação: `RESULTADOS.json`. Os logs citados permanecem na raiz da aplicação neste checkout remoto. Nenhuma dependência nova foi adicionada ao package.json/lockfile; `node_modules` é apenas um link local para as dependências já disponíveis e não deve ser incluído em commit.

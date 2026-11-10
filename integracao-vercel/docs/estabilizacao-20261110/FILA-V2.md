# Diário v2 integrado

O hook principal usa `diario-compartilhado.js` e IndexedDB separado (`integracao-intencoes-v2`). `usarDiario=false` existe somente para regressões explícitas do protocolo antigo. A aplicação usa v2 por padrão.

Cada ação preserva os deltas de registros, identidade, autoria, anexos e auditoria numa unidade. A preparação usa a base atual com merge de três vias; conflito é bloqueado para escolha, não resolvido pelo relógio local. Operações e ID de pedido são fixados antes do envio. Campos alheios não entram no delta. Pai, filhos e arquivos de uma mesma ação continuam no mesmo pedido transacional. A fila registra dependências de registros e criações; ações independentes podem avançar após recusa de outra unidade.

O append e a captura de dependências são uma transação IndexedDB. Claims têm lease/token; abas consultam o mesmo diário e recebem avisos mínimos por BroadcastChannel. Recibos persistem antes da releitura. Resultado desconhecido consulta `integracao_consultar_pedido` sob RLS, com validação do payload, antes de retomar o mesmo pedido. Recusas determinísticas são bloqueadas. Retries transitórios, inclusive releituras, são limitados e têm espera/jitter. Nenhum comprovante é purgado.

A indisponibilidade de persistência não vira sucesso: a intenção permanece em memória, aparece como não guardada, continua visível após refresh e pode ser exportada/retentada seletivamente. Fechamento do navegador é protegido por beforeunload. A confirmação de saída manual alerta sobre alterações não persistidas; nenhum software garante sobrevivência a um crash se o navegador recusou a gravação.

## Migração

Antes da conversão, o texto legado é preservado integralmente com SHA-256 e versão. Intenções importadas têm IDs determinísticos; reabrir não duplica. Tentativa antiga enviada mantém pedido/payload integral, inclusive sua autoria e recibo. Não é dividida retroativamente. Uma edição posterior à tentativa vira outra entrada dependente. Um rascunho sem tentativa é convertido em deltas contra a base original; não se importa o snapshot completo como inserts.

Originais malformados, sem base ou com identidade inconsistente ficam preservados para revisão/exportação e não são enviados. A chave legada não é apagada nem sobrescrita. O cache v2 guarda só a projeção canônica; cache não é fila. Uma aba antiga não consegue escrever na base do diário novo.

## Recuperação seletiva

Na interface, **Pendências de sincronização → Revisar esta alteração** mostra pedido, estado e diferenças. Escolhas são validadas novamente contra o remoto exibido. Tentativas sem resultado conhecido nunca viram novo pedido por uma escolha de conflito. Uma tentativa recusada pode originar substituição explícita com nova pré-condição; o original permanece arquivado e as dependências são redirecionadas atomicamente. Escolher integralmente o remoto registra dispensa explícita, sem fingir que o valor local foi gravado.

Recibo já confirmado com leitura divergente não autoriza reenvio; o usuário pode reconhecer o estado atual e depois editar normalmente. A cópia exportada contém original, checksum, entradas, recibos e intenções ainda não persistidas. Não houve recuperação em massa de dados reais nesta tarefa.

## Validação

- 13 cenários do núcleo com IndexedDB real e duas abas, sem serviços externos.
- 11 cenários do hook integrado: migração, reload idempotente, nova edição, unidade recusada independente, revisão seletiva, duas abas, resposta perdida, recibo com releitura falha, edição durante envio, quota/retomada e criação de meta com vínculo ERP inicialmente nulo.
- PostgreSQL real: replay, divergência de payload, RLS, concorrência, consulta somente leitura e autorização.
- Suíte anterior continua exercitando explicitamente o protocolo legado; não é contabilizada como teste do diário v2.

## Reversão

A versão antiga não lê o diário v2. Depois de existirem intenções v2, não retornar ao aplicativo antigo como se as pendências tivessem sumido. Preservar o banco local e publicar correção compatível; em emergência, suspender envios afetados mantendo leitura/exportação. Nunca limpar IndexedDB, restaurar snapshot de banco ou fazer backfill inverso. O service worker novo aguarda as abas antigas fecharem; não força reload durante edição.

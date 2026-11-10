# Diário de intenções — núcleo isolado, ainda não integrado ao hook

`src/fila-intencoes.js` prepara o protocolo 2 em um banco IndexedDB separado. Não é importado pela aplicação; não substitui a fila atual, não migra automaticamente e não envia operações reais. O diagnóstico de sobrescrita da fila legada continua válido. A ativação ainda NÃO está pronta.

## Contrato implementado

Uma entrada contém conta, ID de intenção/pedido estável, unidade de negócio explícita, módulo, dependências, operações, base original, intenção, versão, checksum e sequência transacional. A mesma identidade com outro conteúdo é recusada. Duas conexões IndexedDB inserem entradas distintas sem sobrescrever um snapshot compartilhado. A Promise só resolve após `transaction.oncomplete`; abort/quota rejeitam sem sucesso falso. Não há fallback silencioso para memória/localStorage.

O chamador define a unidade de negócio completa. O núcleo não deduz independência pela tabela: pai, filhos, auditoria obrigatória e referências de anexos devem integrar a mesma entrada. Dependências só podem apontar para entradas já existentes da mesma conta; isso impede ciclos e referências entre contas. Uma unidade bloqueada impede suas próximas entradas/dependentes, mas não impede unidades independentes.

Estados: pendente_local, resultado_desconhecido, confirmado_aguardando_leitura, confirmado, bloqueado_conflito, bloqueado_validacao, falha_transitoria. Claim com lease e token impede alteração por consumidor antigo. O payload enviado é fixado no primeiro claim, aplicando aliases tipados das dependências confirmadas. O original nunca muda. Recibo e aliases persistem antes da releitura; falha de leitura não reenvia a gravação.

Depois de lease vencido ou resposta perdida, o consumidor consulta recibo primeiro; se ausente, usa exatamente o mesmo pedido/payload. O callback de envio precisa manter a idempotência transacional da RPC atual. 400/401/403/404/422 e 409 bloqueiam explicitamente; transporte/5xx deixam resultado desconhecido. Retry automático tem backoff/jitter, Retry-After e limite de cinco envios. Depois disso, permanece pendente/incerto para revisão, sem descarte. O callback de sessão deve estar vinculado à identidade capturada; mudança de sessão interrompe callbacks e deixa recuperação para a conta original.

`preservarLegado` guarda o texto original, checksum e versão em transação idempotente, inclusive JSON malformado. Não importa um snapshot como operações. `exportar` retorna somente os registros da conta solicitada. A interface autenticada continua responsável por autorizar quem pode chamar esse método; IndexedDB não é barreira contra código da mesma origem. Não existe purge de originais, intenções ou recibos neste protocolo.

## Evidência isolada

`tests/fila-intencoes.browser.cjs` executa 13 cenários com IndexedDB real e duas abas em contexto descartável, bloqueando rede externa: append concorrente; claims distintos; aba fechada/recovery; isolamento de unidade inválida; dependências/aliases; mesmo pedido divergente; original legado idempotente; quota/abort sem meia entrada; IndexedDB ausente; resposta perdida; releitura falha; troca de conta; limite de retry. O teste imprime explicitamente `fluxoPrincipalIntegrado:false`.

Há três testes de contrato na suíte Node: checksum/semântica, ausência de IndexedDB e serialização inválida. Esses testes não substituem a prova de navegador.

## Integração ainda necessária

1. Mapear cada chamada de mutate/mutateConfirmed para unidade, dependências e referências de arquivos; preservar o contrato síncrono de edição e assíncrono de confirmação.
2. Persistir a intenção antes de anunciar durabilidade; tratar quota na UI com exportação segura, sem fechar o texto.
3. Construir/adaptar operações com a base canônica correta quando outra intenção anterior cria pais ou gera aliases. Não regenerar IDs/autoria nem atualizar expected com cache parcial.
4. Classificar os rascunhos antigos com base original + local + remoto, consultar recibos antigos e obter escolhas explícitas para conflitos. Preservar tentativa já enviada integralmente: não dividi-la retroativamente.
5. Integrar o leitor de recibos sob RLS, a releitura por domínio e a conferência dos campos de cada confirmação. Manter estado parcial explícito e bloquear repetição determinística sem alteração de intenção.
6. Conectar avisos/coordenação entre abas e a renderização das pendências de todas as abas da mesma conta, com invalidação por geração de sessão.
7. Homologar o handshake de versão, service worker/abas antigas, edição durante envio, recuperação assistida, revisão de bloqueados e rollback. Uma versão antiga não entende o novo diário; não basta ligá-lo por feature flag.

Somente após esses itens o novo diário pode assumir os envios do hook. Atualmente a fila antiga ainda controla a aplicação e mantém suas limitações conhecidas.

# QA independente (A7, Fase 4) — correção das pendências de sincronização

Data: 24/11/2026. Branch `correcao/sincronizacao-pendencias` em `8ff69fd`, comparada com `origin/main` (`5bac880`).
Escopo: revisão adversarial do diff de `src/`, `tests/` e `supabase/`, contra os contratos de
`docs/correcao-sincronizacao-multiagente.md`. Nenhum código de produção foi editado, nada foi commitado,
enviado ou aplicado em banco; produção não foi acessada.

## Adendo — correções após esta revisão (commits `76705ed` e `2a7107b`)

O veredito abaixo descreve `8ff69fd`. Os achados foram corrigidos e reverificados:

- Laço pelo monitor de conexão: 60 s com o servidor de dados fora passaram de 6.200 falhas / 173.583 requisições para 5 falhas / 294 requisições; o item confirma sozinho quando o servidor volta, com uma única gravação.
- Laço na renovação de sessão: 45 s passaram de 803 falhas / 4.036 renovações para 5 falhas / 50 renovações.
- Erro 500 com SQLSTATE determinístico repetido por mais de 10 min na gravação pede revisão sem recusa comprovada (o mesmo pedido pode ser retomado); 500 sem SQLSTATE ou de classes transitórias nunca escala.
- Pausa mínima para falha de sessão; 429 na consulta do recibo mantém resultado desconhecido; `Retry-After` longo não é repetido; base de escopo zerada ao abrir/fechar conta.
- Testes de regressão: `tests/sync-qa-lacos.test.js`. Estado final: build com 1.581/1.581 testes e 96/96 jornadas de navegador.
- Pendências conhecidas, não bloqueantes: a mensagem de segundo plano aparece como aviso de pendência em formulários fora de Metas e Cadastro; sondas `/api/conexao` proporcionais às falhas; filtro `in.` sobre `rpc/integracao_eventos` não verificado contra PostgREST real.
- As mudanças de banco foram retiradas desta entrega e seguem em análise separada.

## Veredito

**Não está pronta para publicação.** Dois laços quentes de retentativa foram reproduzidos de ponta a ponta no
navegador (achados 1 e 2). Ambos nascem da ligação entre os handlers de retomada (C5) e sinais que a própria
falha emite, e nenhum teste da suíte cobre essa ligação. O restante da mudança se sustenta, com ressalvas.

| Causa | Resultado | Motivo principal |
| --- | --- | --- |
| 1. Fila e retentativa | **Reprovado** | Backoff anulado pelo monitor de conexão (laço quente); 500 determinístico nunca pede revisão |
| 2. Sessão | **Reprovado** | Renovação de token com falha transitória entra em laço quente contra `/auth/v1/token` |
| 3. Transporte | Aprovado com ressalvas | `Retry-After` longo ignorado por `comRepeticao`; `erp_collab_directory` não repetida |
| 4. Leitura por escopo | Aprovado com ressalvas | Efeito é relido do servidor; `baseCompletaEm` não é zerado ao trocar de sessão |
| 5. Confirmação e conciliação | Aprovado | Adaptadores e mescla de conjunto corretos nos casos testados |
| 6. Interface | Aprovado com ressalvas | "Segundo plano" tratado só em 2 formulários; item "atrasado" sem botão de revisão |
| 8. Testes ajustados | Aprovado com ressalvas | Nenhuma asserção esconde regressão; há perda de cobertura e uma lacuna grave |

## Achados por gravidade

### 1. Laço quente: o monitor de conexão anula o backoff — CONFIRMADO (alta)

Onde: `src/conexao-rede.js:30-36` e `:15-28`, `src/transporte-rest.js:53`, `src/use-dados-compartilhados.js:631-639`,
`src/fila-intencoes.js:282-293`.

Mecanismo: uma falha de rede em `buscarREST` dispara `integracao:transporte {ok:false}`. O monitor publica
"offline", consulta `/api/conexao` e, se ela responde, publica "online" de novo na hora. O handler `online` do hook
vê `reconectou`, chama `retomarTransitorias('online')` — que zera `proximaTentativa` do item que acabou de falhar — e
`flush()`. A nova tentativa falha, e o ciclo recomeça.

Cenário: o Supabase fica inalcançável no nível de rede (DNS, bloqueio, resposta de gateway sem CORS) enquanto a
Vercel continua respondendo.

Evidência (fixture local, `/rest/v1/*` lança `TypeError`, uma edição de meta pendente):

| Variante | Tempo | Falhas do item | Requisições REST | Consultas `/api/conexao` |
| --- | --- | --- | --- | --- |
| Branch, `/api/conexao` responde | 60 s | 6.200 | 173.583 | 142.583 |
| Branch, sem assinatura de `observarConexao` (controle) | 30 s | 4 | 112 | 0 |
| Base `origin/main`, `/api/conexao` responde | 30 s | 5 (parado) | 8 | 0 |
| Branch, `/api/conexao` também falha | 130 s | 12 | 336 | 280 |

Na última variante a retomada acontece a cada janela de 10 s: aos 80 s o item tinha 82 s de espera agendada e
falhou de novo antes dos 85 s. Com o backoff respeitado, o máximo teórico em 130 s seria 8 falhas.

A taxa da primeira linha é a da fixture, onde a falha é instantânea; em rede real o ciclo é limitado pela latência
da falha, mas continua sem espera. Cada ciclo também grava no IndexedDB, serializa o rascunho e republica o estado.
Não há gravação duplicada: nenhuma chamada a `integracao_gravar` ocorreu.

Sugestão: retomar em `online` só numa transição real do navegador (evento `online`), não na reabertura da janela de
falha de transporte; `/api/conexao` não deve limpar uma falha contra o Supabase; e `retomarTransitorias` deve
preservar um piso (por exemplo, não antecipar item que falhou há menos de N segundos).

### 2. Laço quente: renovação de sessão com falha transitória — CONFIRMADO (alta)

Onde: `src/dados-compartilhados.js:79` e `:91`, `src/use-dados-compartilhados.js:625-629`.

Mecanismo: `renovarSessao` emite `renovando` e, quando a renovação falha de forma transitória, volta a `valida`,
emitindo `integracao:sessao {estado:'valida'}`. O handler trata isso como sessão recuperada: zera o backoff e
chama `flush()`, que tenta renovar outra vez.

Cenário: token dentro da margem de 120 s (ou já expirado) e o endpoint de autenticação indisponível — rede caída
ou resposta 500/429. Típico de aparelho que volta do repouso.

Evidência (fixture local, sessão com `expires_in: 30`):

| Variante | Tempo | Falhas do item | Chamadas a `/auth/v1/token` |
| --- | --- | --- | --- |
| Branch, renovação lança `TypeError` | 45 s | 803 | 4.036 |
| Branch, renovação responde 500 | 20 s | 429 | 2.158 |
| Base `origin/main`, renovação lança `TypeError` | 25 s | 5 (parado) | 12 |

Com 429 do servidor de autenticação o laço continua e prolonga o próprio bloqueio.

Sugestão: não emitir `valida` ao sair de uma renovação que falhou (ou marcar o evento com `motivo`), e retomar a
fila só quando o estado anterior era `invalida`/`ausente` ou quando a renovação teve sucesso.

### 3. Erro permanente do servidor com status 500 nunca pede revisão — CONFIRMADO (média)

Onde: `src/estado-sincronizacao.js:21-29`, `src/fila-intencoes.js:228`.

Um 500 só vira `validacao` se o código for `P0001` ou começar com `22`/`23`. Classificação observada:
`500/XX000`, `500/P0002`, `500/42703`, `500/42883`, `500/54001`, `500` sem código → `transitoria`.
`500/23505` e `500/P0001` → `validacao` (correto). `409/23505` → `conflito`.

Prova: 50 passagens com `integracao_gravar` respondendo `500/XX000` produziram 50 envios e 49 consultas de recibo;
o item terminou com `falhas=50`, sem exigir revisão. A consulta antes de cada reenvio foi respeitada. Com o tick
de 120 s, o pedido é reenviado para sempre e bloqueia as alterações seguintes da mesma unidade.

Agravante: com `falhas >= 8` a lista esconde o botão "Revisar esta alteração" (`src/PendenciasSincronizacao.jsx:53`).

Sugestão: escalar para revisão após N falhas consecutivas idênticas com status recebido na fase de envio, ou
classificar por classe de SQLSTATE quando o 500 traz código.

### 4. 429 na consulta de recibo leva a reenvio sem nova consulta — CONFIRMADO (baixa, pré-existente)

Onde: `src/fila-intencoes.js:218` e `:146`.

Sequência reproduzida: envio com resposta perdida → consulta de recibo recebe 429 → estado `falha_transitoria` →
a passagem seguinte entra na fase `envio` sem consultar. Sequência registrada: `envio > consulta > envio`.

A regra já existe em `origin/main`; a branch aumenta a exposição porque o item não esgota mais. Contradiz a
garantia 2 do contrato. O servidor é idempotente por pedido (`integracao_pedidos`), então não há gravação dupla.

Sugestão: usar `falha_transitoria` só quando o 429 vier da fase `envio`; fora dela manter `resultado_desconhecido`.

### 5. Falha de categoria `sessao` não agenda espera — PLAUSÍVEL (média)

Onde: `src/fila-intencoes.js:212`, `src/use-dados-compartilhados.js:215`.

Confirmado em unidade: 20 passagens com erro 401 reservaram o item 20 vezes, com `falhas=0` e `proximaTentativa=0`.
Dentro de `requisicao` isso é contido, porque a segunda 401 invalida a sessão. Um 401 vindo de fora dela — os
uploads de Storage em `src/dados-compartilhados.js:727` e `:749` usam `fetch` direto — repetiria a cada 3 s, sem
limite. Não foi reproduzido de ponta a ponta: depende de o Storage responder HTTP 401 a um token que o PostgREST
aceita.

Sugestão: aplicar um backoff mínimo também à categoria `sessao`, ou invalidar a sessão quando o 401 vier de fora
de `requisicao`.

### 6. `baseCompletaEm` não é zerado ao abrir ou fechar sessão — PLAUSÍVEL (baixa)

Onde: `src/use-dados-compartilhados.js:62`, `:75`, `:151`.

O instante da última leitura completa só é escrito em `carregarBase`. Se outra conta entra em menos de 10 min e a
carga inicial cai no rascunho local (`open`, ramo de falha transitória), as intenções mapeadas usam escopo sobre
uma base antiga tratada como recente. As linhas da intenção continuam sendo lidas do servidor; o que fica velho são
as demais tabelas. Confirmado por leitura, não reproduzido.

Sugestão: zerar `baseCompletaEm.current` em `open()` e `close()`.

### 7. `comRepeticao` ignora `Retry-After` longo — CONFIRMADO (baixa)

Onde: `src/dados-compartilhados.js:165-170`.

`buscarREST` desiste quando o servidor pede mais de 5 s, mas `comRepeticao` repete a página 60 ms depois. Prova:
429 com `Retry-After: 30` em `metas` gerou duas chamadas, aos 12 ms e 73 ms.

Sugestão: não repetir quando `e.retryAfterMs` exceder o teto.

### 8. Ressalvas menores

- **"Segundo plano" fora de Metas e Cadastro** (`src/App.jsx:7978`, `:8082`, `:10528`, `:10671`): os demais
  formulários mostram a mensagem no espaço de erro e ficam em "confirmação pendente". Não há duplicação, porque
  reutilizam `retentarConfirmacao`. Confirmado por leitura.
- **Cache de 5 s da passagem** (`src/use-dados-compartilhados.js:71-75`): um recibo encontrado por consulta, de
  gravação concluída depois da leitura em cache, gera uma `LEITURA_DIVERGENTE` falsa. Erra para o lado seguro.
  Plausível.
- **`erp_collab_directory` fora de `RPC_LEITURA`** (`src/dados-compartilhados.js:26`): uma falha de rede nessa RPC
  derruba a carga inteira sem repetição. Comportamento igual ao da base.
- **C4, edição visível com `LEITURA_DIVERGENTE`** (`src/diario-compartilhado.js:37`): quando o servidor mantém o
  valor antigo, a tela mostra o valor do usuário ainda não confirmado. É decisão do contrato; registro o risco.
- **`aditivo` de `lidaPor`**: aceita servidor com leitores a mais, inclusive quando o esperado é lista vazia. Hoje
  não existe "marcar como não lida", então não há efeito.

## O que foi verificado e se sustenta

- **Sem `MAX_SAFE_INTEGER` para transitórias**, backoff por `falhas` até 300 s, migração de itens antigos
  preservando `id`, `payload`, `recibo` e fase (leitura do código e testes `sync-c1`).
- **Resultado desconhecido passa pela consulta** antes de reenviar (50 envios, 49 consultas na prova do achado 3).
- **401 em escrita**: renova uma vez e repete com o novo token; a segunda 401 invalida a sessão
  (`gravar:t > refresh > gravar:t2 => SESSAO_EXPIRADA`, estado `invalida`). É seguro para `integracao_gravar`:
  a rejeição de JWT ocorre antes da execução, um erro levantado na função desfaz a transação, e o pedido é
  idempotente. Uploads de Storage não passam por `requisicao` e não foram alterados; usam caminho por hash e
  `x-upsert:false`.
- **`RPC_LEITURA`**: as cinco funções são `STABLE` nas definições mais recentes do repositório
  (`integracao_contagens_clientes` está em `supabase/operacoes/financeiro-compartilhado.sql`, não em migration).
- **Escritas nunca repetidas** por `buscarREST` nem por `comRepeticao`. Multiplicação máxima de leitura por página:
  3 (status) × 2 (`comRepeticao`), ou 2 × 2 × 25 s para prazo.
- **Leitura por escopo**: para uma edição de meta, as 8 tabelas do registro são lidas com `in.(...)` e a linha
  devolvida é a do servidor; tabelas fora do escopo vêm do `anterior`. Ids com vírgula, aspas, barra e parêntese
  chegam ao filtro com aspas e escape (`id=in.("mt,\"1\\)",simples-1,"a b")`).
- **Conciliação de conjunto**: remoção local com adição remota, adição local com remoção remota, remoções
  distintas e esvaziamento local — nenhum caso perdeu remoção nem ressuscitou membro.
- **`nulo_vazio`**: `null` e `''` equivalem; `'a'` contra `null` diverge.
- **Formulários**: `ModalMetaERP` e `ModalMorador` são montados condicionalmente, então reabrir gera ids novos.
  Edição de meta: os campos comparados cobrem todos os que `Object.assign(q, base)` gravava.

## Testes antigos alterados

| Arquivo | Mudança | Julgamento |
| --- | --- | --- |
| `browser-fixture.js` | Servidor falso aceita `in.(...)` em qualquer coluna | Neutro |
| `cadastro-transporte-fixture.js` | `rearmou: true→false`, `permaneceParada→permaneceIncerta` | Coerente com C1; o caminho positivo de `rearmarCadastro` ficou sem cobertura |
| `codigo-morador-salvar.test.js` | Novas dependências no contexto | Neutro |
| `confirmacao-mutacoes.test.js` | Timeout espera `CONFIRMACAO_SEGUNDO_PLANO`; caso novo de revisão | Coerente com C6 |
| `diario-equivalencia-campo.browser.cjs` | `reaberto: 1→0`, novo `elegivel:true` | Coerente com C1; o reparo ao reconectar ficou sem caso positivo |
| `diario-metas-leitura.browser.cjs` | Espera aceita erro transitório no item; cenário "já gravada" reordenado | Afrouxa: não exige mais mensagem visível para 503. As asserções de não envio e de preservação ficaram |
| `diario-revisao-leitura.browser.cjs` | Edição com recibo divergente passa a ficar visível | Inverte a asserção antiga por decisão de C4; mantém "pendente, não confirmado" |
| `revisao-leitura.test.js` | Idem, mais caso de conflito mostrando o servidor | Idem |
| `estabilizacao-regressoes.test.js` | Recusa da renovação deixa `temSessao()` falso | Coerente com C2 |
| `fila-intencoes.browser.cjs` | Após 5×429 o item segue elegível, fase `envio` | Coerente com C1; consagra o reenvio sem consulta após 429 |
| `meta-criacao-confirmacao.test.js` | Novas dependências e casos C6 | Reforça |
| `sincronizacao-otimizacao-seguranca.browser.cjs` | `consultas <= 5` → `<= 8` | Coerente; `envios === 1` foi mantido |

Lacuna: nenhum teste exercita os handlers de `integracao:conexao` e `integracao:sessao` junto com a fila. Os dois
laços quentes passam por toda a suíte.

## Medição (fixture sintética, 20 amostras por fluxo, uma execução de cada lado)

| Fluxo | Chamadas por operação | p50 (ms) | p95 (ms) | Releitura p95 (ms) | Gravações por pedido | Consultas de recibo | Pendências residuais |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Metas | 37 → 31 | 388,1 → 385,3 | 392,4 → 391,5 | 55,9 → 54,8 | 1 → 1 | 0 → 0 | 0 → 0 |
| Calendário | 24 → 22 | 382,9 → 353,9 | 388,7 → 360,5 | 53,1 → 37,1 | 1 → 1 | 0 → 0 | 0 → 0 |
| Campo | 95 → 95 | 588,7 → 617,0 | 590,6 → 625,5 | 137,6 → 155,7 | 1 → 1 | 0 → 0 | 0 → 0 |

Avisos falsos: 0 nos dois lados. Campo ficou cerca de 5 % mais lento com o mesmo número de chamadas; com uma
única execução por lado não dá para separar regressão de ruído. A fixture usa atraso fixo de 15 ms e não
representa a latência de produção.

## Execuções

- `npm test` na branch: 1575 de 1575.
- `npm run test:browser` na branch: 96 de 96 jornadas.
- `node scripts/medir-sincronizacao.mjs` na branch e na base (worktree temporária de `origin/main`, removida).
- Provas próprias em scripts temporários fora do repositório (não versionados): dois arquivos de teste de unidade
  e dois roteiros de navegador sobre `tests/sincronizacao-ciclo.html`.

## Limites desta validação

- Nada foi executado contra produção nem contra um PostgREST ou Postgres reais. O filtro `id=in.(...)` sobre
  `rpc/integracao_eventos` por POST não foi provado: a função é `RETURNS SETOF erp_eventos`, `STABLE`, o que a
  documentação do PostgREST trata como filtrável, mas a fixture apenas simula.
- As taxas dos laços vêm de fixture com falha instantânea. O achado 1 exige a assinatura que `App.jsx:6630` faz
  de `observarConexao`; no roteiro ela foi feita à mão porque a página de teste não monta o `App`.
- Não há scripts de lint nem de tipos no `package.json`.
- Equivalência "projeção por escopo = projeção completa" não foi refeita por fuzz; vale a suíte `sync-c3`.

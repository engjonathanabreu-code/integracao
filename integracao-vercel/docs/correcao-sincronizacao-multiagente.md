# Correção das pendências de sincronização — contratos multiagente (24/11/2026)

Branch de integração: `correcao/sincronizacao-pendencias` (deploy Vercel desativado em ambos os `vercel.json`).
Branches filhas `correcao/sync-<agente>` nunca são enviadas ao remoto. Sem merge, deploy ou `apply_migration`
sem autorização explícita. A migration/PR 97 não é tocada.

## Evidência de partida (produção, somente leitura)

- 16 de 39 aparelhos ativos em 14 dias relataram pendências (pendente_local, LEITURA_DIVERGENTE, PT409, 23514,
  23P01, P0001, TRANSPORTE).
- 24 h: 1 erro em 361 chamadas de `integracao_gravar`; ~3.300 cargas completas da base (~40 requisições cada);
  páginas de 500 linhas com 1–2 s; 36 statement timeouts; erros 500 em leituras.
- Leituras lentas por avaliação de regras de acesso linha a linha (`metas` com ~18 milhões de idx_scan); tratadas em entrega de banco separada.

## Garantias que nenhum agente pode afrouxar

1. Um pedido (`id`) por intenção; reenvio nunca usa outra identidade.
2. Resultado desconhecido após envio só se resolve com `integracao_consultar_pedido` (JSON `null` explícito = ausência).
3. "Salvo"/confirmado exige recibo do servidor + releitura do efeito.
4. O original da intenção é preservado até estado terminal; nada limpa IndexedDB/localStorage/filas reais.
5. Recusa comprovada pelo servidor (status recebido) continua exigindo revisão.

## C1 — Categorias de falha e efeito no item

| Categoria | Gatilhos | Efeito no item |
| --- | --- | --- |
| `transitoria` | TRANSPORTE, Abort/Timeout, TypeError de rede, 408, 429, 500, 502, 503, 504 | Mantém/ajusta estado (`resultado_desconhecido`/`falha_transitoria`, ou `confirmado_aguardando_leitura` se há recibo). `falhas++`. `proximaTentativa = agora + max(retryAfter, min(300000, 1000·2^min(falhas,9))·(0,5–1))`. **Nunca** `MAX_SAFE_INTEGER`. Com `falhas >= 8` a UI mostra "atrasado", sem exigir revisão. |
| `sessao` | 401, PGRST301–303, SESSAO_EXPIRADA, SESSAO_AUSENTE, "JWT expired" | Estado e `falhas` inalterados; registra `erro` informativo; aborta a passagem atual (`executar`) sem reservar outros itens. Retomada após `integracao:sessao` com `estado:'valida'`. |
| `conflito` | PT409/409 recebido do servidor; conflito local confirmado | `bloqueado_conflito` (revisão), como hoje. |
| `validacao` | P0001 (exceto registro indisponível), 400/404/422, SQLSTATE 22*/23*, INTENCAO_SEM_OPERACOES | `bloqueado_validacao` (revisão), com mensagem de campo/regra quando conhecida. |
| `permissao` | 403, 42501 | `bloqueado_validacao` (revisão), como hoje. |
| `registro_indisponivel` | P0001 "Registro indisponível ou sem permissão" / registro apagado ou oculto | Novo: `bloqueado_validacao` com `erro.categoria='registro_indisponivel'`; UI oferece recriar ou descartar. |
| `leitura` | LEITURA_DIVERGENTE | Mantém regras atuais de releitura limitada; a edição continua visível enquanto aguarda (ver C4). |
| `armazenamento` | PERSISTENCIA_*, QuotaExceededError, InvalidStateError | Como hoje. |

Migração de itens antigos (ao abrir a fila, idempotente): item não terminal com `proximaTentativa === MAX_SAFE_INTEGER`
e `erro.categoria` em `transitoria`/`sessao` e sem recusa comprovada volta a ser elegível (`proximaTentativa = agora`),
mantendo `id`, `payload`, `recibo` e fase. Itens enviados continuam passando pela consulta de pedido.

## C2 — Estado de sessão (`src/dados-compartilhados.js`, dono A2)

- `estadoSessao(): 'valida'|'renovando'|'invalida'|'ausente'`.
- `temSessao()` retorna `true` somente em `'valida'` ou `'renovando'`.
- `invalidarSessao(motivo)`: estado `'invalida'`, mantém o usuário para relogin, aborta requisições em voo.
- Evento `window` `integracao:sessao` com `detail:{estado}` em toda mudança.
- `requisicao`: ao receber 401/PGRST301–303/"JWT expired" do servidor, renova **uma vez** e repete; se a renovação
  falhar com 400/401/403, chama `invalidarSessao` e lança `SESSAO_EXPIRADA`.
- Expiração calculada com margem de 120 s sobre `expires_in` (tolerância a relógio).
- A fila (A1) não reserva itens se `estadoSessao()` não for `'valida'`/`'renovando'`.

## C3 — Leitura por escopo (dono A3)

- `escopoDaIntencao(intencao, aliases) -> {[tabela]: {coluna, ids:string[]}} | null` em `src/leitura-intencoes.js`.
  `null` = leitura completa (intenção não mapeada ou mista desconhecida).
- `lerBase({escopo, anterior, ...})`: com escopo, lê só as linhas (`coluna=in.(...)`, em lotes) e devolve `anterior`
  com essas linhas substituídas e as ausentes removidas, por tabela/coluna. Sem `anterior` completo, faz leitura completa.
- Concorrência máxima de 6 tabelas simultâneas; falha de uma tabela repete só essa tabela (até 2 vezes, backoff).
- Teste de equivalência por módulo: projeção por escopo == projeção completa para os registros da intenção.
- Implementado (A3): escopo para `metas` (metas + responsáveis/checklist/comentários/histórico/arquivos por `meta_id`;
  `integracao_metas`/`integracao_complementos` por `registro_id`, incluindo filhos lidos na mesma passagem),
  `ordensServico`, `setoresMeta`, edição/cancelamento de `eventos` e `agendas`, `auditoria` e `notificacoes`.
  Lidos inteiros junto do escopo: perfis/contrato/diretório, `integracao_usuarios`, `integracao_arquivos` e, com Metas,
  `meta_setores`. Em fallback (grupos ou leitura completa): criação de evento/agenda (identidade do servidor/série),
  clientes/moradores, núcleos, planos, usuários, conversas, configurações sem id e qualquer mistura com esses módulos.
  CRM, ponto, semanal e marketing não passam por `lerBase`. O escopo só é usado com base completa lida há menos de
  10 min; com base antiga, uma intenção mapeada faz uma leitura completa. Leituras completas consecutivas da mesma
  passagem da fila são reutilizadas por até 5 s e invalidadas por qualquer envio ou aviso de outra aba.

## C4 — Comparação de confirmação (dono A4)

- `igualSemantico` permanece estrita.
- Novo registro `adaptadoresCampo` com entradas `{colecao, campo|caminho, tipo}`; tipos:
  `conjunto` (arrays escalares de ids, sem ordem), `nulo_vazio` (null/''/undefined equivalentes),
  `numero` (número e texto numérico canônico), `gerado_servidor` (ignorado na comparação).
- `igualCampo(colecao, caminho, a, b)` aplica o adaptador ou cai em `igualSemantico`.
- Financeiro continua usando a projeção existente; nenhum adaptador novo em campos monetários.
- A mesma regra de conjunto vale na conciliação de três versões (`concorrencia.js`).

## C5 — Retomada e espera (dono A1; UI liga eventos: A5)

- `diario.retomarTransitorias(motivo)`: torna elegíveis já os itens transitórios/sessão; não toca em revisão.
  Chamado em `online`, `focus`/`visibilitychange`, `integracao:sessao` válido e no tick de 120 s.
- `motivoEspera(item) -> null | {tipo:'dependencia', itemId, causaRaiz:{estado, categoria, codigo}}`.

## C6 — Criação idempotente (dono A5)

- Formulário de criação gera `idOperacao` ao abrir; novo salvamento com o mesmo id retoma a confirmação existente
  (`aguardar`/`esperar` já rejeitam duplicata) em vez de criar outro registro.
- Após o timeout de 45 s, a UI mostra "enviando em segundo plano" (não erro) enquanto o item não exigir revisão.

## Posse de arquivos

| Agente | Arquivos |
| --- | --- |
| A1 Fila | `fila-intencoes.js`, `estado-sincronizacao.js`, `conexao-rede.js`, `diario-compartilhado.js` |
| A2 Sessão/transporte | `transporte-rest.js`; bloco de sessão/`requisicao` de `dados-compartilhados.js`; login em `App.jsx` (~5900–5950) |
| A3 Leitura | `leitura-intencoes.js`; `lerBase`/`lerMoradoresMunicipio` de `dados-compartilhados.js`; `sincronizacao-clientes.js`; `carregar()` em `use-dados-compartilhados.js` |
| A4 Confirmação/conflitos | `confirmacao-mutacoes.js` (comparação), `igualdade-semantica.js`, `concorrencia.js`, `intencoes-edicao.js`, `diagnostico-validacao.js` |
| A5 UI | `PendenciasSincronizacao.jsx`, `AvisoSincronizacao.jsx`, timeout em `confirmacao-mutacoes.js` (após A4), formulários Metas/Clientes em `App.jsx`, handlers de eventos em `use-dados-compartilhados.js` |
| A6 Banco | entrega separada, fora desta PR |
| A7 QA | `tests/` |

Ordem de integração: A1 → A2 → A3 → A4 → A5; A6 em separado.

## Adendo — pendências já registradas nos aparelhos (24/11/2026)

Causas levantadas pelo diagnóstico agregado dos aparelhos e corrigidas nesta entrega:

- **Arquivos do Campo offline:** cada gravação do pacote criava uma versão do mesmo arquivo, todas na mesma
  unidade da fila; uma versão em conflito prendia as seguintes. Versões só-de-arquivo superadas e nunca enviadas
  (ou comprovadamente recusadas) passam a `substituido` com decisão `versao_de_arquivo_superada`, com os bytes
  preservados; só a mais recente é enviada. Vale também para itens já presos (migração idempotente). Uma versão
  da qual depende um pedido de dados que carrega o mesmo arquivo permanece na cadeia (sem espera circular).
- **Arquivo sem gravação necessária / já presente no servidor:** encerram como `dispensado` com prova, em vez de
  revisão. "Manter minha versão" usa o ponteiro do servidor exibido na prévia.
- **Regras por versão (`VERSAO_REGRAS_CONFIRMACAO`):** itens antigos com leitura divergente ganham uma nova
  comparação por versão de regras (sem reenvio); conflitos detectados antes do envio ganham uma nova preparação
  por versão; se persistirem, continuam em revisão.
- **Adaptador `instante`:** o mesmo instante em formatos diferentes não é conflito (etapas de núcleo, horários de
  evento e conclusão de checklist).
- **Corte local de notificações:** remoção nunca enviada conta como satisfeita na confirmação.
- **Validação antes de salvar:** sobreposição e reserva de agenda no evento, condições de venda e código do
  morador; mensagens de pendência indicam a regra recusada.

Pendente de decisão de produto: o pacote de Campo é um registro por conta; contas usadas em vários aparelhos
continuam gerando um conflito por aparelho a cada ciclo. Tornar o pacote por aparelho elimina a causa, mas
remove a restauração do pacote em outro aparelho.

## Adendo — pente fino, onda 1 de sincronização (25/11/2026)

- **C3, leitura periódica (SYNC-M5):** com o tempo real `conectado` e uma leitura completa iniciada depois da
  conexão atual, o tick de 120 s e a troca de janela não releem a base (`src/releitura-periodica.js`); rede de
  segurança de 7 min, abaixo dos 10 min de validade da base do escopo. A retomada da fila (C5) continua em todo
  tick/foco. Reconexão, avisos do tempo real e atualização manual não mudam.
- **C3, escopo de Clientes (SYNC-C1):** a edição de uma ficha **existente** passa a ter escopo (complemento legado
  por `registro_id`; as linhas da ficha continuam sendo relidas por `lerFichaCliente`). Criação e remoção de
  cliente, núcleos e misturas não mapeadas seguem em leitura completa.

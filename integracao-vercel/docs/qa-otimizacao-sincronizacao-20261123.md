# QA independente — sincronização incremental

Base revisada: `1205203` (`origin/main` na criação da branch). Todos os dados usados nesta revisão são sintéticos. Nenhuma fila, conta ou serviço de produção foi modificado.

## Baseline reproduzida

Antes de editar as fontes, `classificarFalha({code:'P0001'})` retornava `categoria:'transitoria', status:null`; o mesmo código com HTTP 400 retornava validação. O código isolado não identificava qual regra havia recusado a gravação. Tratar o primeiro caso como transitório permitia repetição automática; a correção mantém a intenção para revisão e não inventa uma regra.

A análise do protocolo também encontrou dois pontos que precisavam de prova explícita: `undefined` na consulta não é o JSON `null` devolvido pelo RPC após verificar ausência; recibo persistido localmente não prova sozinho autoria e identidade do pedido.

Comparação executada em Chromium/IndexedDB reais, com o mesmo relógio sintético e oito oportunidades de processamento por cenário:

| Cenário | Base 1205203 | Branch corrigida |
| --- | --- | --- |
| Consulta retorna `undefined` | 5 envios, 4 consultas, resultado desconhecido | 1 envio, 4 consultas, resultado desconhecido preservado |
| P0001 sem HTTP | 5 envios, 4 consultas, resultado desconhecido | 1 envio, 0 consultas, revisão de validação |
| Recibo apenas local; RPC informa ausência | 0 consultas, 1 releitura, encerrava | 5 consultas limitadas, 0 releituras, pendência preservada |

Em todos os cenários permaneceu uma única intenção com o mesmo pedido. “Envios” conta chamadas tentadas ao callback de escrita, não commits efetivos; os casos de resposta perdida da jornada confirmam separadamente uma única gravação efetiva. O teste novo completo falha na baseline quando identifica cinco envios em vez de um no primeiro cenário e passa integralmente na branch corrigida.

## Evidência de recibo e autorização

O RPC existente `integracao_consultar_pedido` é `STABLE SECURITY INVOKER`. Exige sessão ativa, seleciona o recibo por `usuario_id=auth.uid()` e pelo mesmo `pedido`, e compara o resumo das mesmas operações. Não foi necessário alterar SQL nem permissões. A retomada revalida um recibo preexistente por esse RPC e compara integralmente o resultado antes da releitura. Ausência, erro ou recibo diferente preservam a pendência; não autorizam reenviar.

O teste `recibos-canonicos.test.js` executa essas funções existentes em PGlite isolado. Cobre duas contas, RLS, recibos antigos/novos, pedido reutilizado com payload diferente, atomicidade e resposta perdida. Isso não é uma verificação da instalação atual do banco de produção.

## Jornadas de segurança

`sincronizacao-otimizacao-seguranca.browser.cjs` usa Chromium e IndexedDB reais, funções de produção e callbacks sintéticos. O wrapper `browser-isolado.cjs` bloqueia HTTP e WebSocket fora da origem local.

| Cenário | Evidência exigida |
| --- | --- |
| Caminho normal | Uma gravação e uma releitura; nenhuma consulta extra de recibo |
| Queda antes do commit | Consulta comprova ausência; repete o mesmo pedido; uma gravação efetiva |
| Resposta perdida após commit | Consulta encontra recibo; nenhuma segunda gravação |
| Consulta retorna `undefined` ou erro | Nenhum reenvio; original e checksum preservados; tentativas limitadas |
| P0001 sem status | Revisão, sem mensagem sensível, sem atribuir causa e sem ciclo de escrita |
| Permissão 403 ou conflito 409 | Mesmo registro e sucessor ficam preservados; independente conclui |
| Recibo antigo e falha na releitura | Reconsulta autenticada e somente leitura; original preservado |
| Recibo apenas local com consulta ausente/diferente | Nenhuma baixa, releitura ou escrita |
| Recibo tipado de outro pedido | Recusado; não há confirmação |
| Duas abas | Só uma reserva o mesmo item |

Os testes de fila e confirmação adicionados pelas outras frentes verificam seleção justa numa passagem e retomada após uma edição ativa. A revisão independente confere também os testes existentes de arquivos, isolamento, versão posterior, cópia privada de Campo, retorno após reload e sessão alterada. O protocolo de arquivos continua inteiro: não houve substituição de pacote para destravar pendência, nem novo protocolo de recuperação granular.

## Calendário e recorte da releitura

`sincronizacao-otimizacao-calendario.browser.cjs` verifica sete cenários com o diário, `lerBase`, projeção, preparação e comparação de confirmação reais: criar evento com alias de ID e vínculo ao núcleo/agenda; resposta de participante; status cancelado; renomear agenda e mudar vínculo; complemento de Calendário; valor concorrente após a gravação; recusa 403 na releitura autorizada. Os cinco caminhos válidos confirmam com um envio, duas leituras (preparo e confirmação) e nenhuma consulta extra de recibo. Os dois caminhos negativos preservam o recibo e a pendência, sem novo envio.

A jornada exige a leitura atual de agendas, eventos via RPC, respostas, complementos, perfis, contrato e auxiliares. Uma mudança remota em Metas fica fora do recorte e não interfere na confirmação do evento. Misturar outro módulo mantém o fallback completo nos testes do seletor. O vínculo processo→núcleo usa a identidade previamente carregada; uma alteração de núcleo no mesmo pedido exige o fallback completo. Não foi alterada a autorização do RPC.

## Upload parcial e limite de recuperação

`sincronizacao-otimizacao-arquivos.browser.cjs` provoca sucesso no primeiro objeto e HTTP 503 no segundo. O teste executa a preparação real do Storage e o processador real com IndexedDB. Comprova: nenhum callback de gravação de metadados antes de preparar todos os arquivos; bytes, versões e checksum originais preservados; operação de Metas independente conclui enquanto o pacote aguarda; retomada mantém o pacote original e os mesmos caminhos por hash; `x-upsert:false` impede substituir o primeiro objeto. Após a retomada há dois objetos imutáveis e uma única gravação dos vínculos do pacote.

O protocolo atual não persiste um comprovante granular de upload por arquivo antes da gravação dos vínculos. A retomada repete os POSTs nos mesmos caminhos imutáveis e aceita o retorno Duplicate do Storage; ela não demonstra “enviar apenas o que falta”. Não foi introduzida substituição de pacote, descarte de original ou recuperação granular por hipótese. Um caso que exigir recuperação granular além desse protocolo permanece bloqueado para revisão, preservando o pacote.

## Revisão de exclusão entre abas

A revisão independente do lock verificou a reserva transacional por token/dono, conferência de sessão e prazo antes/depois dos callbacks, heartbeat serial e liberação do Web Lock após drenar as renovações. Com um Web Lock real e exclusivo, do nome esperado, o consumidor renova quando necessário: só evita uma renovação redundante se o prazo conhecido tiver folga superior a um terço do lease, usando o mesmo relógio da fila e sem retrocesso observado. Relógio ou prazo desconhecido exige renovação. O heartbeat continua forçado; as mutações duráveis mantêm a validação transacional de proprietário, token e expiração. Sem Web Locks ou com trava injetada, o caminho curto mantém as seis renovações anteriores. Contenção pula o item sem callback e sem aumentar tentativas; o lease roubado por cliente antigo impede confirmar como salvo. O lock é por banco/conta/item, permitindo outra intenção independente.

Sem Web Locks, o fallback tem lease renovável, mas não comprova exclusão estrita em aba suspensa. Abas de versão antiga podem ignorar o lock novo. Esses dois casos são limites de liberação: o piloto deve usar abas atualizadas e navegador com Web Locks, mantendo filas e recibos. Não foi realizado teste de suspensão real pelo sistema operacional.

## Payload vazio e confirmação sem requisição

A reprodução com o adaptador real identificou que `gravarOperacoes([])` retorna um objeto local sem executar RPC. Esse retorno não pode comprovar salvamento no servidor. O diário atual agora recusa preparação vazia antes de fixar o payload e recusa payload vazio persistido, inclusive com recibo legado, antes de envio, consulta ou confirmação de leitura. O primitivo de fixação também recusa o vazio. A falha `INTENCAO_SEM_OPERACOES` é validação do cliente, sem status HTTP nem rejeição de servidor inventados, sem repetição automática e com original preservado.

Presença, eventos locais de acesso e a projeção explicitamente conhecida `_contagensClientes` podem terminar como `dispensado` somente quando comprovadamente anteriores a payload, preparo, envio, recibo e marcas de confirmação. Não recebem recibo, `confirmadoEm` ou `lidoEm`. Mistura com edição de negócio, arquivo, projeção desconhecida ou tentativa anterior permanece preservada. A cópia de Campo continua dependendo da prova estrita de identidade, autoria, vínculo, versão e bytes; a exceção não autoriza confirmar como gravação.

A revisão independente executou 10/10 testes Node de operações vazias, intenções locais e equivalência de Campo. A frente de fila acrescentou a jornada `fila-operacoes-vazias.browser.cjs`, com IndexedDB e adaptador de gravação reais, verificando seis cenários sem fabricar recibo. O contrato legado de `gravarOperacoes([])` não foi alterado: o bloqueio está no diário atual e em sua releitura/suporte. O caminho antigo com `usarDiario=false` não recebeu essa mudança; não se deve generalizar a garantia do diário para ele.

## Contrato remoto e precisão do diagnóstico local

Os novos motivos `sessao_nao_pronta`, `processamento_local` e `edicao_ativa` ficam disponíveis no diagnóstico local sem conteúdo de formulário, nomes, credenciais ou mensagens brutas. O código `EM_ANDAMENTO` continua significando que a leitura não foi concluída; ele não comprova ausência de gravação nem a causa histórica de um caso específico.

O validador SQL remoto existente aceita uma lista fechada que não contém esses três motivos. A sanitização conserva o contrato da API e os transmite como `nao_verificado`, mantendo a discriminação precisa apenas localmente. O teste de compatibilidade em `confirmacao-retomada.test.js` executa os helpers reais da migration existente em PGlite descartável: rejeita os motivos novos sem sanitização, aceita o resultado sanitizado e verifica que o diagnóstico local original permanece preciso. Não foi alterado SQL, API ou permissão para ampliar essa lista. Discriminar os novos motivos remotamente depende de evolução futura e autorizada do contrato.

## Reanálise independente do p95 de Campo

O aumento de 9,4 ms observado na coleta inicial de 20 amostras por versão não ficou comprovado como uma regressão real desse tamanho. O endpoint antigo incluía espera de polling e UI; a igualdade da idade p95 durável também não bastava para excluir um custo menor. O estudo intermediário encontrou seis transações IndexedDB adicionais no caminho curto, motivando a conferência condicional de prazo descrita acima, mantendo Web Lock, heartbeat e CAS.

A coleta final separou a confirmação durável da transação IndexedDB e o commit real da interface do mesmo pedido, sem polling. Foram 36 rodadas, com três versões — base, PR original e correção — em seis blocos espelhados com rotações: 240 amostras e 36 aquecimentos por versão, totalizando 720 amostras medidas e 108 aquecimentos. A instrumentação da fixture foi comum às versões, somente em memória; fingerprints das fontes e fixture foram conferidos no início/fim. O coordenador também conferiu o digest dos scripts de medição após a coleta.

A revisão independente de consistência encontrou zero falhas ou tempos inválidos. Todas as amostras mantiveram 95 requisições, uma gravação, nenhuma consulta extra de recibo e nenhuma pendência residual. A contagem de transações IndexedDB observadas foi 12 na base, 18 no PR original e 12 na correção.

| Contraste | Diferença do p95 durável e intervalo estimado de 95% | Diferença do p95 da UI e intervalo estimado de 95% |
| --- | --- | --- |
| PR original menos base | +0,9 ms [−0,2; +2,1] | +0,9 ms [−0,4; +2,0] |
| Correção menos base | −0,9 ms [−1,6; −0,2] | −0,8 ms [−1,7; −0,3] |
| Correção menos PR original | −1,8 ms [−2,8; −1,2] | −1,7 ms [−2,6; −1,0] |

O contraste original/base é inconclusivo para piora do p95; não demonstra equivalência nem ausência absoluta de custo. A correção eliminou as seis transações redundantes e apresentou melhora mensurável nesta fixture; todos os seis blocos tiveram diferença durável negativa frente ao PR original. O polling pode ampliar a cauda observada, mas os dados não autorizam atribuir os 9,4 ms inteiros a uma única causa.

Os intervalos são estimativas por bootstrap de seis blocos inteiros, com um único host e atrasos de transporte artificiais. Não demonstram desempenho em produção nem substituem piloto autorizado. A otimização continua restrita ao Web Lock real; suspensão do sistema, abas antigas e ambientes sem Web Locks mantêm os limites de liberação já registrados. A suíte final e o CI devem ser conferidos no SHA exato após o push; esta revisão não executou navegadores ou testes durante a coleta e a validação final do coordenador.

[Dados finais sem polling](evidencias/otimizacao-sincronizacao-20261123/campo-confirmacao-sem-polling.json) · [Relatório da reanálise](reanalise-p95-campo-20261123.md).

## Resultados executados

- Node: `recibos-canonicos.test.js`, `estado-sincronizacao.test.js` e `fila-intencoes.test.js`: 10/10 passaram na revisão intermediária.
- Chromium: `sincronizacao-otimizacao-seguranca.browser.cjs`: 13/13 cenários passaram. A mesma jornada falha na baseline pelo reenvio após consulta inconclusiva.
- Chromium: `sincronizacao-otimizacao-calendario.browser.cjs`: 7/7 cenários passaram, incluindo duas recusas de encerramento sem prova.
- Chromium: `sincronizacao-otimizacao-arquivos.browser.cjs`: cenário de upload parcial passou.
- Baseline isolada: `documentos-comerciais.browser.cjs` passou desktop e mobile; `financeiro.browser.cjs` passou os sete perfis. Falhas numa rodada concorrente não foram reproduzidas isoladamente na baseline; a causa não foi comprovada.
- Build e regressão completa devem ser conferidos no relatório principal e no CI do SHA exato do PR.

## Limites e liberação

A jornada nova prova o processador com IndexedDB real e transporte sintético. As jornadas do hook e as suítes de regressão complementam essa prova; nenhuma delas substitui teste em aparelhos físicos com contas reais. O histórico dos eventos já gravados foi tratado como referência para não confundir `EM_ANDAMENTO` anterior à leitura com uma falha comprovada de persistência; esta revisão não atribui causa específica a esses casos.

O piloto exige autorização específica, preservação das filas e rollback do cliente. Comparar nas mesmas condições pendências reais, avisos com recibo aguardando leitura, p95 de confirmação e número de requisições. Recibo sozinho não prova que o valor continua atual: exige leitura correspondente. Perda, duplicação ou indicação falsa de salvo bloqueiam a liberação; piora de pendências reais ou latência bloqueia ampliação.

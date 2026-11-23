# Reanálise do p95 de Campo — PR #137

O aumento inicial de 9,4 ms não ficou comprovado como regressão real nessa magnitude. A medição antiga misturava conclusão, interface e polling de 10 ms, com apenas 20 operações por versão. Havia também trabalho redundante real: seis renovações de reserva IndexedDB em uma operação curta protegida por Web Lock exclusivo. A correção remove somente essas renovações desnecessárias. A coleta final mostrou melhora frente ao PR original; o contraste entre PR original e base ficou inconclusivo para o p95.

Nenhuma produção, conta real ou fila real foi acessada. Não houve merge, deploy, migration, alteração de API, permissão ou protocolo de arquivos.

## Marcos e desenho da medição

- **Início:** imediatamente antes de agendar a mesma edição sintética de Campo, após carregar os módulos. Inclui espera da fila, preparação, upload, gravação e confirmação.
- **Confirmação durável:** timestamp do próprio evento `complete` (`Event.timeStamp`) da transação IndexedDB que persiste `confirmado` para a conta, arquivo e pedido observados, com recibo do mesmo pedido e payload não vazio. É posterior à resposta de gravação e à releitura, e não significa apenas rascunho local salvo.
- **Interface:** `useLayoutEffect` do commit React em que o mesmo item, antes observado como pendente, desaparece da lista e a gravação esperada está presente. Não usa igualdade de texto de status nem polling.
- **Transporte:** fixture local, atrasos fixos de 15 ms e 80 ms na leitura alheia de mensagens, mesmo payload original e Chromium 143.0.7499.4 / Node 24.22.3. HTTP/WebSocket externo bloqueados. Não representa a latência do banco de produção.

A instrumentação é comum aos três checkouts: plugin Vite de teste altera a fixture somente em memória, antes da transformação React. O observador encaminha os `put` originais e não grava, cria recibo ou modifica a fila. Os SHA-256 de fontes e fixture permaneceram iguais no início/fim; o digest dos quatro scripts também foi conferido após a coleta. Os hashes estão no JSON final. Após a coleta, a revisão de whitespace removeu uma única linha vazia ao fim do observador, sem mudar a função; o JSON conserva o digest coletado e registra separadamente o digest final.

Versões: base `1205203`, PR original `a44e718` e correção desta branch, identificada por `sourceDigests.pr`. Foram planejadas e concluídas 36 rodadas: seis blocos espelhados de seis rodadas, com rotação da ordem das três versões. Cada rodada usa contexto novo, três aquecimentos e 20 operações medidas. Total: 240 medidas + 36 aquecimentos por versão (720 + 108). Não houve exclusão de falhas ou parada antecipada por resultado favorável; todas as operações passaram nas verificações de identidade e conclusão.

## Resultado final sem polling

Valores em ms; percentil pela posição `ceil(n × p)` na amostra ordenada, sem interpolação.

| Versão | p50 durável | p95 durável | p50 UI | p95 UI | Transações IDB/operação |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base | 585,4 | 591,1 | 587,1 | 593,0 | 12 |
| PR original | 587,5 | 592,0 | 589,4 | 593,9 | 18 |
| Correção | 585,1 | 590,2 | 587,0 | 592,2 | 12 |

A contagem IDB cobre as transações observadas até concluir os dois marcos, incluindo leituras locais; não conta gravações no servidor. Em **todas** as amostras: 95 requisições HTTP, uma gravação, zero consultas extras de recibo e zero pendências residuais. Nenhuma interface confirmou antes do marco durável. Não houve erro, tempo inválido ou amostra censurada.

Cada contraste conserva seis blocos espelhados ABBA/BAAB. Intervalos estimados de 95% por bootstrap de **blocos inteiros**, 5.000 reamostragens, semente fixa `20261123`. Operações e pares próximos não são tratados como repetições independentes.

| Contraste | Diferença p95 durável [intervalo 95%] | Diferença p95 UI [intervalo 95%] |
| --- | --- | --- |
| PR original − base | +0,9 [−0,2; +2,1] | +0,9 [−0,4; +2,0] |
| Correção − base | −0,9 [−1,6; −0,2] | −0,8 [−1,7; −0,3] |
| Correção − PR original | −1,8 [−2,8; −1,2] | −1,7 [−2,6; −1,0] |

Todos os seis blocos tiveram diferença durável negativa na correção frente ao PR original. O intervalo original/base inclui zero: não demonstra piora do p95, equivalência ou ausência absoluta de custo. A melhora da correção foi mensurável nesta fixture; não autoriza extrapolação para produção.

## O que a medição antiga conseguia dizer

A coleta histórica de 20 operações por versão observou 591,5 → 600,9 ms, mas aguardava um intervalo de polling de 10 ms. Seu campo chamado `readbackMs` incluía processamento local e espera da interface após a resposta, além da releitura. Ele não isolava tempo remoto.

O estudo exploratório intermediário, com 240 operações por versão em 16 rodadas contrabalanceadas, observou +1,5 ms no p95 durável e aproximadamente +10 ms no marco com polling. Isso demonstra que o polling pode ampliar a diferença aparente na cauda, sem provar que explica os 9,4 ms inteiros da coleta histórica. Esse estudo usava o instante do listener de transação e reconhecimento da UI anterior ao marcador real de commit, sem hashes automáticos de fontes; foi preservado com essas limitações e não sustenta sozinho a conclusão final.

O medidor geral agora distingue tempo da resposta remota, trecho local posterior, confirmação durável e interface para Campo. O polling permanece disponível apenas como medida legada separada; a coleta final acima foi executada com `--no-poll`.

## Correção e proteções

Em `src/fila-intencoes.js`, o caminho curto dispensa uma renovação somente sob o Web Lock **real**, exclusivo, com o nome esperado e prazo conhecido com folga maior que um terço do lease. Usa o mesmo relógio injetado da fila, exigindo observação finita e sem retrocesso. Prazo desconhecido, próximo ou vencido exige renovação; após renovar, a nova observação só é aceita com o mesmo dono/token.

O heartbeat continua forçado, serial e drenado antes de liberar o lock. Conferências de sessão permanecem antes/depois dos callbacks; mutações duráveis continuam validando dono, token e expiração transacionalmente. Sem Web Locks ou com trava de teste/injetada, mantém as seis renovações anteriores. Nada foi retirado da consulta de recibo, envio, releitura, validação de versão ou preservação de original. O caminho normal não ganha consulta remota extra.

## Validação e reprodução

- `npm run build`: 1.476/1.476 testes, zero falhas e build Vite aprovado; permanece o aviso existente de bundle acima de 2 MB.
- `npm run test:browser`: 96/96 jornadas aprovadas, com rede externa bloqueada.
- Testes novos cobrem relógio/prazo, Web Lock real e fallback, renovação forçada, reserva roubada durante callbacks, contenção e limpeza de timers; observador recusa outro item e transação abortada; instrumentação passa pelo Vite/React sem alterar a fixture; estatística testa efeito conhecido, variabilidade entre blocos e recusa de falhas/censura.
- Teste de instrumentação repetido isoladamente após separar seu cache temporário: 1/1 aprovado. `git diff --check` aprovado. Não há scripts separados de lint ou tipos no package.json.

Com dependências instaladas e Chromium do Playwright disponível, usar cópias isoladas da aplicação nas três versões:

```sh
node scripts/medir-campo-p95.mjs BASE_APP CORRECAO_APP /tmp/campo.json ORIGINAL_APP --no-poll
```

Os parâmetros, ordem completa, aquecimentos, amostras, hashes e análises estão nos [dados finais](evidencias/otimizacao-sincronizacao-20261123/campo-confirmacao-sem-polling.json). O [estudo exploratório com polling](evidencias/otimizacao-sincronizacao-20261123/campo-exploratorio-polling.json) e a [coleta histórica](otimizacao-sincronizacao-20261123.md) permanecem disponíveis, sem misturar seus endpoints. A [revisão independente](qa-otimizacao-sincronizacao-20261123.md) registra a conferência de segurança e consistência. O CI do commit publicado deve ser conferido no PR.

## Limites e piloto reversível

Um host, transporte sintético e seis blocos dão intervalos estimados, não garantia de desempenho em todos os aparelhos/cargas. Não foi definida margem arbitrária de equivalência. Abas antigas, suspensão real do sistema e navegadores sem Web Locks mantêm os limites já registrados no PR. Não houve recuperação granular nova de fotos nem validação em aparelho físico ou filas reais.

Piloto posterior depende de autorização específica. Usar todas as abas atualizadas e comparar, nas mesmas condições, p95, requisições, pendências reais, idade da fila e avisos comprovadamente falsos. Piora de pendências ou latência impede ampliação; perda, duplicação ou “Salvo” sem prova bloqueia liberação. Rollback do cliente preserva IndexedDB, originais, pedidos e recibos, sem reescrever banco ou filas.

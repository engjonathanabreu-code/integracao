# Otimização incremental da sincronização — 23/11/2026

## Escopo e divisão

Branch `codex/otimizar-sincronizacao-confirmacao`, criada de `origin/main` em `1205203`. Coordenador/diagnóstico: mapeamento, medidor sintético, escopo de leitura do Calendário e integração; agente de fila: `fila-intencoes.js`/`diario-compartilhado.js`; agente de confirmação: hook, estados e diagnósticos; QA independente: testes de segurança/Calendário e relatório próprio. Os arquivos de implementação foram separados entre as frentes. Não há alteração SQL, migration, RLS, contrato de API ou estrutura visual.

Nenhuma conta, fila ou dado de produção foi consultado ou modificado. Os casos de eventos já gravados com retorno EM_ANDAMENTO anterior à leitura são uma referência fornecida pelo solicitante; não foram reproduzidos nos aparelhos afetados e não recebem uma causa presumida neste relatório.

## Caminho entre Salvar e confirmação

1. `mutateConfirmed` captura a intenção e uma identidade de auditoria; `mutate` mantém o estado visível e persiste o original no diário IndexedDB. A fila e a captura de arquivos se serializam localmente. O debounce existente é de 250 ms.
2. `flushDiario` aguarda sessão/base e o processamento local. `reservar` seleciona somente uma unidade/dependências elegíveis e cria uma reserva transacional por conta/pedido. A ordem no registro, IDs criados, vínculos e arquivos continuam sendo dependências reais; ignorar um item já tentado não remove suas dependências.
3. Preparação relê a base autorizada, projeta os registros, faz comparação de três versões e congela o payload. A leitura passa pelo contrato de atribuições, por tabelas/RPCs autorizados e pelo diretório. Arquivos selecionados usam Storage por hash, versão e vínculo; o protocolo atual continua inteiro.
4. O envio usa `integracao_gravar` com o mesmo `pedido` e payload. Resultado perdido não cria pedido novo: `integracao_consultar_pedido` é consultado primeiro. Somente JSON `null` explícito representa ausência verificada. Erro ou resposta inconclusiva preserva o pedido.
5. Recibo e releitura dos efeitos enviados antecedem a confirmação exibida ao usuário. A preparação não é reutilizada como prova de gravação. Recibos já persistidos precisam de reconsulta autenticada e igualdade integral antes de nova leitura poder encerrar o item. Esse passo não é acrescentado ao envio normal da mesma passagem.

O medidor registra espera, preparação, upload, gravação, releitura, idade até confirmação, p50/p95, chamadas, pendências e avisos conhecidos das fixtures. As etapas têm percentis separados; somar seus p95 não equivale ao p95 do total.

## Causas reproduzidas e correções

- **Passagem monopolizada:** com relógio sintético avançando durante a atualização da fila, um preparo com falha voltava a ficar elegível dentro da mesma passagem. Antes: `[bloqueada, bloqueada]`, nenhum envio independente; depois: `[bloqueada, independente]`, independente confirmado. Cada pedido recebe no máximo uma tentativa por passagem, preservando dependentes.
- **Ausência confundida com resultado inconclusivo:** `undefined` podia autorizar reenvio. Antes/depois em oito oportunidades: cinco envios → um; as consultas continuam limitadas e o original fica preservado.
- **P0001 sem status:** classificado como transitório. Agora exige revisão, sem atribuir regra/campo e sem repetir a escrita automaticamente. A classificação não transforma uma resposta desconhecida em recusa comprovada.
- **Payload vazio e confirmação sem RPC:** a reprodução na base confirmou uma edição de negócio com `payload:[]`, recibo criado localmente e zero chamadas de rede pelo adaptador. O diário agora impede essa preparação/payload antes de enviar, registrar recibo ou confirmar. O erro é uma validação do cliente sem status HTTP inventado e sem repetição automática; o original permanece para revisão. Históricos estritamente de presença/acesso/projeção `_contagensClientes`, comprovadamente anteriores a preparo/envio, podem terminar como dispensados locais, sem recibo nem marca de confirmação. O contrato legado de `gravarOperacoes([])` não foi alterado; a proteção está no diário atual e em sua releitura/suporte.
- **Recibo apenas local:** podia bastar para avançar até a baixa. Agora a RPC da mesma conta verifica autoria/pedido/resumo do payload e devolve o recibo, que deve ser integralmente igual. Ausência ou divergência não baixa nem reenvia o item.
- **Releitura antiga temporária esgotada:** uma retomada adicional e durável pode ocorrer após sessão/processamento/edição serem liberados. É somente leitura; não reabre conflito, permissão, validação ou leitura divergente. O marcador não é zerado por foco/reconexão.
- **Diagnóstico insuficiente:** `EM_ANDAMENTO` anterior a qualquer consulta podia significar sessão/base não pronta, edição ativa ou processamento local. Esses motivos agora são enumerados no diagnóstico local, mantendo também reserva de outra aba e dependência da fila. O contrato remoto atual não aceita os três novos motivos: a sanitização os transmite como `nao_verificado`, preservando a API e sem fingir outra causa. Um teste executa o validador SQL existente em PGlite para comprovar essa compatibilidade. A discriminação adicional remota depende de uma evolução futura autorizada do contrato. Não são gravados valores de formulário, mensagens brutas ou credenciais.
- **Reserva expirada durante operação longa:** o lease fixo de 60 segundos não cobria todos os uploads/preparos. Agora o consumidor usa Web Lock por conta/pedido, renova o mesmo token transacionalmente antes/depois de callbacks e por heartbeat, e drena o heartbeat ao encerrar. Contenção não executa callbacks nem aumenta tentativas; permite selecionar um independente. Perda da reserva não confirma o item antigo. Sem Web Locks, ou com abas antigas que não participam do bloqueio, permanece o protocolo de lease com renovação e CAS; não há garantia estrita durante suspensão. Esses ambientes bloqueiam ampliação do piloto até validação específica.
- **Leitura ampla de Calendário:** preparação e confirmação buscavam grupos alheios à operação. Intenções compostas somente por eventos/agendas/auditoria agora relêem Calendário, usuários/contrato e auxiliares. Operações mistas ou desconhecidas mantêm a leitura completa. O processamento por aba continua sequencial: não foi introduzido paralelismo na projeção/cache compartilhada nem timeout que abandone um upload em voo. A correção permite avançar após falha/bloqueio, e outro consumidor pode selecionar um independente durante uma operação longa. Eventos continuam vindo da RPC autorizada; respostas, agenda, complemento e arquivos continuam atuais. A evidência de confirmação não mudou.

## Medição sintética

Execução sequencial no mesmo host, sem outras suítes concorrentes: 20 operações por fluxo em cada versão (120 operações ao todo), mesmas fixtures, Node v24.22.3, Chromium 143.0.7499.4. Cada chamada de transporte recebe atraso sintético de 15 ms; a leitura alheia de mensagens recebe 80 ms. O medidor bloqueia rede externa e recusa uma amostra normal com escrita duplicada, consulta extra de recibo ou pendência residual.

| Fluxo | p50 base → branch (ms) | p95 base → branch (ms) | Chamadas por operação | Idade p95 até baixa durável (ms) |
| --- | ---: | ---: | ---: | ---: |
| Metas | 384.8 → 382.7 | 394.9 → 390.3 | 37 → 37 | 393 → 389 |
| Calendário | 542.5 → 380.9 | 546.1 → 389.4 | 94 → 24 | 546 → 389 |
| Campo offline | 591.2 → 591.4 | 591.5 → 600.9 | 95 → 95 | 586 → 586 |

| Fluxo | Espera p95 | Preparação p95 | Upload p95 | Gravação p95 | Releitura p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Metas | 261.7 → 260.5 | 59.6 → 58.1 | 0 → 0 | 17.5 → 17 | 57.5 → 56 |
| Calendário | 260.6 → 261.3 | 136.5 → 55.9 | 0 → 0 | 17.2 → 17 | 134.8 → 55.1 |
| Campo offline | 260.2 → 260.2 | 159.3 → 160.2 | 17.2 → 17.1 | 17.8 → 17.5 | 145 → 153.1 |

Calendário: redução de 74.5% nas chamadas e 28.7% no p95 total dessa fixture. Metas manteve 37 chamadas. Campo manteve 95 chamadas e a idade p95 durável de 586 ms; seu p95 total observado aumentou 9,4 ms (591,5 → 600,9), com mediana praticamente igual. A coleta de conclusão de Campo usa polling de 10 ms, mas isso não comprova a causa da variação. Não foi demonstrado ganho de latência em Campo, e uma piora reproduzida no piloto impede ampliação.

Nas duas versões, as 60 operações normais de cada rodada terminaram com uma única gravação por pedido, zero consultas extras de recibo, zero pendências residuais e zero avisos falsos conhecidos das fixtures. Esse resultado não estima pendências ou avisos falsos em produção. A renovação da reserva acrescenta transações locais de IndexedDB; não acrescenta uma consulta HTTP de confirmação ao caminho normal.

[Dados brutos da base](evidencias/otimizacao-sincronizacao-20261123/base-1205203.json) · [Dados brutos da branch](evidencias/otimizacao-sincronizacao-20261123/branch.json).

Reprodução: instalar as dependências fixadas e o Chromium da versão Playwright do lockfile; extrair `1205203:integracao-vercel` em uma pasta isolada, sem `.env`, e fornecer o caminho dela ao mesmo medidor. Executar primeiro a base e depois a branch, sem outras suítes concorrentes.

```sh
node scripts/medir-sincronizacao.mjs /caminho/base-isolada test-results/base.json
node scripts/medir-sincronizacao.mjs . test-results/branch.json
```

Não há medição de banco ou rede de produção neste trabalho. O atraso artificial de uma leitura alheia demonstra o bloqueio da leitura ampla; não comprova a origem dos 10 segundos relatados. O debounce de 250 ms não foi alterado sem evidência adicional. Metas já tinha leitura por grupos; Campo conserva leitura completa porque não foi demonstrado um recorte seguro do pacote.

Próxima hipótese mensurável: para cargas maiores de Metas/Calendário, filtrar a confirmação pelas chaves do payload e aliases do mesmo recibo, incluindo filhos, vínculos, remoções e arquivos. Este PR reduz grupos de Calendário; não afirma ter implementado confirmação por registro. O filtro deve ter equivalência demonstrada com a leitura atual e manter o retorno completo para ações/módulos ainda não mapeados.

## Arquivos e recuperação parcial

Não se substitui o pacote de Campo para destravar um item. Permanecem as verificações existentes de versão, hash/bytes, autoria, vínculo e ponteiro atual. O teste novo de upload parcial comprova primeiro objeto aceito, segundo upload recusado temporariamente, nenhuma gravação de metadados incompleta e preservação de bytes, versões, checksum e pacote. Um independente avança. Na retomada são repetidos os mesmos POSTs imutáveis por hash, com `x-upsert:false` e tratamento de Duplicate; não existe comprovante parcial durável para pular objetos com segurança. Os testes existentes cobrem original preservado e versão posterior; a retomada granular de conteúdo dentro de um pacote não é introduzida, pois o protocolo não permite demonstrar confirmação independente de cada fragmento. Um objeto já enviado pode continuar existindo no Storage enquanto o vínculo fica pendente; isso não é “salvo” nem autoriza consumir a cópia local.

## Verificações

- Base `1205203`: `npm test` passou 1.458/1.458 testes antes das alterações.
- Fontes finais: `npm run build` passou 1.470/1.470 testes e gerou o build Vite. Mantém o aviso existente de bundle acima de 2 MB; não houve nova dependência.
- Fontes finais: `npm run test:browser` passou 94/94 jornadas com HTTP/WebSocket externo bloqueado. Inclui Metas, Calendário, Campo, upload parcial, guard de payload vazio, lease longo, duas abas, resposta perdida, validação, conflito, permissão, edição ativa, reload e contratos existentes.
- `node scripts/medir-sincronizacao.mjs`: 120 operações sintéticas na comparação base/branch, com dados brutos anexados e uma única gravação por pedido em todas as amostras normais.
- `git diff --check` passou. Não há scripts separados de lint ou verificação de tipos declarados no package.json.
- O estado de CI deve ser conferido no SHA exato do PR. Os resultados locais não substituem o piloto autorizado em aparelhos reais.

Relatório independente: [QA](qa-otimizacao-sincronizacao-20261123.md). O navegador de testes bloqueia HTTP/WebSocket externo. PGlite executa SQL existente contra fixtures locais. Aparelhos físicos, Safari/iOS, contas reais e as filas antigas reais não foram validados.

## Piloto reversível — exige autorização posterior

1. Registrar commit/deployment estável anterior e exportar uma cópia preservada da fila no dispositivo autorizado. Não limpar IndexedDB/localStorage nem restaurar snapshot antigo por cima do servidor.
2. Usar uma conta/dispositivo acordado e todas as abas na mesma versão. Validar primeiro sessão, permissão e o suporte à coordenação entre abas. Navegadores sem a garantia de exclusão ficam fora da liberação até validação específica.
3. Comparar janelas equivalentes de uso: total de pedidos, confirmados, pendências reais, pedidos com recibo/releitura pendente, idade máxima/p95 da fila, p50/p95 até confirmação e chamadas por operação/total. Exibir também a quantidade ainda sem confirmação para não esconder tentativas lentas no percentil dos concluídos. “Aviso falso” só é contado quando o mesmo pedido e efeito atual já foram comprovados; recibo sozinho não basta.
4. Não ampliar se pendências reais ou latência piorarem. Qualquer perda, duplicação ou “Salvo” sem prova bloqueia liberação. Interromper o piloto e preservar originais/recibos/evidências para revisão.
5. Rollback do cliente para o commit/deployment anterior, sem reescrever banco ou fila. Campos de diagnóstico/marcadores são aditivos e a versão IndexedDB não muda. Pedidos já gravados continuam com suas identidades e recibos; nunca reenviar com outra identidade para simular recuperação.

## PR sem publicação

O workflow existente faz build e navegador isolado, sem deploy ou credenciais de produção. `git.deploymentEnabled` está `false` somente para esta branch nos dois `vercel.json`; a configuração de `main` não muda. Referência: [configuração Git da Vercel](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). Não fazer merge, deploy, migration ou ação em filas reais sem autorização específica.

# Confirmação de mutações

`useDadosCompartilhados().mutateConfirmed(fn, entrada)` conserva a fila e as retentativas de `mutate`, mas retorna uma Promise. A função de edição executa uma vez; a Promise resolve somente depois do recibo da gravação e da leitura de retorno, quando os campos alterados conferem. O método original `mutate` permanece síncrono.

A entrada recebe ID se não o tiver. Esse ID associa a espera ao lote que efetivamente incluiu a edição. Uma segunda edição durante um envio não recebe a confirmação do primeiro lote. A conferência usa IDs de registros e unidades, considera aliases devolvidos pelo servidor e não exige que a ordenação das listas permaneça igual.

Offline antes da operação, a função de edição não é aplicada. Falhas após a edição rejeitam a Promise sem apagar o rascunho ou a tentativa persistida pelo mecanismo existente. O limite de espera é 45 segundos; ele não cancela nem duplica a gravação. Nenhum sucesso é exibido apenas por alteração otimista.

## Adaptadores de campo (C4)

`igualSemantico` continua estrita. As exceções ficam em `adaptadoresCampo` (`src/igualdade-semantica.js`), por coleção e caminho relativo ao registro (`*` = item de lista por id), e `igualCampo(colecao, caminho, a, b)` as aplica na confirmação (`confirmacao-mutacoes.js`) e na conciliação de três versões (`concorrencia.js`, que faz merge de conjunto nas listas registradas). Tipos: `conjunto` (lista de ids sem ordem; membro faltante ou extra continua divergente), `nulo_vazio`, `numero` e `gerado_servidor` (ignorado na confirmação). Cada entrada traz o motivo no código; campos financeiros não têm adaptador. Novas entradas exigem prova de que o encoder, o SQL ou a projeção devolvem a mesma intenção em outra forma, além de teste em `tests/sync-a4-adaptadores.test.js`.

## Repetir uma tentativa

Uma rejeição posterior à edição contém `erro.retentarConfirmacao()`. O editor deve guardar esse callback enquanto o conteúdo da intenção original não mudar e usá-lo no botão de tentar novamente. O callback retoma a confirmação da fila original; não executa a função de edição novamente sobre o próprio estado otimista. Se o envio já tiver concluído em segundo plano, retorna a confirmação guardada.

Alterar o conteúdo cria uma nova intenção: limpe o callback anterior e faça novo `mutateConfirmed`. Uma divergência que exige revisão, uma sessão diferente ou uma tentativa expirada retorna erro compreensível. Confirmações antigas são limitadas às últimas 32 intenções sem remover esperas em andamento; o conteúdo do delta é liberado após sucesso.

## Testes isolados

- `confirmacao-mutacoes.test.js`: precisão, geometrias com anéis, identificação por ID, aliases, exclusão, deltas imutáveis, lotes distintos, leitura divergente, timeout e retomada.
- `confirmacao-hook.test.js`: hook React real e transporte fictício bloqueando serviços externos; sucesso, duas edições durante envio, 403, conflito, falha de leitura após gravação, resposta perdida, logout e offline. Retentativas comprovam uma única execução da edição e um único write.
- Regressão `recuperacao-ciclo.test.js`: 14 cenários existentes de sincronização, incluindo metas, chat, calendário, concorrência e recibos perdidos.

Nenhuma validação deste conjunto escreve em produção.

### Retomada de cadastro após falha de transporte

Em Clientes, **Confirmar mesmo pedido** pode rearmar uma tentativa explícita quando a fila deixou de tentar aquele cadastro por falhas recorrentes de transporte. Isso é diferente de passar por cima do intervalo normal de espera. O clique identifica a entrada de auditoria do mesmo pedido local, não cria outro pedido e não altera a versão preservada nem o contador de tentativas. Se já houve envio, a fila consulta seu recibo antes de tentar qualquer gravação; com recibo, resta apenas a leitura. Conflitos, permissões, validações, outro pedido e reservas em atividade continuam intocados.

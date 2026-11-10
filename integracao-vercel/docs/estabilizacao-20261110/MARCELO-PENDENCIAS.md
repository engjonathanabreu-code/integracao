# Pendências exibidas na conta de Marcelo

A imagem recebida mostra um item de processos bloqueado por validação/permissão, sete itens de usuários ainda não enviados e quatro reservas conflitantes preservadas. A imagem não contém o pedido completo nem o erro específico: não comprova perda, causa da recusa ou composição dos sete itens.

Reproduzido no código: o heartbeat de dois minutos usa mutate e o diário incluía online/ultimaAtividade, embora prepararEdicao exclua esses campos. Uma intenção anterior com recurso de usuários pode impedir essas entradas de avançar. A correção anterior da confirmação não impedia a entrada/dependência na fila.

Correção: extrairIntencao exclui somente alterações de presença em usuários existentes e eventos locais de acesso já excluídos do contrato de gravação. Mudanças de nome, perfil, permissões, temas, criação/exclusão ou dados de negócio continuam entrando normalmente. A fila marca como dispensadas somente entradas pendente_local, tentativas zero, sem payload, recibo, legado, arquivo ou lease ativo, cujas edições são exclusivamente locais. A decisão fica registrada e original/checksum são preservados. Nenhum pedido enviado ou resultado desconhecido é dispensado; nenhum dado de servidor é alterado.

A recusa de processos não é resolvida automaticamente nem reinterpretada como permissão concedida. Foi solicitado o detalhe da revisão do item. Logs PostgreSQL entre 17:00 e 18:00 UTC mostram às 17:49:25 uma recusa de integracao_moradores por identidade já criada com outro conteúdo; sem correlação com o pedido da imagem, não pode ser atribuída a Marcelo. Outras ocorrências financeiras da janela ficam fora desta investigação.

Validação: 11 testes Node focados passaram; suíte de build com 1.168 testes e zero falhas, Vite 4,79 s. Navegador com duas abas/IndexedDB real: 14 cenários passaram, incluindo dispensa do sinal dependente de um item bloqueado, preservação do bloqueio, original, checksum e isolamento de conta. Nenhum teste usou dados reais ou enviou mensagens.

Sem migration, nova dependência ou alteração de RLS. Risco principal: classificar indevidamente uma edição como local; os testes cobrem explicitamente a preservação de mudanças de perfil, negócio, arquivos, tentativas enviadas e registros criados/excluídos. Rollback: retornar o aplicativo ao commit 5108071; originais continuam disponíveis na exportação da fila.

## Segunda imagem e causa adicional reproduzida

A segunda imagem identificou o processo e o prefixo do pedido. Leitura de produção confirmou que o complemento de morador e o documento indicado existem; consulta read-only com papel authenticated e claims de Marcelo confirmou visibilidade do cliente e do complemento. Não há recibo do prefixo de pedido exibido para essa conta. Isso não concede autorização para sobrescrever o conteúdo local ou remoto.

Um teste novo reproduziu a revisão incorreta antes da correção: rascunho antigo sem `_compartilhado` e insert recusado, com alteração independente no servidor. A prévia retornava checks vazios, em vez do valor remoto. O diário usava clientesComEdicao, que depende desse marcador, e por isso podia deixar de reler a ficha explícita da intenção. Agora cada intenção de processos determina os IDs a reler, independentemente do marcador, antes da preparação, prévia, decisão e confirmação. Resultados vazios não são substituídos pelo registro em cache: geram conflito de ausência para registros antes existentes.

Teste de navegador após a correção: revisão busca os dados atuais, aplica somente a alteração local, mantém o campo independente do servidor, não duplica o morador e encerra a fila com uma gravação. Casos de ficha ausente ou mesmo campo alterado no servidor exigem revisão e fazem zero gravações. Os 12 cenários do diário integrado também passaram, incluindo oito sinais consecutivos de atividade sem crescimento da fila nem novos envios.

Limite: os rascunhos estão no navegador de Marcelo, não no servidor. Não foram baixados ou alterados remotamente. A intenção de processo já bloqueada deve ser revisada/retomada uma vez após atualizar a aplicação; não se afirma que o conteúdo local já foi recuperado. Quatro reservas preservadas na imagem permanecem para decisão sobre datas e conflitos; nenhuma reserva confirmada foi removida.

A primeira execução da suíte completa após acrescentar o teste de releitura falhou por um erro de sintaxe nesse teste (chave de objeto ausente), antes de qualquer publicação. Corrigido; os oito testes de sincronizacao-clientes passaram. A suíte completa foi reiniciada para validar a versão final.

Validação final: 1.169 testes passaram, zero falhas; build Vite concluído em 4,45 s. Sem scripts de lint/typecheck dedicados; avisos de bundle/importação existentes permanecem. Servidor local de testes encerrado. Publicação usa a branch codex/estabilizacao-20261110 e push não forçado para main, após verificar que o remoto continua em 5108071. Nenhuma PR foi aberta.

# Retomada verificável da sincronização

- O corte de notificações na lista local não cria operações de exclusão na fila nova. Uma notificação enviada com conteúdo diferente continua em revisão.
- Para uma confirmação antiga que contém apenas inserções de notificações, a releitura pode excluir do cálculo as remoções locais não enviadas. O recibo original e a linha canônica com autoria e campos exatos continuam obrigatórios; não há reenvio das notificações nessa reconciliação. Para um recibo tipado, a exceção exige uma única inserção e um único corte de notificação compartilhada reconhecível no original, a mesma identidade e versão da linha na releitura e uma nova consulta que devolva o recibo integralmente igual.
- Uma cópia privada de Campo só pode ser dispensada antes do envio com identidade, autoria, metadados e bytes iguais. O ponteiro atual é relido depois da leitura do objeto. Se houver dependentes ou dúvida, o original permanece. A confirmação não inventa recibo, não substitui o servidor e não apaga a cópia persistida de outra aba.
- Uma preparação de cadastro comprovadamente anterior a qualquer envio tem retentativa limitada e pode ganhar uma nova tentativa automática após reconectar. A tela continua indicando que o envio não foi confirmado.
- Uma gravação real continua exigindo recibo e leitura de confirmação. Nenhuma permissão ou política de banco muda.

A ativação é incremental, sem migration. Para reverter, reverter o commit da aplicação ou promover o deploy estável anterior. Todos os originais e decisões permanecem exportáveis; não se restaura uma fila antiga por cima de dados já gravados.

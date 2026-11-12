# Exportação de recuperação e confirmação de eventos — 12/11/2026

Base: c5a52bf. Correção do cliente; não modifica schema, RLS, payloads históricos, recibos ou dados de negócio.

## Defeitos reproduzidos

1. `reopen` gravava uma cópia extra em armazenamento local antes de iniciar o download. Uma `QuotaExceededError` nessa gravação impedia o arquivo de recuperação de ser baixado. A reprodução com o hook/aplicação reais falhou por ausência de download antes da correção.
2. O formulário de evento único contém horários locais e `recorrenciaAte: ''`. O ERP devolve horários canônicos e não projeta esse campo vazio. O contrato de confirmação rejeitava a leitura semanticamente equivalente. A reprodução usa o objeto do formulário, `prepararEdicao` e `projetar` reais, com alias do pedido.

## Correções

A recuperação captura estado e bytes da fila auxiliar antes de aguardar IndexedDB, verifica a conta/geração, inicia o download e tenta a cópia interna como etapa adicional. A falha do backup interno informa que ele não foi atualizado e pede conferência do download. A fila continua intacta. O botão permanece disponível durante envios; não remove intenções nem declara gravação remota bem-sucedida. Um erro de leitura do próprio diário ainda precisa ser tratado antes de se afirmar que a cópia está completa.

A confirmação de evento novo aceita os horários somente quando o horário local, o payload enviado para aquele ID/alias e o horário remoto representam exatamente o mesmo instante. O campo vazio de fim de recorrência é ignorado somente para um pedido explicitamente sem recorrência e sem fim solicitado. Um identificador de série gerado pelo ERP não significa, sozinho, recorrência solicitada. Pedidos recorrentes, datas não vazias, cor, agenda, participantes, autoria, título, descrição, visibilidade e status continuam sujeitos à comparação. Não há reenvio nem mudança de identidade para eliminar um aviso.

A cor padrão inicial do formulário (`#0F5F5B`) não é transmitida na criação: o ERP a atribui por `md5(serie_id)`. A confirmação aceita a cor canônica apenas nesse caso de valor padrão e ausência de operação de cor. Uma cor personalizada ou uma alteração explícita de cor continua exigindo correspondência; nenhuma permissão de alteração de cor é ampliada.

Clientes antigos podiam guardar uma tentativa com `operations: []`, `sent: {}` e somente presença local diferente. Sua migração tentava criar uma intenção inválida, deixando ao mesmo tempo um aviso de legado e um fantasma volátil de arquivos. A migração agora classifica como `sem_operacoes_de_negocio` somente uma tentativa sem operações, arquivos, recibo ou delta editável. O texto original, checksum e identificação da tentativa permanecem no IndexedDB com classificação auditável. Uma edição posterior continua sendo enfileirada normalmente; edição real sem operação, arquivo pendente, recibo ou identidade reutilizada permanecem para revisão. Nenhuma fila é limpa.

A orientação de rascunho antigo informa análise/exportação, em vez de sugerir uma retentativa temporária.

## Verificação

- Testes de confirmação com projeção/encoder reais, negativos de horário e dados de negócio, pedido ausente/errado e recorrência.
- Testes de exportação com quota, cópia interna, falha do download e troca de sessão.
- Navegador com aplicação/IndexedDB reais: quota no backup extra permite download completo; original e estado da fila permanecem idênticos; nenhum cadastro recusado é reenviado.
- Regressões de revisão de leitura e recuperação por F5 continuam passando.
- O teste de exportação falhou antes da alteração e passou depois. A reprodução de calendário também falhou antes e passou depois.

## Limites e operação

A telemetria contém contagens, não os bytes ou pedidos particulares de cada navegador. Recibo confirma uma transação; não prova que a leitura atual ainda coincide com todos os valores locais. A conferência de um rascunho real e o reconhecimento de valores divergentes exigem a cópia atual e uma decisão sobre seus dados. Os testes não comprovam recuperação de dispositivos reais.

Antes de recarregar um aparelho com itens não persistidos, concluir e conferir a exportação no próprio aparelho. Não limpar IndexedDB ou localStorage. Para reversão do cliente, preservar filas, originais e recibos; a base c5a52bf continua disponível, mas volta a ter a limitação de download sob quota. Não restaurar snapshots completos nem reaplicar lotes para remover avisos.

A simulação com uma exportação real foi feita somente em processo local, sem transporte de rede e sem importar snapshots para o banco. A comparação foi repetida com o código anterior para comprovar o defeito. Os dados reais e suas evidências ficam fora do repositório público. A confirmação no aparelho ainda exige observar o estado da fila após a atualização; testes ou simulação não equivalem a esse resultado operacional.

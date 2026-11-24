# Avisos e releitura das pendências

Causas verificadas na versão anterior:

- O mesmo diário alimentava o aviso global (com instrução de abrir Pendências) e o painel de Pendências. Uma prévia antiga mantinha o painel na tela mesmo após o item ser confirmado. Agora a fila tem um único indicador discreto. Avisos críticos de armazenamento, sessão, operação ou exportação não são suprimidos; pendências reais continuam consultáveis. O painel não abre sozinho, e a prévia deixa de ser exibida quando o pedido encerra.
- A notificação entre abas disparava uma atualização isolada que podia ser ignorada quando a aba estivesse ocupada. A notificação usa a fila de atualizações agrupadas já existente, sem sobrescrever o timer do diário.
- As releituras de um recibo esgotadas por divergência ficavam sem uma nova oportunidade depois que o servidor ou o código mudavam. Agora o diário agenda uma única releitura nova dos pedidos elegíveis, sem cache HTTP, preservando o recibo, a solicitação e a ordem. O servidor autentica o recibo original e os valores são comparados; se ainda divergirem, continuam pendentes. Essa regra não reenvia uma gravação e não vale para conflito ou validação sem recibo.

O painel não altera dados dos usuários nem identifica a causa exata de códigos agregados P0001/23514/TRANSPORTE sem o pedido e a fase correspondentes. Não cria recibos, não dispensa anexos e não arquiva divergências reais. Não há migration. A validação cobre ambiente isolado; para verificar uma baixa real, é necessário o relato posterior do mesmo aparelho com a nova versão. Rollback: restaurar o deploy anterior, mantendo a fila e seus originais.

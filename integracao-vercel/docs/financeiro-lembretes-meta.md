# Lembrete de vencimento

WhatsApp solicitado: **+55 47 3310-0137**.

Nome do template: `integral_lembrete_vencimento`
Categoria: Utilidade (UTILITY)
Idioma: Português (Brasil), `pt_BR`

Texto para cadastrar no Meta Business:

> Olá, {{1}}. A Integral lembra que sua parcela vence em {{2}}, no valor de {{3}}.
>
> Código para pagamento: {{4}}
>
> Se já realizou o pagamento, desconsidere esta mensagem. Para dúvidas, responda por aqui.

Variáveis: 1 nome do cliente; 2 vencimento (dd/mm/aaaa); 3 valor em reais; 4 linha digitável completa.

O envio está **desativado** até aprovação do template e configuração da caixa. O agendamento é diário, às 09h de Brasília, para parcelas que vencem no dia seguinte. Somente contatos com identidade confirmada no CRM e conversa na caixa do número informado podem receber. Parcelas pagas, canceladas e códigos inválidos são excluídos do envio. Pagamentos parciais precisam de conferência financeira.

## Ativação pela administração do sistema

Configurar no ambiente de produção, sem colocar segredos no código:

- `CRON_SECRET`: segredo do agendamento Vercel.
- `CRM_INTEGRACAO_SUPABASE_URL` e `CRM_INTEGRACAO_SERVICE_ROLE_KEY`: conexão de serviço existente do CRM.
- `CHATWOOT_INTEGRACAO_API_TOKEN`: credencial de aplicação com acesso à conta 1.
- `FINANCEIRO_CHATWOOT_INBOX_ID`: caixa WhatsApp cujo número é +554733100137.
- `FINANCEIRO_TEMPLATE_APROVADO=true`: somente depois de o Meta aprovar exatamente este template.
- `FINANCEIRO_LEMBRETES_ATIVOS=true`: habilita o processamento após a conferência das configurações anteriores.

Instalação identificada na base: `chatwoot-cxbqw-u77386.vm.elestio.app`, conta 1. O sistema confirma o número da caixa antes de enviar. Nenhuma mensagem foi enviada durante a implementação.

A tabela `integracao_financeiro_lembretes` registra o resultado por parcela e vencimento. Respostas incertas não são repetidas automaticamente; devem ser conferidas no Chatwoot antes de qualquer reenvio. O status “enviado” registra a aceitação pelo Chatwoot, não a entrega confirmada pelo WhatsApp.

Referência: [templates no Chatwoot](https://developers.chatwoot.com/api-reference/messages/create-new-message).

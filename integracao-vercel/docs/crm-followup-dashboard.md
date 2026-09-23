# FollowUp e dashboard comercial

Implementados dentro da aba CRM do Integração.

## FollowUp

Cada card tem um próximo contato com prazo de 1, 2 ou 4 dias corridos. O primeiro registro é um agendamento. Para concluir, o comercial confirma que foi feito, escreve um resumo de 5 a 2000 caracteres e escolhe o próximo prazo. Uma operação atômica no banco conclui o registro anterior e cria o próximo, usando a identidade e o horário do servidor.

O histórico preserva autor, resumo, data prevista, conclusão e atraso. Duas pessoas não conseguem concluir o mesmo agendamento e criar dois próximos prazos: a segunda recebe uma mensagem para atualizar. Repetições da mesma operação não duplicam o histórico. Clientes compartilhados têm um único agendamento pendente, visível aos responsáveis autorizados. Transferência mantém histórico; união de cards conserva o prazo aberto mais próximo e marca o outro como unificado.

## Dashboard

O botão Dashboard comercial está junto das abas do CRM e só aparece para administradores e diretores ativos. O banco também verifica essa permissão. Inclui todos os perfis comerciais, inclusive inativos identificados e agentes sem movimento.

O filtro de período aceita até 366 dias e considera o fuso America/Sao_Paulo. Movimentações são atribuídas ao autor da mudança; conversões e perdas ao responsável principal do card no evento histórico. Contrato → Cliente ativo não gera uma segunda conversão. Conversões e perdas contam clientes distintos em cada grupo, de modo que um cliente perdido e recuperado pode aparecer nos dois. A taxa representa conversões entre desfechos, não conversão de uma coorte de novos leads.

FollowUps realizados e tempos são atribuídos ao autor da conclusão. O tempo médio vai do agendamento à conclusão. Atraso médio inclui zero para os feitos antes do prazo. Carteira, pendências e atrasos mostram o estado atual; clientes compartilhados podem aparecer em mais de uma carteira.

## Chatwoot

Os cards mostram conversas e mensagens vinculadas, além da data da última mensagem. O dashboard diferencia conversas da carteira e atendimentos identificados: uma conversa em que um usuário enviou uma mensagem humana pública no período. Notas internas, bots, atividades de sistema e mensagens sem autoria confirmada não entram na produtividade individual.

O receptor aceita autor_chatwoot_id e autor_tipo, distintos do agente responsável pela conversa. Eventos legados continuam sendo aceitos, com autoria desconhecida explicitamente contabilizada. Nenhum nome é usado como suposição de identidade.

Conferir histórico no Chatwoot consulta, por páginas, apenas conversas já vinculadas ao CRM. Não envia mensagens, não altera o Chatwoot e não identifica novos clientes por nome. O servidor verifica a sessão e o perfil de diretor antes de consultar o serviço. Exige CHATWOOT_INTEGRACAO_API_TOKEN e as credenciais CRM_INTEGRACAO_SUPABASE_URL/CRM_INTEGRACAO_SERVICE_ROLE_KEY já usadas pelo receptor. A instalação é a existente chatwoot-cxbqw-u77386.vm.elestio.app, conta 1. Remetentes humanos são vinculados pelos IDs configurados em Configurar agentes do Chatwoot.

O painel informa mensagens sem identificação e autores humanos sem vínculo. A consulta é interrompível; páginas salvas são idempotentes. O histórico anterior só tem autoria individual após conferência. A ausência da credencial é apresentada como indisponibilidade da consulta, preservando o dashboard com o histórico registrado.

## Validação

- Testes PostgreSQL isolados: acesso, autores, resumo obrigatório, prazos válidos, idempotência, conflitos, transferência, união de cards, dashboard, contagem de contratos e distinção de bots/notas internas.
- Testes da API: sessão, acesso de diretor, cursor, paginação, identificação do remetente e somente leitura no Chatwoot.
- Testes de navegador: desktop e celular, agendamento e conclusão, histórico, tema escuro, filtro por comercial e botão oculto para comercial.
- Teste no banco real com rollback: criação, conclusão, dashboard de diretor e bloqueio de comercial. Nenhum registro de teste persistido.

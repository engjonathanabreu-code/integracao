# Arquivo de leads do CRM

A lixeira de 30 px aparece nos cards sem cliente vinculado, inclusive nas visualizações compactas. A confirmação informa que os dados serão preservados e solicita um motivo de 3 a 2000 caracteres. Arquivar não exclui registros físicos, não marca o negócio como perdido e não altera clientes cadastrados.

O registro deixa o funil, os potenciais leads, a lista de perdidos e o trabalho pendente. O FollowUp pendente recebe status arquivado, sem fingir conclusão. Conversas, mensagens, atendimentos, condições comerciais e FollowUps permanecem no banco. Um registro no arquivo guarda dados do lead, responsáveis, motivo, data, autor e cópia do histórico de FollowUp e tarefas nesse momento.

O botão Arquivo do CRM é exclusivo da diretoria, com RLS no banco. Permite filtrar arquivados/restaurados, buscar, consultar histórico e exportar os registros filtrados em CSV compatível com planilhas. Campos potencialmente interpretados como fórmulas são neutralizados. O relatório inclui contatos, município, negociação, motivo, autoria e resumos de FollowUp.

Restaurar exige um comercial ativo escolhido pela diretoria. O lead volta como Cliente novo com os mesmos dados e histórico; deve receber um novo prazo de FollowUp. Tarefas antigas preservadas voltam a ficar disponíveis. O registro do arquivamento permanece na consulta de restaurados. Novo arquivamento cria outro registro, preservando os ciclos anteriores.

Comerciais não acessam leads arquivados ou seus históricos. Arquivar exige acesso prévio ao lead. Escritas diretas nos campos de arquivamento e na tabela de arquivo são proibidas para usuários. Chamadas de edição sobre um lead arquivado são rejeitadas. O processamento do Chatwoot preserva o identificador e a marca de arquivamento, sem recolocar o lead no funil.

Verificação: testes de PostgreSQL isolado, CSV, navegador em 1440/390 px, build e teste de permissões em produção com rollback de todos os registros de teste. A exclusão solicitada de um registro específico de Witmarsum não faz parte desta migração.

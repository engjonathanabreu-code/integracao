# Sincronização por conta: auditoria e correção

Migração 20260929162047_modulos_mesclagem_sem_conflito aplicada em produção.

A auditoria percorreu as 17 contas cadastradas (15 ativas, 2 inativas) sob authenticated, com auth.uid correspondente e RLS vigente. Não foram usadas sessões de navegador ou rascunhos locais de outras pessoas.

Em oito módulos ainda havia comparação integral de dados JSON: núcleos, municípios, remessas, metas, planos, ordens de serviço, calendário e complementos de usuários. Foram reproduzidos 216 conflitos falsos sintéticos quando os campos eram independentes ou já continham o mesmo valor desejado. A migração estende a mesclagem segura já usada em moradores para esses módulos e identifica corretamente a tabela nos conflitos reais.

Depois da correção: 584 cenários executados com resultados esperados (429 aceitos, 155 bloqueios corretos). Outros 48 cenários ficaram sem registro editável disponível, em planos/complementos de usuários; não houve ampliação de permissões para criar amostras. As 15 contas ativas passaram nos cenários cobertos, e as duas inativas foram rejeitadas.

Inclui 90 cenários de chat/notificações (leitura desatualizada, reenvio idempotente e conteúdo conflitante). Essas regras especiais permanecem intactas. Configurações, ponteiros de arquivos e colunas canônicas do ERP também mantêm seus controles anteriores.

Validação automatizada: 491 testes passaram. Conflitos reais, arrays incompatíveis, exclusão versus edição, RLS, transação atômica e recibos idempotentes continuam protegidos. Auditoria de segurança sem novos apontamentos.

Os scripts auditar-sincronizacao-contas.sql e auditar-leituras-contas.sql são testes operacionais privilegiados e reversíveis: cenários usam subtransações revertidas e a transação externa termina em ROLLBACK. Foram confirmados zero registros residuais com os marcadores de teste. Não enviam mensagens à equipe.

A correção é no servidor e vale para páginas abertas. Uma fila antiga pode ser reapresentada com “Tentar salvar novamente”. Os testes não confirmam que o aviso desapareceu em cada navegador nem substituem a análise de conflitos reais ou outros erros de permissão/conexão. Não limpar armazenamento local nem importar snapshots inteiros.

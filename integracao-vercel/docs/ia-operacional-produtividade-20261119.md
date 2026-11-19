# IA operacional: fila pessoal e resumo de trabalho

Base verificada: main b1070cc. Alteração local incremental, sem novas APIs, provedores, transmissão, escrita operacional ou mudanças de permissão.

## Diagnóstico

O agente pessoal já roteia pedidos para formulários oficiais, mantém memória pessoal e oferece follow-ups para o perfil Comercial. Sua lista lateral de metas comparava apenas `usuario.id`, ignorando atribuições pelo UUID ERP. O módulo agora reutiliza `responsavelMeta`, como o restante de Metas.

## Funcionalidades adicionadas

1. Fila pessoal determinística a partir dos dados já presentes na sessão: vencidas, hoje, prazo ausente/inválido, futuras e aguardando aprovação. Exibe o próximo item incompleto do checklist. Aprovação não vira recomendação para refazer a entrega. Exclui ideias/planos não canônicos e encerradas. Não declara sincronização concluída.
2. Resumo de trabalho pronto para selecionar/copiar, sem modelo externo. Texto explicitamente rotulado como rascunho local, sem envio ou alteração das metas. Inclui todas as metas da fila, enquanto a tela mostra no máximo cinco. Copiar informa sucesso somente após a Clipboard API confirmar; falha preserva texto selecionável.
3. Atalho de Topografia para a rota existente `campoOffline`, aba topografia, com guardas do perfil e permissão existente. Metas abre a tela existente, sem prometer seleção de uma meta específica.

Comercial, Projeto, Pós-protocolo, Jurídico, Financeiro, Consulta e Diretoria recebem a fila de suas próprias atribuições e o resumo, sem novo atalho exclusivo. As ações comerciais/follow-ups existentes permanecem intactas. Inativo ou usuário ausente não recebe o painel. Isso é filtro de apresentação, não substitui controles do servidor. Não houve inspeção de sessões ou conversas privadas de funcionários.

## Produtividade verificável por etapas

- Preparar resumo: antes era necessário reunir e redigir títulos, prazos e itens; agora o fluxo oferece duas ações explícitas, Preparar resumo e Copiar resumo. Não medimos minutos economizados nem produtividade de funcionários.
- Triagem: o painel reúne ordenação por prazo e primeiro item incompleto, sem abrir cada meta para essa consulta. A decisão e alteração continuam no fluxo oficial.
- Topografia: uma ação abre Campo offline a partir do painel pessoal. Não altera dados nem inicia captura automaticamente.

## Validação

13 testes unitários focados passaram, incluindo oito perfis, aliases ERP, isolamento de atribuição, usuário inativo, preservação de dados, ideias versus metas canônicas, corte de dia em Brasília, prazo inválido, aprovação e ausência de comentários/observações no resumo.

Fixture de navegador e teste estão em `tests/trabalho-pessoal.*`. Cobrem desktop/mobile, oito perfis, sucesso/falha de cópia, rotas, fechamento/reabertura e troca de usuário. Não executados com sucesso neste ambiente: Chromium instalado abortou com `socket() failed: Operation not permitted`; o navegador empacotado do Playwright não estava instalado. Não afirmar validação visual. O teste bloqueia rede externa e usa dados sintéticos.

Build Vite isolado concluído com sucesso após o ajuste final, com aviso de chunks grandes preexistente. A suíte completa foi iniciada e seguia em execução no momento do registro; consultar o relatório final antes de afirmar aprovação integral. Não há script de lint/tipos neste package.json.

## Risco preexistente, separado

`src/App.jsx: executarAgente` retorna vazio tanto ao bloquear ações como ao abrir; `ir` também retorna vazio ao cancelar navegação/falhar. `AgentePessoalTeste.jsx` anuncia abertura após `await onAcao(plano)` sem recibo explícito. Corrigir requer contrato consistente entre navegação, execução e chamadores, com testes de cancelamento/bloqueio. Não foi modificado nesta entrega e não é solucionado pelo painel novo.

## Publicação

Sem push, PR, migration, deploy ou alterações de acesso. Revisar integração e executar a jornada visual antes de publicar. Reversão: retirar o componente e helper locais, sem reversão de dados.

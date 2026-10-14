# Item 6 — impasse: aprovação por dois diretores

## Resultado

Não implementado. As regras 2 e 7 exigem parar caso seja necessária uma migração. A aplicação pode apresentar botões e estados, mas não pode garantir a autorização exigida apenas em React.

## Evidência de 16/09/2026 — somente metadados

A RPC integracao_gravar usa a sessão autenticada, aceita alterações genéricas em dados e delega às permissões das tabelas. As policies UPDATE das quatro tabelas próprias verificam integracao_acesso(referencia_tabela, referencia_id, criado_por); não comparam solicitante/aprovador nem validam transições de exclusão no JSONB. O bloqueio de alterações de identidade refere-se às colunas, não a autores/decisões escritos dentro de dados.

A ação decidir_exclusao já existente é exclusiva de conversas (erp_exclusoes_chat / erp_conversas), com is_admin. Não implementa o fluxo pedido para municípios, núcleos, remessas e moradores nem proíbe ali a autoaprovação. Não será reutilizada para cadastros.

Portanto um usuário com permissão de edição poderia enviar diretamente à RPC a marca de exclusão ou a aprovação no JSONB, contornando uma restrição feita apenas na tela. Impedir isso exige validação autoritativa no servidor (por exemplo, alteração controlada da RPC/policy/trigger nas tabelas próprias). Isso é uma migração e está proibido nesta tarefa. Nenhuma foi escrita ou aplicada.

## Proposta para uma futura autorização separada

- Exclusão lógica apenas no complemento integracao_*, sem DELETE e sem alteração no ERP.
- Bloquear solicitação/aprovação enquanto houver filhos não excluídos; contar remessas/núcleos/moradores relevantes antes de solicitar e conferir novamente ao aprovar, numa transação.
- Somente diretores ativos podem solicitar/aprovar; aprovador deve ser diferente do solicitante. Identidades e datas devem vir da sessão/servidor, nunca do formulário.
- Pendente permanece visível; aprovado some das listas. Impedir que a importação canônica recrie a visibilidade do complemento excluído.
- Guardar eventos imutáveis de solicitação/decisão e impedir regravação de autoria ou datas por alteração genérica do JSONB.
- Filtrar em todas as listas, seletores, carregamentos offline e resumos, mantendo consulta autorizada ao histórico.

## Efeito nos registros existentes

**Nenhum.** Nenhum registro foi marcado, ocultado, removido, solicitado ou aprovado; nenhum histórico foi alterado. Não existe código de exclusão parcial neste PR. Os outros itens podem ser revisados independentemente.

Arquivo existente alterado: nenhum. Somente este diagnóstico. Build do projeto base passou.

# Busca inicial e Andamentos por município

A busca de clientes na página inicial também considera o nome do cônjuge existente no cadastro. A normalização de caixa, acentos e espaços usa a regra atual. O índice traz somente o nome adicional, sob a sessão e as permissões existentes; não traz CPF, documentos ou dados financeiros. O resultado mostra a ficha do titular e seu código, mantendo o nome do cônjuge fora do resumo. As demais buscas conservam o comportamento anterior.

Andamentos apresenta os registros autorizados em tabelas por município, reunindo núcleos e remessas sem subagrupamentos. Cada linha mantém seu contexto de núcleo. A ordenação usa created_at; na ausência de uma data válida, usa crm_created_at e depois data_atualizacao explicitamente identificada como data do andamento. Datas inválidas ficam ao final e empates usam o ID. O loader existente lê páginas de 500; a tela mostra 50 por município e permite carregar os demais. IDs repetidos são deduplicados sem alterar os registros.

Criação, edição, identificação do núcleo, status, visibilidade para IA, notas internas e instruções continuam usando os fluxos atuais. O vínculo processo_id é preservado e permanece obrigatório. O agrupamento é somente visual; não há migração, mudança de autorização, remapeamento de remessas ou envio de mensagens.

QA: busca por cônjuge com acentos/caixa, filtros/arquivamento, projeção mínima, paginação completa, municípios com múltiplos núcleos, datas inválidas e desempates. Banco isolado verificou criação/edição e consulta Chatwoot com somente o núcleo autorizado, sem notas internas ou outros núcleos. Edge em desktop e celular verificou busca por teclado, grupos, carregamento de páginas, criação/edição e perfil sem permissão de editar. Todos os dados dos testes são fictícios.

# Contrato de permissões — checkpoint de implementação

Branch independente `codex/permissoes-contrato-noite`, baseada em `0bfa140`. Não contém os nove ajustes da Page nem dados do laboratório. Não aplicar esta migração como se a implementação estivesse concluída.

## Implementado localmente

- Contratos efetivos separados de rascunhos, lidos exclusivamente por RPC autenticado. Nenhuma tela/importação concede direitos.
- Perfil canônico ativo e revisão do perfil verificados; nenhuma promoção de setor/cargo.
- Políticas de Planos limitadas ao plano acessível ou criado pelo próprio usuário autorizado. Negativas intersectam rotas legadas de exclusão.
- Gatilhos separam cadastro, situação, validação documental, aprovação de Metas e workflow setorial. Requisitos automáticos e chaves de outra etapa não podem ser marcados por edição de cadastro; campos extras são resolvidos pela configuração municipal atual.
- Retrocesso exige motivo novo para a transição; a UI envia esse motivo. O registro da auditoria usa autoria/horário do servidor.
- Rascunhos de fluxo têm 34 decisões independentes, inicialmente “Manter atual”. O RPC valida as chaves, preserva CAS, idempotência, auditoria e nega autoedição. Nenhuma decisão desses rascunhos se torna concessão efetiva.
- CSV de contatos verifica contrato antes da carga; PDFs/Word oficiais verificam exportação de documentos. Guardas adicionais para PRF, fotos, KML, pendências, anexos de metas, planos e chat.

## Validação

- Dez testes focados de contrato/RLS/fluxo/CSV aprovados após inclusão de motivo de retrocesso.
- Edge 1440 e 390 px: 34 valores iniciais herdados, autoedição bloqueada, salvar e reabrir rascunho sem concessão efetiva, sem erros JavaScript. Fixture local; o RPC real foi exercitado em PGlite.
- Edge: PDF e DOCX negados antes do download quando o contrato nega exportação; zero downloads e zero erros JavaScript.
- A árvore final, incluindo o motivo de retrocesso e os bloqueios PDF/Word, passou **845/845 testes e build** (`permissoes-noite/testes-build-retomada-final.log`). Isso não elimina os impedimentos funcionais abaixo.

## Ainda impede publicação

1. Concluir e testar todas as condições de avanço do workflow no servidor, incluindo requisitos automáticos, opcionais/desativados municipais e bloqueio pelo núcleo. A validação de chaves e setor não substitui essa avaliação completa. O avanço na UI ainda usa o avaliador existente.
2. Rever o escopo de associação `projeto_id` e alterações de responsáveis em Planos; não permitir que criar/editar plano amplie acesso a outros projetos ou pessoas fora do escopo.
3. Fechar inventário de todos os caminhos de exportação e QA positivo/negativo dos três perfis, incluindo anexos e fluxos de documentos que não usam os helpers comuns.
4. Classificar como pendentes as ações sem operação existente: excluir plano, editar mensagem enviada e exclusão de clientes/núcleos/remessas. Arquivar não equivale a excluir. Não afirmar que uma flag habilitou uma ação inexistente.
5. Materializar as concessões específicas da fonte validada em script privado, com CAS dos 17 perfis, revisão independente das três contas e comprovação de que os outros 14 não mudam. A migração genérica não contém atribuições de pessoas reais.
6. Só então aplicar migração/atribuições e publicar exclusivamente esta branch, com verificação de leitura posterior. Nenhum desses atos foi realizado neste checkpoint.

Não há solicitação genérica de aprovação pendente. A autorização específica da noite foi preservada; as pendências acima são técnicas. Não usar exclusões reais para QA nem misturar correções de segurança fora do contrato aprovado.

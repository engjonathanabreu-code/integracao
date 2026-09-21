# Financeiro — implementação e validação

O perfil ou setor canônico `Financeiro` de `public.profiles` é reconhecido no login, na sincronização e na recarga. Administradores mantêm Diretoria. Preferências salvas não substituem o setor canônico.

Financeiro pode editar cadastros de clientes, criar/editar planos, etapas e entregáveis, criar seus eventos e conversar como participante. Permissões técnicas de outros setores, administração de usuários, aprovação documental e configurações permanecem separadas.

A nova aba Financeiro usa o tema atual e mostra “Em construção”. Financeiro/Diretoria têm acesso operacional; demais setores recebem somente leitura. A página ainda não contém operações de gravação ou dados financeiros novos.

## Banco

Aplicadas no projeto ERP Integral Interno (`ycdsyilyvaxslkwbkxyo`):

- `integracao_financeiro_planos`: políticas adicionais nas cinco tabelas de planos, sem substituir as anteriores.
- `integracao_financeiro_edicao_etapas`: proteção de etapas reconhece Financeiro ativo.
- `integracao_financeiro_entregaveis`: proteção de entregáveis reconhece Financeiro ativo.

As definições estão em `supabase/operacoes/financeiro*.sql`. O tipo Financeiro e as regras de clientes já existiam; Calendário/Chat conservam a autorização por participante.

## Evidências

- 130 testes locais passaram, incluindo comparação de todas as permissões anteriores por setor.
- Build de produção passou.
- Navegador: Financeiro, Administrador, Comercial, Topografia, Projetos, Pós-protocolo, Jurídico e Marketing; navegação das quatro abas solicitadas, acesso operacional/consulta, ausência de ações na tela em construção e layout móvel.
- `financeiro-rls.sql`: execução como `authenticated` confirma leitura de clientes, criação/leitura/exclusão de plano, edição de etapa, conclusão de entregável, criação de evento, conversa e mensagem, ausência de privilégios administrativos e bloqueio do perfil inativo. Usuários e registros temporários são integralmente revertidos com ROLLBACK.
- A auditoria de segurança mantém avisos anteriores, incluindo funções SECURITY DEFINER expostas e proteção contra senhas vazadas desativada. Referências: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

O frontend foi alterado e validado localmente; não houve publicação/deploy nesta tarefa. Alterações locais anteriores de busca, carregamento e timbrado foram preservadas.

# Prevenção de regressões de permissão em Clientes

`npm run build`, usado pelo Vercel, agora executa toda a suíte antes de compilar. Qualquer falha encerra a publicação com código diferente de zero. `npm test` executa a mesma suíte sem compilar.

O teste `tests/permissoes-clientes-publicacao.test.js` cruza as permissões reais da interface com regras do PostgreSQL em PGlite, para 11 tipos de perfil, ativos e inativos. Usa clientes fictícios sem cartão CRM. Também executa a operação produzida pelo formulário através da RPC real: gravação, repetição idempotente, conflito e reversão de lote incompleto. Ao remover a política corretiva, reproduz o erro original. Não usa dados de clientes.

A referência `tests/fixtures/permissoes-clientes-producao.json` contém funções e políticas consultadas em produção em 23/09/2026. A política corretiva é aplicada pelo arquivo de migração versionado. Esta referência não substitui auditoria de alterações externas no banco: ao mudar funções, políticas ou perfis, atualizar a referência, revisar os testes e validar em transação com rollback no ambiente de destino.

Na validação de produção foram conferidas 36 combinações (9 perfis ativos existentes × 4 tabelas), usando a identidade e as permissões do usuário, sem persistir alterações. Não houve bloqueio para as ações de cadastro autorizadas pela interface após a correção.

# Instruções de engenharia — Integração

Estas instruções se aplicam a todo este repositório: `engjonathanabreu-code/integracao`. Confirme o remote e os arquivos antes de trabalhar. A aplicação está em `integracao-vercel/`; execute os comandos da aplicação nessa pasta.

Leia o README e a documentação pertinente em `integracao-vercel/docs/`, além das instruções específicas do módulo afetado. Preserve as orientações compatíveis. Há descrições históricas de armazenamento e publicação no README; confirme o estado atual no código e nas migrations. Exemplos de push/publicação não autorizam deploy em produção.

O projeto usa React/Vite, com interface em `integracao-vercel/src/`, rotas em `integracao-vercel/api/`, código de servidor em `integracao-vercel/server/`, SQL em `integracao-vercel/supabase/` e testes em `integracao-vercel/tests/`. Inspecione também autenticação, permissões, sincronização e dados compartilhados com o ERP/Financeiro conforme o fluxo afetado. Não use essa visão geral como substituto da inspeção.

A migration e a PR 97 tiveram execução interrompida pelo usuário: não retome, execute ou publique esse trabalho sem nova autorização explícita. A inclusão deste protocolo não concede essa autorização.

## Protocolo de desenvolvimento com IA

### Objetivo e responsabilidades
Atue como engenheiro sênior, arquiteto de software, especialista de banco de dados e QA. Desenvolva e melhore o sistema com alta qualidade técnica, preservando as funcionalidades existentes. Priorize segurança, manutenção, desempenho, consistência visual e confiabilidade.

## Inspeção antes da edição
Antes de editar, inspecione a arquitetura, os arquivos relevantes, o fluxo completo da funcionalidade, dependências, autenticação, permissões, banco, instruções de agentes e documentação. Confirme nos arquivos a existência de tabelas, componentes, APIs e funções; não presuma sua existência ou contratos. Identifique impactos e possíveis regressões em outros módulos. Preserve as instruções existentes compatíveis; em conflitos, respeite as restrições explícitas mais recentes do usuário.

## Diagnóstico e planejamento proporcionais
Para alterações complexas, apresente antes da implementação: diagnóstico atual, resultado esperado, arquivos e componentes envolvidos, mudanças necessárias no banco, riscos e estratégia de validação. Alterações simples e de baixo risco podem ser executadas após a inspeção adequada, sem uma etapa adicional de aprovação rotineira.

## Implementação
Preserve a arquitetura e os padrões do projeto. Faça mudanças pequenas, locais e focadas. Evite duplicação e reutilize componentes e funções existentes. Não substitua funcionalidades estáveis sem necessidade demonstrada. Preserve o funcionamento mobile e a consistência visual. Justifique novas dependências. Não exponha segredos no código, documentação, logs ou relatórios. Alterações de banco devem usar migrations versionadas, respeitando o fluxo e as permissões existentes.

## Validação e evidências
Crie ou atualize testes para os comportamentos alterados. Execute testes relevantes, lint e verificação de tipos quando disponíveis. Verifique autenticação, permissões, tratamento de erros e regressões em outros módulos afetados. Adeque as verificações ao risco; para documentação, confira conteúdo, links, conflitos com instruções existentes e diff. Não declare sucesso sem evidências de validação. Registre falhas, verificações não executadas e seus motivos.

## Git, publicação e rollback
Prefira uma branch isolada. Antes de push ou abertura de PR, inspecione o fluxo de CI/CD e confirme se a ação pode publicar em produção. Não publique em produção sem autorização explícita. Antes de deploy autorizado, apresente riscos e mantenha uma estratégia de rollback. Não faça merge ou deploy sem autorização específica para a ação.

## Relatório final
Apresente modificações, arquivos alterados, branches, commits e PRs efetivamente verificados, testes e resultados, riscos remanescentes, limites de validação e prontidão para publicação. Diferencie resultado comprovado de hipótese ou pendência.

## Comandos de validação existentes

Em `integracao-vercel/`, `npm test` executa `scripts/verificar.mjs`; `npm run build` executa a mesma verificação e depois o build Vite. Confira os scripts, testes e dependências antes de executar, incluindo eventuais integrações. Não há scripts de lint ou tipos declarados no package.json inspecionado; registre essa ausência e verifique novamente se o projeto evoluir. Para mudanças só de documentação, revise o diff e use `git diff --check`, sem afirmar validação de comportamento da aplicação.

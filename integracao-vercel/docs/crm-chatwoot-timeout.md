# Resumo Chatwoot sem bloquear o CRM

## Diagnóstico

Em 04/11/2026, a leitura de `integracao_crm_chatwoot_resumo` excedeu o tempo permitido durante as verificações `permite` / `card_permitido`. O CRM carregava esse resumo na mesma `Promise.all` dos cards, tarefas e FollowUps, fazendo uma falha complementar impedir o uso da tela inteira.

## Correção preparada

- Cards, tarefas e FollowUps continuam na carga essencial original.
- O resumo é carregado depois, independentemente, usando a mesma sessão e as mesmas políticas RLS.
- Cada consulta filtra no máximo 25 IDs já retornados pelo funil autorizado. Os lotes são sequenciais, sem busca global e sem consulta quando não há cards.
- Falhas são apresentadas como indisponibilidade, não como contagens zero. Nova tentativa consulta somente o resumo.
- Respostas de uma carga anterior ou outro usuário são descartadas. Sair da tela impede o início de novos lotes.
- Não há migration, alteração de permissões, gravação, alteração de reservas ou descarte de dados locais.

## Validação

`node --test tests/crm-chatwoot-carga.test.js` cobre lote, filtro, duplicação de IDs, ausência de cards, timeout, repetição, cancelamento e integração estrutural com o CRM.

`node tests/crm-chatwoot-timeout.browser.cjs` valida a tela com fixture isolado no Vite em 127.0.0.1:5178. Usa Playwright disponível no executor; `CHROMIUM_PATH` pode indicar o binário. Nenhuma requisição externa é permitida pelo teste. A execução neste ambiente ficou bloqueada pela restrição de sockets do Chromium, inclusive na tentativa escalada. Não equivale a uma validação visual aprovada.

O efeito sobre a latência no banco real ainda precisa ser medido com sessão Comercial após uma publicação autorizada. Esta correção contém a falha na interface e reduz o escopo de cada requisição; não afirma eliminar todos os timeouts. As reservas conflitantes da imagem são um problema separado e continuam preservadas.

Validação local em 04/11/2026: `npm run build` passou com 925 testes (zero falhas) e compilação Vite. Os seis testes focados foram repetidos após o ajuste final e passaram; a compilação final também passou. Não existem scripts separados de lint/typecheck neste projeto. `git diff --check` passou. O build mantém o aviso de chunk maior que 2 MB. Não houve teste autenticado no ambiente real, push, PR ou deploy.

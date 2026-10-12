# Planejamento, permissões e tarefas internas

Administradores de Metas iniciam no planejamento futuro; os demais usuários continuam na tela atual. A visão anterior permanece acessível. O quadro permite 4, 8 ou 16 semanas, filtros combinados de setor/pessoa/status, cores existentes dos setores, edição do título e movimentação com alça ou setas. O prazo não muda ao mover o cartão. Ideias são registros complementares; a conversão cria uma meta com o mesmo ID uma única vez.

Permissões atuais apresenta as regras existentes sem conceder acesso. A equivalência foi verificada nos 17 perfis atuais, sem divergências. Módulos de autorização, políticas RLS, grants e credenciais permanecem sem alterações. Nenhuma migração, reinicialização ou carga de dados fictícios é aplicada ao sistema oficial.

Notificações são ordenadas pelas mais recentes. Leitura e arquivamento ficam nas preferências do próprio usuário, com restauração e desfazer. Limpar lidas arquiva; não apaga os registros compartilhados. Preferências persistem na infraestrutura atual de usuários.

Devolutivas aparecem somente no prazo já confirmado pelo fluxo de revisão, inclusive quando vencidas; registros vinculados não geram eventos duplicados. Não são inferidas datas a partir de textos nem criados eventos por processamento pago. O calendário geral mantém a semântica anterior até a confirmação do requisito de período versus prazo final.

O agente pessoal mantém suas ações existentes e acrescenta consulta de resumo, identificação de moradores sem contato e CSV de contatos de um NUI explicitamente escolhido. A rota usa o JWT do solicitante e a autorização existente, confirma município/UF e lê todas as páginas antes da entrega. Não usa service role nem envia contatos a terceiros. CSV abre no Excel; inclui núcleo, código, nome, telefone, WhatsApp e e-mail, neutralizando fórmulas. Ausência de acesso, ambiguidade, página incompleta ou mudança de contagem interrompe a entrega. Não há exportação de CPF ou dados financeiros. Não foram exportados moradores reais durante a validação.

## Verificação e limites

Executar `npm test` e `npm run build` em `integracao-vercel`. O roteiro `tests/planejamento-notificacoes.browser.cjs` usa Playwright com Edge instalado, servidor local em 5178, perfil temporário e fixture fictícia; conexões fora de localhost são bloqueadas. A variável PLAYWRIGHT_MODULE permite indicar o módulo Playwright disponibilizado no executor.

O navegador integrado apresenta MXC 0x80070003 neste computador. Isso limita a abertura integrada, mas o Edge instalado permite QA isolado. Testes de autorização e paginação da rota usam respostas controladas; não substituem uma conferência autenticada em produção. Não foram realizados testes que gravem eventos reais nem chamadas pagas de IA. A cópia independente de demonstração em 4173 não faz parte deste deploy.

Resultado no JonathanHome: 813 testes aprovados; build Vite aprovado. Edge em 1440 e 390 pixels validou navegação, filtros combinados, cor/status, horizontes, movimentação por setas, conversão, notificações e representação de permissões sem erros de página. Em desktop, movimento real do ponteiro gerou dragstart/drop confiáveis (isTrusted=true), moveu o cartão entre semanas e confirmou a gravação. No celular, foram validados setas e eventos HTML5; o arraste por ponteiro entre colunas fora da área visível não foi confirmado.

O roteiro `tests/contatos-interface.browser.cjs` percorreu seleção de NUI, resumo, geração e download de CSV pela interface usando o handler real e um backend exclusivamente fictício. Conferiu nome do arquivo, um registro fictício, BOM UTF-8, neutralização de fórmula, ausência de CPF e JWT da fixture em todas as consultas. Os testes da rota também cobrem paginação de 1.201 complementos. Nenhum morador real foi consultado ou exportado. A conferência autenticada em produção permanece fora desta validação isolada.

A comparação com a base confirmou que o componente ConfigUsuarios inteiro, sua aba, os parâmetros e os módulos permissoes.js, crm-regras.js e agente-memoria-teste.js são idênticos. A nova matriz não substitui a edição de usuários/setores. SHA-256 do componente normalizando somente CRLF/LF: `82dde3301fbe8575aa772fdaeaeb3f3bafe0a3e45e913b0cd905acfc39b433cc`.

Para o commit `5270ec8a1e0201745729771e95b79daafe3cbce6`, GitHub retornou zero status checks, zero check runs e zero workflows de PR. Não há CI remoto aprovado para declarar. O PR e sua aba de checks são https://github.com/engjonathanabreu-code/integracao/pull/80 e https://github.com/engjonathanabreu-code/integracao/pull/80/checks.

## Publicação e reversão

Revisar o diff e os resultados finais em PR rascunho. Publicar apenas após resolver a semântica pendente do calendário e confirmar todos os critérios. Confirmar o SHA e o projeto Vercel `integracao` antes de promover produção. O deploy anterior de referência é `dpl_H8pGpDAMZRiBrviR4VeY5h8Utmsn`, associado ao commit `c8db8c0dbb517a1aa1aeb34596c203fbc1fdaa01`; revalidar o alvo antes de qualquer reversão.

Reverter código/deploy não exige migração reversa: os dados existentes não são apagados, metas convertidas mantêm o formato atual, e ideias/preferências adicionais permanecem nos complementos existentes. Nenhuma restauração deve sobrescrever dados criados por usuários.

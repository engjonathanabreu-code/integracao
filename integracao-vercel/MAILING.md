# Mailing interno

Mensagens pessoais e caixas compartilhadas dos setores são persistidas no Supabase. O acesso é validado pelo perfil ativo do usuário; diretores acessam caixas de setores, sem acesso às caixas pessoais de outros usuários. Rascunhos pertencem ao autor, inclusive em caixas de setores.

Envios e entregas internas são transacionais. Cco é removido das cópias destinatárias. A edição usa versões da caixa e do rascunho para recusar sobrescritas concorrentes. Conteúdo de mensagens recebidas/enviadas é imutável; lixeira, pastas e marcadores alteram apenas a organização da caixa. Anexos privados têm limite de 20 MiB por arquivo e links temporários.

A conexão OAuth com Gmail e o agendamento de envio ainda não estão habilitados. Nenhuma conta Google é conectada automaticamente. As sugestões rápidas de resposta são modelos locais; o botão do agente abre a IA pessoal já existente no Integração.

## Publicação

Aplicar as migrações `20261008120000_crm_entrada_valor.sql` e `20261008121000_mailing.sql` antes de publicar o frontend. A migração do CRM adiciona valor de entrada em reais sem reescrever percentuais antigos, conserva permissões e preserva condições nos movimentos e vínculos de leads.

Executar os testes e build em `scripts/verificar.mjs --build`, os testes de navegador do CRM e Mailing e confirmar o commit servido pelo Vercel. Em caso de reversão do frontend, preservar as novas tabelas, o bucket e a coluna do CRM; não remover dados.

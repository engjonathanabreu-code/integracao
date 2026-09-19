# CRM, atendimento, Gestão Semanal e Marketing

## Escopo desta entrega

Implementação das funcionalidades sem importação do CRM antigo. Em 19/09/2026, após autorização, a estrutura foi aplicada no Supabase do Integração. A migração SQL acrescenta estruturas e permissões; não copia dados existentes. A configuração de Chatwoot e do agente externo permanece uma etapa separada.

### Telas
- CRM: quatro etapas, cards vinculados ao cadastro canônico, tarefas pessoais com prazo/checklist, atendimento manual, histórico de mensagens, leads, transferência e confirmação humana do cadastro de um contato. Administradores supervisionam todos; comerciais acessam seus próprios cards e tarefas. Uma tarefa permanece com seu responsável após transferência do lead.
- Novos moradores: cadastro normal em município/remessa, sem núcleo, status Cliente novo. O gatilho adiciona ao funil os novos cadastros de comerciais/admins após instalar a estrutura. Cadastros anteriores só entrarão no funil na futura migração/atribuição.
- Processos > Andamentos: leitura da tabela existente, registro/edição por Pós-Protocolo/admin, descrição pública, nota interna, previsão, visibilidade e orientação IA. Instruções específicas por núcleo começam desativadas e precisam ser habilitadas explicitamente.
- Processos > Gestão Semanal: semanas recorrentes 1–4, mês/ano, município/núcleo/andamento, comentários, conclusão/reabertura, anexos privados, histórico e solicitação de exclusão com decisão administrativa. Exclusão aprovada desativa o card e conserva o histórico.
- Clientes > Município > Atendimentos à prefeitura: mesma gestão filtrada pelo município, com a mesma autorização.
- Marketing: vínculo ao núcleo, fases e etapas ordenadas, progresso, conclusão/reabertura, autor/data e filtros. Acesso Marketing/admin. Etapas podem ser cadastradas; os modelos e dados do CRM serão importados depois, conforme pedido.

### Banco e segurança
Arquivo: `supabase/migrations/20260919141332_consolidacao_crm_funcionalidades.sql`.
Todas as tabelas novas têm RLS; funções privilegiadas ficam no schema privado, com checagem de usuário ativo/escopo e execução revogada de PUBLIC. Funções de ingestão e contexto IA só são executáveis por service_role. O frontend usa exclusivamente a sessão do usuário. Não colocar service_role em variável VITE_*.

A migração conserva os dados e IDs das tabelas canônicas. Depois da instalação, uma alteração explícita de status no CRM sincroniza apenas `requerente.statusCRM` do complemento, sem trocar nome, documento, telefone, município, remessa ou núcleo. Alteração pelo formulário cadastral também confere a autorização do card. Status legados não são reclassificados automaticamente.

Conversas são identificadas por instalação + conta + ID externo; mensagens por conversa + ID externo. A ingestão usa transação e trava por contato para evitar duplicação em tentativas concorrentes. Transferências manuais não são revertidas por eventos tardios de atribuição. Mensagens repetidas são ignoradas; o receptor atualmente arquiva eventos `message_created`, não sincroniza edições/remoções posteriores de mensagens.

### Configuração dos servidores — sem valores secretos no repositório
Configurar no servidor:
- `CRM_INTEGRACAO_SUPABASE_URL`: projeto de destino/homologação.
- `CRM_INTEGRACAO_SERVICE_ROLE_KEY`: chave secreta desse projeto.
- `CHATWOOT_INTEGRACAO_INSTALACAO`: identificador estável da instalação.
- `CHATWOOT_INTEGRACAO_CONTA`: conta Chatwoot autorizada.
- `CHATWOOT_INTEGRACAO_WEBHOOK_SECRET`: segredo de assinatura do webhook.
- `INTEGRACAO_AGENT_READ_SECRET`: segredo exclusivo para as ferramentas do agente IA.

No CRM, administração > Configurar agentes do Chatwoot associa instalação/conta/agente ao comercial ativo. Sem associação, o lead fica sem responsável e visível à administração para distribuição. O receptor ainda não foi configurado no Chatwoot.

### Contratos do agente IA
- `POST /api/chatwoot-integracao`: webhook; requer corpo bruto e HMAC SHA-256 sobre `timestamp.corpo`, headers `x-chatwoot-timestamp` e `x-chatwoot-signature`. Janela de cinco minutos. Não exige sessão de navegador.
- `POST /api/identificar-integracao`: Bearer do agente, `{conversation_id,nome?,cidade?,documento?}`. Consulta paginada, nomes sem o código conhecido, acentos, abreviações e erro simples de grafia. Retorna candidatos internos e pergunta de confirmação/correção. Nome aproximado, telefone ou cidade não geram vínculo automático.
- `POST /api/andamento-integracao`: mesmo Bearer, `{conversation_id}`. Somente conversa confirmada, núcleo do cadastro e andamentos `visivel_ia=true`. Não devolve observações internas nem histórico de outras pessoas.

O agente atual precisa receber essas ferramentas e as instruções de `docs/agente-atendimento.md` na ativação. Esta entrega prepara as ferramentas; não altera o agente ou automações em produção. A confirmação final do vínculo é feita pela equipe no CRM, inclusive quando há um só candidato, até homologar a política de identificação automática. Contatos externos confirmados mantêm o vínculo em novas conversas da mesma instalação/conta/contato.

### Validação
Na aplicação, testes transacionais no Supabase real validaram cadastro pela função usada pelo sistema, criação automática de card, status, preservação de telefone, tarefa, atendimento, isolamento entre comerciais, transferência, escrita de andamento pelo Pós-Protocolo, Gestão Semanal e Marketing. Todos os registros de teste foram descartados por rollback. As contagens e hashes de clientes, moradores, núcleos e andamentos foram idênticos antes e depois da instalação. As permissões adicionais preservam as políticas financeiras existentes e restringem o acesso comercial aos cadastros do próprio funil. O diagnóstico de segurança não apontou os objetos novos; os avisos restantes se referem a objetos preexistentes.

Verificação local em 19/09/2026: 147 testes passaram, nenhum falhou; build de produção concluído. Na interface com dados fictícios foram verificados avanço do funil, criação/conclusão de tarefa com checklist, atendimento manual, transferência de lead, registro à prefeitura, conclusão semanal, configuração de instruções do núcleo e conclusão de etapa de Marketing. Não houve validação ponta a ponta em produção ou com mensagens reais do Chatwoot nesta etapa.

`node --test tests/*.test.js` cobre regressões e testes novos. Os testes `crm-schema.test.js` criam PostgreSQL em memória com tabelas mínimas de suporte: não usam credenciais ou dados reais. Cobrem criação, RLS, transferência, webhook idempotente, contexto IA restrito, preservação cadastral, status sincronizado, checklist e exclusão semanal. Isso não substitui homologação contra todas as funções/RLS já instaladas no Supabase real.

`npm run build` compila a aplicação. `tests/browser.html?crm` simula frontend com dados fictícios e bloqueia solicitações externas. Não é incluído no build de produção.

### Próxima etapa
Configurar segredos/agentes, conectar as ferramentas à IA e homologar webhook real controlado. Só depois executar a migração seletiva com dry-run já discutido. Não copiar o banco antigo inteiro; não usar o teste de frontend como prova de autorização RLS.

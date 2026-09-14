# Dados compartilhados com o ERP Integral

O Integração consulta as tabelas existentes no projeto Supabase do ERP usando a sessão de cada usuário. A abertura inicial e as atualizações de leitura não executam importação, upsert, exclusão ou gravação de registros. Os identificadores do ERP são mantidos.

## Persistência

- Municípios, remessas, moradores do financeiro e suas condições comerciais usam `fin_receb_*`.
- Núcleos, andamentos, observações e histórico usam `processos_kanban*`.
- Metas, responsáveis, checklist, comentários, arquivos, ordens de serviço, planos, etapas e entregáveis usam suas tabelas existentes.
- Agendas, eventos e conversas usam `erp_*`, incluindo as operações já oferecidas pelo ERP para colaboração. Grupos sem vínculo passam a ser permitidos; vínculos de grupos com metas e ordens de serviço ficam no complemento do Integração porque não existem no modelo de vínculos do chat do ERP.
- Campos exclusivos são gravados nas tabelas `integracao_moradores`, `integracao_nucleos`, `integracao_municipios`, `integracao_remessas`, `integracao_metas`, `integracao_planos`, `integracao_ordens_servico`, `integracao_chat`, `integracao_usuarios`, `integracao_calendario` e `integracao_configuracoes`. O campo JSONB `dados` acomoda campos personalizados e estruturas variáveis, sem exigir uma nova migração a cada campo cadastrado na interface. As referências apontam para os registros canônicos. `integracao_complementos` continua disponível para compatibilidade.
- `integracao_notificacoes` preserva os avisos e as confirmações de leitura por destinatário. `integracao_auditoria` registra as ações explícitas; não permite atualizar ou excluir o histórico. Entrada, saída e presença não geram gravações.
- `integracao_arquivos` guarda os metadados de PRF, timbrado, KML, fotos, devolutivas e pacotes de campo. O conteúdo fica no bucket privado `integracao`, em objetos imutáveis. A fila offline é separada por conta, sobrevive ao fechamento e mantém a versão esperada para detectar conflitos. Pacotes não validados continuam sendo rascunhos e não alteram automaticamente os moradores do ERP.
- Arquivos de metas e documentos de planos mantêm os caminhos existentes do Storage. Novos anexos de metas usam nomes únicos e upload sem sobrescrita. Nenhum arquivo antigo é enviado apenas por abrir o sistema.

`integracao_gravar` recebe apenas alterações explícitas. Confere os valores anteriores dos campos alterados, mantém todo o lote em uma transação e usa um identificador de pedido para evitar duplicação após falhas de rede. As permissões existentes continuam sendo aplicadas no banco. Uma edição sem permissão ou conflitante fica pendente e seu rascunho é preservado.

O navegador guarda uma cópia de trabalho por conta para uso offline. Credenciais e tokens não são gravados nessa cópia. Após entrar offline é necessário entrar novamente conectado para enviar as edições. O botão de recuperação baixa o rascunho, guarda outra cópia local e reabre a versão atual do servidor.

## Preparação do banco

Aplicar uma única vez `supabase/compartilhamento.sql` como migração transacional antes de publicar o frontend. A preparação acrescenta duas colunas opcionais, tabelas auxiliares, políticas e funções. Não faz DML sobre os registros existentes. A própria migração compara contagens e assinaturas de todas as tabelas públicas existentes antes e depois e falha caso detecte alteração nos dados.

A extensão `supabase/migrations/20260914142328_persistencia_completa_integracao.sql` acrescenta 14 tabelas e o armazenamento privado. Ambas as preparações já foram aplicadas ao projeto existente. A extensão também verifica a integridade de todas as tabelas públicas anteriores, sem copiar ou atualizar seus dados.

Nunca executar os testes SQL com COMMIT. `tests/compartilhamento.sql` deve ser executado dentro de `BEGIN` / `ROLLBACK`, depois do esquema em uma base de teste ou na mesma transação de validação. Os perfis usados no teste são selecionados por função; os registros de teste usam UUIDs novos.

## Verificação

`node --test tests/compartilhamento.test.js tests/persistencia.test.js` verifica abertura sem gravações, campos canônicos, campos próprios em um aparelho vazio, histórico, notificações, arquivos imutáveis, fila offline e edições durante upload. `tests/persistencia-rls.sql` valida gravações, conflitos, idempotência e permissões dentro de uma transação encerrada com ROLLBACK. `npm run build` gera a aplicação.

`tests/browser.html`, servido somente no desenvolvimento, usa dados fictícios e bloqueia solicitações externas. Permite conferir o contador de gravações na entrada e após uma edição real pela interface. Esse simulador não faz parte do pacote de produção.

Os testes SQL verificam edição, concorrência, atomicidade, repetição sem duplicação, grupos sem vínculo, RLS de usuário comum e bloqueio de acesso anônimo. Testes pela interface em produção exigem a conta do usuário; a conta fictícia do simulador não funciona no Supabase real.

## Publicação

No calendário, `integracao_eventos()` limita no servidor a leitura dos eventos: administradores e diretores recebem todos; os demais recebem somente eventos próprios, convites e reservas de agendas compartilhadas. Metas e etapas são filtradas pelos responsáveis na visualização pessoal. A função privada aplica a regra específica do Integração sem substituir as políticas usadas pelas outras telas do ERP. A migração `20260914145805_permissoes_agendas_integracao.sql` também autoriza administradores e diretores a editar apenas nome e cor das agendas existentes. `tests/agendas-rls.sql` verifica essas permissões com ROLLBACK.

Na Vercel, a pasta raiz do projeto é `integracao-vercel`, o comando de compilação é `npm run build` e a saída é `dist`. O projeto continua ligado ao repositório existente.

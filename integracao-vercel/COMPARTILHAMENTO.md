# Dados compartilhados com o ERP Integral

O Integração consulta as tabelas existentes no projeto Supabase do ERP usando a sessão de cada usuário. A abertura inicial e as atualizações de leitura não executam importação, upsert, exclusão ou gravação de registros. Os identificadores do ERP são mantidos.

## Persistência

- Municípios, remessas, moradores do financeiro e suas condições comerciais usam `fin_receb_*`.
- Núcleos, andamentos, observações e histórico usam `processos_kanban*`.
- Metas, responsáveis, checklist, comentários, arquivos, ordens de serviço, planos, etapas e entregáveis usam suas tabelas existentes.
- Agendas, eventos e conversas usam `erp_*`, incluindo as operações já oferecidas pelo ERP para colaboração. Grupos sem vínculo passam a ser permitidos; vínculos de grupos com metas e ordens de serviço ficam no complemento do Integração porque não existem no modelo de vínculos do chat do ERP.
- Campos exclusivos são gravados em `integracao_complementos`, com referência ao registro original e RLS. Não armazenam cópias das colunas canônicas.
- Arquivos de metas e documentos de planos são acessados nos caminhos existentes do Storage. Novos anexos de metas usam nomes únicos e upload sem sobrescrita. As fotos de campo continuam locais, como previsto na tela original.

`integracao_gravar` recebe apenas alterações explícitas. Confere os valores anteriores dos campos alterados, mantém todo o lote em uma transação e usa um identificador de pedido para evitar duplicação após falhas de rede. As permissões existentes continuam sendo aplicadas no banco. Uma edição sem permissão ou conflitante fica pendente e seu rascunho é preservado.

O navegador guarda uma cópia de trabalho por conta para uso offline. Credenciais e tokens não são gravados nessa cópia. Após entrar offline é necessário entrar novamente conectado para enviar as edições. O botão de recuperação baixa o rascunho, guarda outra cópia local e reabre a versão atual do servidor.

## Preparação do banco

Aplicar uma única vez `supabase/compartilhamento.sql` como migração transacional antes de publicar o frontend. A preparação acrescenta duas colunas opcionais, tabelas auxiliares, políticas e funções. Não faz DML sobre os registros existentes. A própria migração compara contagens e assinaturas de todas as tabelas públicas existentes antes e depois e falha caso detecte alteração nos dados.

Nunca executar os testes SQL com COMMIT. `tests/compartilhamento.sql` deve ser executado dentro de `BEGIN` / `ROLLBACK`, depois do esquema em uma base de teste ou na mesma transação de validação. Os perfis usados no teste são selecionados por função; os registros de teste usam UUIDs novos.

## Verificação

`node --test tests/compartilhamento.test.js` verifica a abertura sem gravações, mudanças de campos específicos, preservação de dados locais, novas entidades, arquivos, comentários por etapa e mesclagem de edições. `npm run build` gera a aplicação.

`tests/browser.html`, servido somente no desenvolvimento, usa dados fictícios e bloqueia solicitações externas. Permite conferir o contador de gravações na entrada e após uma edição real pela interface. Esse simulador não faz parte do pacote de produção.

Os testes SQL verificam edição, concorrência, atomicidade, repetição sem duplicação, grupos sem vínculo, RLS de usuário comum e bloqueio de acesso anônimo. Testes pela interface em produção exigem a conta do usuário; a conta fictícia do simulador não funciona no Supabase real.

## Publicação

Na Vercel, a pasta raiz do projeto é `integracao-vercel`, o comando de compilação é `npm run build` e a saída é `dist`. O projeto continua ligado ao repositório existente.

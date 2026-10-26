# Versionamento de Ofícios

## Estado inspecionado e causa

Em 26/10/2026, o fluxo em Metas → Ofícios era `Oficios.jsx` → `oficios-api.js` → `integracao_oficios_operar` → `integracao_crm_privado.oficio_operar`. O arquivo era anexado ao bucket privado `integracao-oficios`, com `x-upsert=false`; o cadastro guardava somente um registro enviado por número/ano. A ação `resumo` sobrescrevia o texto e `atualizado_em`. Não havia identidade nem histórico de versões. Gerar/baixar um documento já era separado do registro de envio externo.

Consultas somente leitura no ERP `ycdsyilyvaxslkwbkxyo` confirmaram colunas, funções, triggers e políticas atuais. Cadastro e anexação usam `pode_editar_oficios()`; consulta é permitida aos perfis ativos. O bucket não tem política de UPDATE/DELETE aplicável a Ofícios. Essas permissões são mantidas. Não foram consultados conteúdos de ofícios nem alterados registros reais.

Base atualizada para `628dcc38b1b987d42b3ddcda9f90f200ab71da02` (PRs 100/101 preservadas). Vercel consultada: produção READY nesse mesmo SHA, originada de `main`; a PR 101 tem preview por branch. Não há workflows GitHub no repositório. Nenhum checkout de outra tarefa foi alterado. O checkout atual não contém `.agents/skills`; foram seguidos `AGENTS.md`, arquitetura existente e as skills Supabase/Postgres disponíveis. PR 97 não foi retomada nem aplicada.

## Arquitetura e comportamento

- `integracao_oficios` conserva integralmente o original e sua identidade, número/ano e sequência anual. A migration copia cada registro como v1 para `integracao_oficios_versoes`, incluindo autor, datas, resumo e todos os metadados do arquivo. Cadastros posteriores também recebem v1 por trigger.
- A tabela nova guarda snapshots completos de conteúdo/metadados. UPDATE e DELETE são recusados por triggers nas duas tabelas; a ação legada `resumo` passa a recusar a sobrescrita. O cadastro original é mantido num helper privado, sem EXECUTE para os clientes, e continua sujeito às mesmas validações/permissões. Funções privilegiadas ficam no schema privado e o wrapper público continua SECURITY INVOKER.
- A ação `atualizar` usa pedido UUID idempotente, lock por pedido e `SELECT ... FOR UPDATE` no original. A base deve corresponder à última versão; conflito pede revisão. UNIQUE(oficio_id,versao) é uma proteção adicional. Uma repetição do mesmo pedido retorna a versão já salva, inclusive após outra versão posterior. A sequência anual não é alterada.
- A leitura lista um item por original e incorpora somente a versão mais recente, ordenada no banco. O histórico é paginado e começa pela mais recente; permite escolher versões anteriores, consultar autor/data e abrir o arquivo correspondente. IDs externos e vínculos continuam apontando para o original.
- A atualização inicia com as informações existentes. Pode manter o arquivo anterior ou anexar outro em caminho exclusivo; nenhum upload usa upsert. Reutilizar um caminho exige preservar seus metadados. O resumo pode ser editado ou gerado com IA para revisão antes de salvar. Chamadas à IA são explícitas.
- Versões posteriores sempre têm `data_envio=NULL` e aparecem como **Não enviado**. O banco recusa data de envio na atualização. Não há integração de envio nesta mudança, nem marcação manual de envio de v2+. A v1 mantém a data originalmente registrada.
- O pedido em andamento fica guardado localmente antes da gravação. Falha de transporte permite repetir o mesmo pedido; após reload, a lista lê novamente o banco. Uma rejeição SQL comprovada libera a edição. Cancelar sem salvar não cria versão. Arquivos já anexados durante uma atualização cancelada podem permanecer privados e sem vínculo, como no fluxo atual de cadastro; não há exclusão automática que arrisque históricos.

## Alterações de esquema separadas

Somente `supabase/migrations/20261026184153_oficios_versoes.sql`, criada pelo CLI, é necessária. Ela é transacional, bloqueia brevemente novas escritas no original durante o snapshot, acrescenta tabela/índices/RLS, preserva o cadastro e substitui o caminho destrutivo de resumo. Não altera permissões de perfil, dados de CRM/Metas, sequência anual ou objetos de arquivo existentes. A política de leitura do bucket reconhece os arquivos das novas versões para a mesma audiência já autorizada.

**Não foi aplicada ao banco real.** Não executar migrations pendentes em lote nem `supabase db push`. A migration não é um script de reaplicação: consultar o histórico antes de executá-la. Não depende da migration interrompida da PR 97.

## Validação

- SQL/PGlite: snapshot integral de v1; novos cadastros como v1; v2/v3; seleção da última; arquivos antigos e novos consultáveis por outros perfis ativos; autor/data; sequência anual preservada; idempotência; conflito com base antiga; erro sem consumir versão; bloqueios de resumo legado, escrita direta, inativos, metadados alterados e envio fictício; rollback operacional.
- API: paginação de 501 ofícios/versões, ID estável, última versão e payload de atualização.
- PostgreSQL 16.2 local descartável: lock observado em `pg_stat_activity` entre sessões; oito repetições simultâneas retornaram a mesma v2; duas propostas pela v3 produziram uma gravação e uma rejeição; original e sequência preservados. O teste cria seu próprio banco via socket Unix em `/tmp`, não aceita DSN de produção.
- Chrome local: componente e transporte reais com SQL isolado; cancelamento, v2, botão travado durante gravação, resposta perdida e repetição do mesmo pedido, recuperação após reload antes e depois da gravação, v3 com novo arquivo, reload, histórico, download dos dois conteúdos originais, perfil de consulta e layout de 390 px. O adaptador bloqueia toda rede externa. A página de QA usa os estilos reais do App e do módulo.
- Testes completos e build: 919 testes aprovados; build Vite aprovado. QA existente de cadastro/numeração e geração de PDF/Word em desktop/mobile também aprovado. Não há scripts de lint/typecheck. Aviso existente do Vite sobre bundle acima de 2000 kB.

Comandos em `integracao-vercel/`: `npm test`; `npm run build`. Para QA: iniciar `npm run dev -- --host 127.0.0.1 --port 5191 --strictPort`; executar `node tests/oficios-versoes.browser.mjs` (Playwright/Chrome instalados, ou `PLAYWRIGHT_MODULE`). Concorrência: em ambiente temporário com `pgserver==0.1.4` e `psycopg[binary]==3.3.6`, executar `python tests/oficios-versoes.concorrencia.py`. Essas ferramentas de QA não foram adicionadas às dependências da aplicação.

Limites: RLS/SQL foram exercitados em bancos locais, não no serviço Supabase real com migration instalada. O adaptador de navegador verifica o contrato da consulta PostgREST, mas não executa PostgREST/Storage reais. QA autenticado de leitura/arquivo assinado no ambiente alvo é uma etapa de publicação. A autoria aparece pelo identificador estável do perfil. Cada versão tem um arquivo, como o modelo atual. Nenhum ofício real foi atualizado/enviado nesta tarefa.

## Plano exato de publicação — exige autorização específica

1. Revisar e aprovar o PR em rascunho. Revalidar `main`, definições de `oficio_operar`, `pode_editar_oficios`, wrapper, triggers, políticas de Storage e histórico de migrations no ERP. Reconciliar mudanças concorrentes antes de prosseguir. Registrar backup das definições e snapshot dos originais/arquivos por procedimento operacional autorizado, sem divulgar documentos.
2. Após autorização específica para banco, aplicar **somente** `20261026184153_oficios_versoes.sql` como migration `oficios_versoes` em `ycdsyilyvaxslkwbkxyo`. A produção antiga continuará cadastrando v1; sua atualização destrutiva de resumo será recusada com orientação para nova versão. Não executar nada da PR 97 nem reaplicar a migration de Metas da PR 101.
3. Antes do deploy, conferir: quantidade de v1 igual à de originais; comparação de todos os campos copiados (excluindo apenas `oficio_id/versao` e número/ano que permanecem no original); RLS e grants SELECT apenas; helpers privados sem EXECUTE dos clientes; zero arquivos substituídos. Confirmar o relacionamento PostgREST e leitura assinada usando uma sessão autorizada. Se falhar, interromper a publicação e corrigir sem apagar snapshots.
4. Após autorização específica de merge/deploy, mesclar esta PR em `main` e acompanhar o deploy automático Vercel do projeto Integração até READY no SHA aprovado. A mudança requer schema **antes** da nova interface; até lá não publicar a interface em produção. Push da branch/PR pode produzir preview automático, sem promover à produção.
5. No ambiente autorizado, conferir inicialmente somente leitura: último estado, histórico v1 e anexos. Validar criação de v2/repetição/conflito com ofício fictício em homologação, nunca com documento real sem autorização adicional. Conferir reload e perfil sem edição. Envio a terceiros não faz parte da publicação.

## Rollback

Se a transação da migration falhar, o PostgreSQL desfaz tudo; conferir o resultado antes de repetir. Se a aplicação ainda não foi publicada, manter o frontend anterior e investigar, conservando o schema e snapshots já criados.

Depois de haver v2+, usar **somente** `supabase/operacoes/oficios-versoes-pausar.sql` para rollback operacional autorizado: pausa novas atualizações pela função, mantém cadastro de v1, consulta da última versão, histórico e arquivos. Não remover tabela, triggers, arquivos ou restaurar a ação destrutiva `resumo`. Não voltar a um frontend que esconda v2+; manter a consulta atual e preparar correção. Para reativar, restaurar somente a definição de `integracao_crm_privado.oficio_operar(text,jsonb)` da migration aprovada, preservando grants; não reaplicar a migration inteira. O rollback foi testado localmente.

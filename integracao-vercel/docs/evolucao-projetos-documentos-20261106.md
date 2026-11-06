# Estado atualizado em 06/11/2026

Implementacao concluida no codigo local, com retentativas dos editores e limites KMZ corrigidos. Suite completa: 1.060 testes aprovados, zero falhas; build Vite concluido. Validacao visual desktop/iPad permanece bloqueada por erro de sessao do navegador. Nenhuma publicacao ou migracao em producao e afirmada neste registro.

O solicitante autorizou continuar sem confirmar backup recuperavel. Reversao funcional preserva dados, documentos, historicos e numeros reservados; nao equivale a restauracao integral. Pendencias: modelo oficial de Ilhota/Integrado e identificacao conclusiva do cadastro do incidente.

O registro abaixo conserva o historico de implementacao; prevalecem os resultados atualizados em tests/projetos-documentos-QA.md.

---

 Evolução de Projetos e documentos — Integração

Data: 06/11/2026. **Estado: desenvolvimento local; não publicado e não aplicado ao banco de produção.** Este relatório distingue implementação de aceite operacional. Não declara validação completa com usuários reais.

## Ambiente e versão

- Sistema: **INTEGRAÇÃO**, repositório `engjonathanabreu-code/integracao`, aplicação `integracao-vercel` (`integracao-reurb` 0.1.0).
- Base de produção examinada: `a858e5e82fa41b89b2066fa32d4ae6dc80581520`.
- Trabalho isolado: diretório `integracao-evolucao-20261106/integracao-vercel`, branch `codex/projetos-documentos-20261106`. A cópia original do projeto não foi usada como ambiente de escrita ou teste.
- Testes de banco: PostgreSQL em PGlite local, com dados fictícios e definições de colunas/políticas/guards capturadas por consultas somente de leitura. Não se trata de homologação conectada à produção.
- O sistema **Integrado** é uma referência distinta. Não foi tratado como outro nome do Integração, nem modificado. Os modelos municipais oficiais não estavam disponíveis no snapshot examinado.

## Alterações por requisito

| Requisito | Implementação local | Limite de verificação |
|---|---|---|
| 3. GeoJSON para Projetos | Capacidade própria de importação geográfica, independente da etapa Topografia; prévia, validações, persistência confirmada e proteção contra substituição silenciosa. Permissões verificadas na aplicação e em guards de banco. | Aceite com perfil real Projetos em outra sessão aguarda homologação. |
| 4. KML do perímetro | Controle junto ao mapa/área do núcleo; seleção de feições, prévia e armazenamento na estrutura existente; Polygon/MultiPolygon e anéis internos; referências externas e conteúdo ativo não são carregados. | Comparação visual e reabertura final registradas na seção reservada abaixo. |
| 5. Memorial do núcleo | Capacidade específica para Projetos; edição do texto existente com persistência confirmada, conservação de metadados técnicos, prévia e PDF/DOCX pelos exportadores atuais. Conflitos de edição preservam o rascunho. | O caminho de cálculo de memorial do núcleo/vias foi apontado na revisão integrada por ainda conter a restrição antiga; registrar a correção e sua verificação na seção de evidências antes de considerar o requisito integralmente aceito. |
| 6. Unidade do morador | Área e Q_L autorizados por capacidades distintas; ID da unidade preservado; alteração limitada aos campos permitidos, com confirmação de persistência. Q_L reutiliza `unidades[].loteQuadra`, em conjunto com `lote` e `quadra`, conforme o cadastro existente. | Não foi criada base paralela, não houve preenchimento ou recálculo de unidades antigas. Aceite com múltiplas unidades deve constar na verificação integrada. |
| 7. Código ao vincular | Removida a renumeração implícita ao trocar remessa/núcleo; a vinculação reutiliza a identidade existente. Validação exclui o próprio registro/alias canônico, preserva conflitos reais e serializa novas disputas por código. | Há causa técnica reproduzida com dados fictícios; o incidente da requerente mencionada não foi individualmente comprovado. Não houve saneamento. |
| 8. Termos municipais | Modelos por município e variante, revisões imutáveis, controle de versão base, prévia canônica, campos obrigatórios, seleção da unidade exata, geração PDF/DOCX e histórico de emissões com texto congelado. Sem fallback entre municípios. | Texto oficial de Ilhota e demais modelos ausentes devem ser fornecidos/conferidos. Não foram inventadas cláusulas. |
| 9. Qualificações consolidadas | Aba no núcleo com busca por nome/código, paginação, unidade, indicação de lacunas, acesso ao cadastro, cópia individual/selecionados/todos os resultados. Reutiliza a seleção de texto e o gerador individual, incluindo regras de pessoa jurídica e cônjuge não beneficiário. | Consulta somente vínculos explícitos autorizados. Não atribui morador financeiro sem vínculo a um núcleo por coincidência de nome. |
| 10. Ofícios para usuários internos ativos | Autorização de geração separada da edição, assinatura, aprovação, administração de modelos e registro de envio. Reserva atômica/idempotente da numeração antes de exportar, sem registrar envio externo. | Contenção entre duas conexões PostgreSQL reais e aceite de todos os perfis aguarda homologação. |
| 11. Observações na aba Documentos | Card próprio abaixo dos documentos, múltiplas observações, editor estruturado com formatação e checklist interativo, autoria/datas, CRUD persistido, histórico e exclusão confirmada, avisos de edição pendente, controle de versão e autorização no banco. | A aba geral e registros anteriores são preservados. Validação visual desktop/iPad e nova sessão devem ser registrada na seção final. |

## Causa do falso conflito de código

A mensagem relatada é produzida pela comparação de códigos no frontend. No fluxo antigo, trocar a remessa podia solicitar um novo código automático mesmo sem edição consciente do código do morador. Quando esse candidato já existia, o salvamento do vínculo era bloqueado. Esse caminho foi reproduzido com dados fictícios; trocar somente o núcleo, mantendo a remessa e o código, não reproduzia a validação.

A correção conserva código e número quando a intenção é vincular/mudar a remessa. Uma edição explícita do código continua sujeita às validações. O banco acrescenta proteção para novas inclusões ou alterações explícitas, sem bloquear atualizações alheias ao código por conflitos históricos já existentes. Não foi removida uma restrição de unicidade para fazer a mensagem desaparecer.

O diagnóstico encontrou inconsistências históricas de códigos, registradas separadamente em `diagnostico-projetos-permissoes-20261106.md`. Nenhuma identidade foi excluída, mesclada, transferida ou renumerada. Sem identificar o cadastro e os passos exatos do incidente, não se afirma que a requerente mencionada teve seu caso individual resolvido.

## Permissões acrescentadas e conservadas

| Operação | Autorização |
|---|---|
| Importação GeoJSON | Projetos, Topografia e Diretoria, respeitando contrato e escopo já existentes. |
| Mapa/perímetro do núcleo e KML | Projetos acrescentado aos perfis já equivalentes, incluindo Comercial onde já autorizado. |
| Memorial do núcleo | Projetos acrescentado à Topografia/Diretoria; não concede assinatura ou aprovação técnica. |
| Área da unidade | Projetos acrescentado à Topografia/Diretoria. |
| Q_L da unidade | Reutiliza permissão de Projetos/Diretoria e campos atuais; não amplia memorial individual ou outras operações da unidade. |
| Gestão de modelos municipais | Administrador e Diretores, alinhados à gestão documental existente; Comercial não recebe administração por herdar permissões de outro módulo. |
| Emissão de termos municipais | Projetos, Administrador/Diretores e perfis documentais já contemplados: Comercial/Atendimentos, Topografia, Jurídico e Pós-protocolo; ativos, dentro do escopo e do contrato aplicável à gravação. |
| Qualificações | Leitura dos moradores efetivamente vinculados ao núcleo acessível; edição continua no cadastro de origem e segue suas permissões. |
| Geração de ofícios | Todos os usuários internos, ativos e autenticados; demais operações preservam sua autorização anterior. |
| Observações em Documentos | Autor pode editar/excluir as próprias; administradores autorizados gerenciam dentro do escopo. Perfil inativo, fora do escopo ou sem autorização não ganha acesso por chamada direta. |

Setor e etapa são verificados separadamente. As novas capacidades não transformam Projetos em Topografia nem alteram a etapa de moradores ou núcleos. Não há liberação automática de aprovações, assinatura, envio externo ou acesso global a municípios.

## Persistência e preservação

- Migrações aditivas, sem reset, seed, limpeza, renumeração ou atualização automática de cadastros. Dados de produção foram consultados somente para diagnóstico autorizado.
- Termos usam `integracao_termos_modelos` e `integracao_termos_emissoes`, com RLS, revisões e snapshots imutáveis. Autor, horário, município, unidade e texto são reconstruídos/validados no servidor. HTML do cliente não é tratado como conteúdo definitivo.
- Somente uma **emissão explícita** acrescenta referência a `documentosGerados`, conservando todo o array anterior e o critério existente `termo_gerado`. Snapshot e referência são transacionais: falha de autorização/persistência reverte ambos. Retentativa idempotente não duplica a referência. Etapas, checks e aprovações permanecem intactos.
- Qualificações não ganham segunda base. A consulta combina os campos canônicos e o complemento efetivo, com a mesma precedência atual, sem gravar valores presumidos.
- Registros financeiros sem complemento são reconhecidos em leitura, sem criar dados; emitir termo exige vínculo explícito e unidade salva. Aliases inconsistentes ou UF ausente geram diagnóstico, sem escolher/mesclar registros ou presumir SC.
- Observações usam conteúdo estruturado validado, histórico e controle de versão. Registros da aba geral não são duplicados nem reclassificados automaticamente.
- Não foram desativados RLS, integridade ou guards existentes. Os novos RPCs de termos/qualificações usam SECURITY INVOKER.

## Migrações preparadas, não aplicadas em produção

Geradas localmente pelo fluxo da CLI Supabase encontrado no cache do executor. O responsável pela integração deve confirmar que os arquivos finais correspondem aos SQL revisados e que o histórico do destino está compatível.

| Arquivo | Conteúdo |
|---|---|
| `20261106170036_projetos_geometrias_codigos_oficios.sql` | Capacidades/guards por campo, validação geográfica, proteção de conflitos futuros de código e reserva/consumo de números de ofícios. |
| `20261106170046_documentos_observacoes.sql` | Observações do contexto Documentos, conteúdo estruturado, políticas, RPCs e histórico. |
| `20261106170055_termos_municipais_qualificacoes.sql` | Modelos/revisões/emissões municipais, preenchimento canônico, referência transacional documental e consulta consolidada de qualificações. |

Os SQL de origem permanecem em `supabase/operacoes/`. As migrations não semeiam um modelo municipal e não corrigem cadastros existentes.

## Backup, implantação e reversão

**A existência de backup recuperável não foi comprovada nesta sessão.** O nome de um projeto de backup não comprova recuperação. Antes de aplicar qualquer migration em produção é necessário confirmar o backup/PITR e ensaiar restauração em ambiente isolado, registrar o ponto recuperável e validar a preservação/reaplicação de escritas posteriores. Não restaurar um backup sobre a produção ativa descartando dados novos.

Executar primeiro a aplicação e reversão na homologação, com ambiente e versão registrados. O frontend correspondente depende dos novos RPCs; sua publicação deve ser coordenada com as migrations validadas.

Reversões funcionais preparadas:

- `supabase/operacoes/reversao-projetos-geometria-codigos.sql`: suspende novas reservas e retorna novas capacidades ao conjunto anterior, conservando dados, RLS e validações. Mantém consumo de números já reservados. **Não** restaurar o registrador antigo de ofícios, decrementar sequência ou reciclar números.
- `supabase/operacoes/documentos-observacoes-20261106-reversao.sql`: suspende as novas operações sem apagar observações ou histórico.
- `supabase/operacoes/termos-municipais-reversao-20261106.sql`: revoga os novos RPCs e INSERTs, mantendo revisões, emissões e referências já gravadas.

Não usar DROP/TRUNCATE/DELETE para reverter. A versão de contingência deve conservar leitura compatível com os novos dados. Retomar por grants/definições revisadas em nova migration, sem repetir CREATE TABLE sobre o esquema já instalado.

## Testes conhecidos e revisão independente

Todos os testes relatados nesta seção usam dados fictícios. Não foram executados testes de escrita contra registros reais.

| Evidência | Resultado conhecido |
|---|---|
| `node --test tests/termos-municipais-banco.test.js tests/termos-municipais.test.js tests/qualificacoes-nucleo.test.js` | 31 testes aprovados: CAS, idempotência, snapshots, permissões, INSERT direto, unidade/município, qualificação individual/consolidada, paginação, falhas e rollback. |
| `node --test tests/memorial-nucleo-integracao.test.js` | 4 testes aprovados sobre handlers reais extraídos da AST do App: rascunho e base preservados, bloqueio de sobrescrita remota, persistência/falha de rede e permissões de exportação de núcleo. |
| Suíte focal de permissões/códigos/ofícios indicada no diagnóstico da frente | 23 testes aprovados reportados pela frente; inclui RLS, reserva idempotente e reversão com consumo posterior. Não somar com a suíte global sem deduplicação. |
| `qa-build.log` | Uma execução de build concluiu com sucesso e aviso de bundle grande. O log não substitui rebuild após as últimas correções. |
| Suíte global e UI integrada | Preencher com a execução final abaixo. Um log anterior continha teste GeoJSON ainda esperando a restrição antiga; não declarar sucesso global com esse log. |

PGlite usa uma conexão. Chamadas concorrentes serializadas validam resultados e idempotência, mas não comprovam contenção entre conexões PostgreSQL reais. O aceite de concorrência multiconexão pertence à homologação.

A revisão independente encontrou e reportou: bloqueio remanescente no memorial técnico do núcleo, base de comparação incorreta ao salvar texto após sincronização e exigência indevida de `clientes.exportar` no memorial do núcleo. Os dois últimos foram corrigidos pelo integrador e verificados nos quatro testes acima. Registrar a verificação do primeiro antes do aceite completo.

## Evidências integradas — preenchimento pelo responsável final

Esta seção foi reservada deliberadamente; os itens abaixo **não são declarações de verificação concluída**.

| Verificação | Ambiente/versão, comando ou cenário | Resultado e evidência |
|---|---|---|
| Testes globais e verificações estáticas | A preencher após última alteração | A preencher |
| Build final | A preencher | A preencher |
| GeoJSON e KML antes da Topografia, recarga e outra sessão | A preencher | A preencher |
| Topografia preservada; área/Q_L na unidade correta | A preencher | A preencher |
| Memorial textual e técnico do núcleo: criar, salvar, exportar | A preencher | A preencher |
| Código: vínculo sem falso conflito e duplicidade real bloqueada | A preencher | A preencher |
| Termos: municípios distintos, versões, exportação e snapshot antigo | A preencher | A preencher |
| Qualificações: busca, paginação e cópia em conjunto | A preencher | A preencher |
| Ofícios por perfis ativos; numeração e operações restritas | A preencher | A preencher |
| Observações: formatação, checklist, outra sessão, edição/exclusão e rede | A preencher | A preencher |
| API direta sem autorização e sincronização dos módulos compartilhados | A preencher | A preencher |
| Capturas antes/depois desktop e iPad | A preencher | A preencher |

## Pendências reais para aceite operacional

1. Conferir e cadastrar os modelos oficiais de cada município. Para Ilhota, reproduzir a redação oficial relativa às ligações de água/energia por conta do requerente e demais infraestruturas pela Prefeitura, inclusive na modalidade social; a regra informada não foi generalizada.
2. Confirmar o caso concreto relatado em Benedito Novo sem executar saneamento automático. A correção reproduzida de código não comprova os passos daquele incidente específico.
3. Concluir as evidências integradas acima e validar os fluxos com perfis reais autorizados em homologação, incluindo desktop/iPad e mais de uma sessão.
4. Validar concorrência multiconexão e correspondência das policies/contratos do destino com o snapshot examinado.
5. Comprovar backup recuperável, ensaiar reversão com preservação das novas escritas e coordenar a publicação. Até isso ocorrer, o estado permanece desenvolvimento local.

## Referências oficiais consultadas

- RFC 7946: https://www.rfc-editor.org/rfc/rfc7946
- Supabase — Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase — Database functions: https://supabase.com/docs/guides/database/functions
- PostgreSQL — Trigger behavior, execução na mesma transação: https://www.postgresql.org/docs/current/trigger-definition.html

Essas referências orientam formato geográfico, RLS e transações. Não substituem modelos municipais oficiais nem constituem validação jurídica do conteúdo dos documentos.

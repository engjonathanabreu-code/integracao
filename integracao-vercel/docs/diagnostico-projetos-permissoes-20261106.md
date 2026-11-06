# Diagnóstico de permissões e código de morador — 06/11/2026

Base de código: `a858e5e82fa41b89b2066fa32d4ae6dc80581520` do repositório `engjonathanabreu-code/integracao`. Backend consultado: Supabase `ycdsyilyvaxslkwbkxyo`, confirmado pelo código de autenticação. As consultas foram exclusivamente de leitura; não houve DDL, atualização, correção ou exclusão de dados.

As seções de diagnóstico a seguir descrevem a versão de produção examinada. A implementação de desenvolvimento e suas verificações estão na seção final; nada foi publicado por esta frente.

## Restrições comprovadas

- `src/permissoes.js`: `campo` aceita Diretoria e Topografia; `imovel` aceita Diretoria, Comercial e Topografia. `etapa()` relaciona o setor à etapa; não é uma autorização genérica para qualquer ação.
- `geojson/ImportadorGeoJSON.jsx`: importação e vínculo exigem `perm.etapa('topografia') && n.etapa >= 1`.
- `memoriais/MemoriaisNucleo.jsx`: edição exige a mesma combinação. A geração já admite Projeto, mas continua presa à etapa >= 1. A navegação em App também desabilita a aba “Memoriais” antes da Topografia.
- `App.jsx::AbaMemorialNucleo`: edição do texto de perímetro exige Topografia. `AbaMapaNucleo`: KML já existe para Diretoria/Topografia/Comercial; Projetos não vê o botão porque não satisfaz `diretor || campo || estrutura`.
- `App.jsx::AbaUnidades`: a aba é visível; área e memorial são editáveis pela Topografia, enquanto Lote e Quadra já são editáveis pelo Projeto. Conceder área separadamente evita conceder inadvertidamente o memorial individual. A unidade é identificada por ID e sufixo A/B quando há mais de uma.
- Q_L é a coluna de identificação preferencial do GeoJSON, usada na correspondência com `unidades[].loteQuadra`. O cadastro atual também possui `unidades[].lote` e `unidades[].quadra`; a edição recompõe `loteQuadra` como “Lote …, Quadra …”. Não criar uma segunda estrutura.

## Banco e permissões

As tabelas complementares `integracao_moradores` e `integracao_nucleos` têm RLS. A autorização por registro usa `integracao_acesso(referencia_tabela,referencia_id,criado_por)`, com SELECT sujeito às políticas da tabela de origem. A função `integracao_gravar` é SECURITY INVOKER, valida sessão ativa, usa controle de concorrência e idempotência por pedido, e executa escritas sujeitas a RLS.

Há ainda triggers `integracao_atribuicoes_privado.proteger_mutacao` em moradores, núcleos e cadastros financeiros. Eles preservam o contrato de permissões, etapas, validações documentais e exclusão. Não alterar essa infraestrutura para liberar mapas/unidade/memorial; uma proteção adicional por campo deve respeitar os controles existentes.

Políticas atuais de `fin_receb_clientes` e `processos_kanban` já permitem leitura e edição a usuários ativos. Isso é o estado existente, não uma permissão concedida por esta entrega.

As definições de funções, políticas, colunas e índices inspecionadas estão em `tests/fixtures/projetos-permissoes-producao-20261106.json`. É um snapshot de diagnóstico, não uma migração.

## Código de morador: causa técnica e limites

A mensagem literal “Este código já pertence a outro morador.” vem de `src/codigo-morador.js::erroCodigoMorador`. A comparação é global sobre os processos carregados; exclui apenas `p.id === idAtual`.

A operação normal de salvar o cadastro atualiza o objeto encontrado por ID, não cria uma nova pessoa. Alterar somente `nucleoId`, mantendo código e remessa, faz `resolverCodigoMorador` retornar null: não há validação de duplicidade nessa situação.

Contudo, quando a remessa muda, mesmo sem edição explícita do código, `resolverCodigoMorador` pede um novo código automático. Se esse candidato já aparece em outro processo, a vinculação é bloqueada com a mensagem relatada. Reproduzido em Node com dados fictícios: vínculo sem mudança de remessa retornou null; vínculo com mudança de remessa e candidato conflitante lançou a mensagem literal. O código original permaneceu inalterado no teste. Essa renumeração implícita deve ser eliminada do fluxo de vínculo.

**O cadastro específico citado no relato não foi identificado.** Sem a identidade da requerente e as ações exatas realizadas, não é possível atribuir conclusivamente aquele incidente a esse caminho. Há uma causa reproduzível no código, mas não se deve declarar que o caso concreto foi comprovado.

## Inconsistência de dados encontrada, sem saneamento

Benedito Novo possui 51 cadastros financeiros, sendo 11 inativos. Existem três códigos repetidos em duas remessas distintas do mesmo município:

| Código | Cadastros | Ativos |
|---|---:|---:|
| BDN01_0002 | 2 | 2 |
| BDN01_0012 | 2 | 2 |
| BDN01_0018 | 2 | 1 |

Isso não comprova duplicidade de pessoa: são conflitos de código entre registros existentes, cuja origem precisa ser analisada separadamente. Não foram extraídos nomes ou CPFs.

Não foram encontrados complementos duplicados por `referencia_id` nesse município nem divergências entre o código complementar e o código canônico. Não existe UNIQUE por código em `fin_receb_clientes` ou `integracao_moradores`; somente as PKs. Não remover índices ou criar um UNIQUE global sobre dados existentes sem avaliação específica, pois as repetições já presentes impedem tal migração.

Uma defesa incremental pode validar somente INSERT e alteração explícita do código, serializando candidatos com advisory lock e excluindo o próprio UUID. Updates cujo código permanece igual não devem ser bloqueados por conflitos históricos. A mensagem de conflito no servidor não deve revelar dados fora do escopo do usuário.

## Ofícios

`podeEditarOficios` é compartilhado entre geração, registro de envio e atualização de versões. Portanto, ampliar essa função para todos ampliaria indevidamente as outras operações. Criar autorização distinta para geração e usá-la no botão, atalho e API `oficios-gerar`.

A geração atual produz um rascunho PDF/DOCX local e **não reserva número**. O registro de envio é separado: `integracao_oficios_operar` e funções privadas usam lock por pedido e ano, idempotência e confirmação do próximo número. Preservar registro, versões e administração restritos. Caso a entrega trate geração como emissão numerada definitiva, será necessário reservar número com operação própria atômica, sem marcar envio externo.

## Backup e verificação

O catálogo de ferramentas Supabase disponível nesta sessão não expõe consulta de backups/PITR. A existência do projeto chamado `erp_backup` não comprova backup recuperável. Nenhuma migração em produção pode ser considerada liberada com base apenas nesse nome.

Advisories de saúde: nenhum apontamento retornado. Advisories de segurança apresentam alertas existentes em módulos diversos; eles não foram modificados nesta investigação. A inspeção não substitui testes autenticados de API, testes visuais ou validação com perfis reais. Nenhuma dessas validações de escrita foi realizada em produção.

Fontes oficiais consultadas pela equipe: RFC 7946 (https://www.rfc-editor.org/info/rfc7946/) e documentação Supabase RLS (https://supabase.com/docs/guides/database/postgres/row-level-security).

## Implementação local preparada

- `codigo-morador.js`: preserva código e número do morador quando muda a remessa/núcleo sem edição explícita do código; valida códigos realmente editados e exclui a própria identidade com IDs normalizados e alias `financeiroRef`. A identidade do cadastro é reutilizada. Não há saneamento nem renumeração de registros.
- `permissoes.js`: capacidades específicas `mapaNucleo`, `importacaoGeografica`, `memorialNucleo`, `areaUnidade` e `loteQuadraUnidade`. Projetos pode ser identificado pelo tipo ou setor ERP canônico. Não altera `campo`, `imovel`, aprovação, assinatura ou autorização da etapa Topografia. Contratos restritivos continuam aplicáveis.
- Ofícios: `podeGerarOficios` exige perfil autenticado e ativo. Edição, registro de envio e versões continuam com `podeEditarOficios`. A API de IA confirma o perfil canônico. PDF/DOCX passa a reservar número atomicamente antes do download, com pedido persistido no rascunho para repetir com segurança após falha de rede. Outra ação explícita inicia novo ofício. Reservar não registra envio.
- `projetos-geometria-codigos.sql`: guards por campo adicionais, validação de tipos/coordenadas para geometrias novas, preservação do UTM legado, conflitos de códigos futuros serializados, tabela de reservas com RLS e consumo transacional no registro já autorizado. Não contém UPDATE de registros existentes nem conversão de geometria. Funções são preparadas para futuras ações explícitas de usuários.

O executável Supabase CLI não foi encontrado no PATH durante esta frente; o responsável pela integração localizou posteriormente uma cópia no cache npm e centraliza a geração das migrations locais a partir dos SQL revisados em `supabase/operacoes`. Antes de publicar, revisar o diff do banco de destino e aplicar primeiro numa homologação isolada compatível. Publicar os leitores de reservas somente após a migração correspondente.

## Reversão que preserva novas gravações

Antes de qualquer aplicação em produção, verificar backup recuperável e restaurá-lo em ambiente isolado para provar a recuperação. Registrar o ponto de restauração e o procedimento de preservação/reaplicação das escritas posteriores; o nome de outro projeto não atende essa exigência.

`reversao-projetos-geometria-codigos.sql` prepara uma reversão funcional: suspende criação de novas reservas e retorna as novas capacidades ao conjunto anterior, sem apagar geometrias, cadastros, documentos ou reservas. RLS, contratos e validações permanecem. A interface de contingência deve manter leitura dos novos dados e consumo das reservas já emitidas. **Não restaurar a versão antiga de `oficio_registrar_v1`, não decrementar a sequência, não reciclar reservas e não apagar tabelas.** A retomada reintroduz somente os grants e a definição do helper por nova migração revisada.

## Evidência e limites dos testes desta frente

Dados exclusivamente fictícios em Node/PGlite, sem acesso de escrita a produção. A suíte cobre conservação de código/número ao vincular, alias da identidade, conflito real, duplicados históricos preservados, permissões por tipo e setor, contratos/inatividade, autorização da API de ofícios, reserva idempotente, consumo posterior sem recuar sequência, RLS de escopo e chamadas diretas negadas. Geometrias inválidas (tipo, coordenadas, formato numérico, anel aberto e CRS incompatível) são recusadas no banco; alteração de outro campo mantém UTM legado intacto.

PGlite usa uma conexão: as tentativas em `Promise.all` verificam idempotência e resultados serializados, mas **não comprovam contenção entre duas conexões PostgreSQL reais**. A lógica usa advisory locks compartilhados com a sequência existente e UNIQUE em `(ano,numero)` para reservas. A prova multiconexão e o aceite de usuários reais continuam pendentes de homologação. A validação SQL cobre estrutura, tipos, intervalos, fechamento e limites; a validação geométrica topológica completa permanece no importador já testado.

Comando de verificação desta frente: `node --test tests/projetos-guards.test.js tests/projetos-permissoes.test.js tests/codigo-morador.test.js tests/oficios-equipe.test.js tests/oficios-api.test.js tests/oficios-versoes-api.test.js`. Resultado: **23 testes aprovados**, incluindo aplicação da reversão com reserva e número já existentes e consumo posterior autorizado. Build, telas desktop/iPad e integração final pertencem à revisão consolidada. Este documento não declara esses itens verificados por esta frente.

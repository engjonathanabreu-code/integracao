# Termos municipais e qualificações consolidadas

Implementação de frontend, RPCs, RLS e armazenamento imutável preparada sobre `a858e5e82fa41b89b2066fa32d4ae6dc80581520`. O SQL foi executado somente no PGlite isolado com dados fictícios. Não houve aplicação em produção. Os testes locais não substituem a inspeção do ambiente de homologação.

## Qualificações

`QualificacoesNucleo` recebe `nucleoId`, `carregarPagina`, `resolverQualificacao`, `identificarUnidades`, `onAbrir` e `revisao` opcional. `carregarQualificacoesNucleo`, de `qualificacoes-nucleo-api.js`, implementa o loader `({nucleoId,busca,ids,offset,limit})` através do RPC `integracao_qualificacoes_nucleo`. Consulta os cadastros completos autorizados, aplica nome/código ou IDs, ordena por código e ID e retorna `{items,total}`. A consulta segue os vínculos explícitos de `integracao_moradores` ou do complemento legado; não atribui moradores financeiros sem vínculo a um núcleo por nome. A mescla em leitura dá precedência às colunas canônicas, como `projetar()`, sem gravar defaults. Objetos vazios só completam a estrutura necessária ao gerador.

`resolverQualificacaoCadastro(p,gerarQualificacao,modo)` implementa a mesma escolha de texto da aba individual: conserva edições manuais e textos migrados; usa o gerador existente quando não houver salvo; conserva os avisos de dados incompletos e de atualização após edição manual. Na aba individual, substituir apenas a seleção de `texto` e `faltas` pelo helper, preservando `q`, `origem` e demais ações. Na consolidada, passar o mesmo gerador existente, incluindo suas regras de cônjuge beneficiário.

O botão de cópia em conjunto refaz a consulta por IDs; o de todos os resultados percorre todas as páginas. Resultados incompletos, repetidos ou com alteração de total interrompem a cópia. Não há armazenamento de uma segunda qualificação.

## Termos: contrato RPC

`integracao_termos_operar(p_acao text,p_dados jsonb)` usa o usuário autenticado no servidor e verifica atividade, perfil e escopo. Retorna objetos JSON em camelCase.

| Ação | Dados | Resultado |
|---|---|---|
| `listar_modelos` | `{municipioId}` | Array das revisões atuais autorizadas do município |
| `salvar_modelo` | `{pedidoId,id?,municipioId,variante,titulo,corpo,obrigatorios,versaoBase?}` | Nova revisão imutável; `id` de entrada é o ID lógico |
| `listar_emissoes` | `{processoId}` | Array dos snapshots autorizados, mais recentes primeiro |
| `preparar` | `{processoId,unidadeId,modeloVersaoId}` | `{modelo,dados}` com valores canônicos obtidos no servidor |
| `emitir` | `{pedidoId,processoId,unidadeId,modeloVersaoId,textoEsperado}` | Emissão imutável persistida, texto reconstruído no servidor |

Uma revisão de modelo retorna `{id,modeloId,municipioId,variante,titulo,corpo,obrigatorios,versao,ativo?}`. O `id` é o ID imutável da revisão; `modeloId` identifica a família. Salvar nova revisão nunca altera a anterior. `versaoBase` precisa corresponder à versão corrente, com verificação atômica e bloqueio de concorrência. `pedidoId` identifica a operação de salvar ou emitir; repetir a mesma operação retorna o registro anterior e não cria duplicatas, inclusive após falha de rede.

Uma emissão retorna ao menos `{id,processoId,municipioId,unidadeId,modeloVersaoId,modeloId,versao,titulo,texto,emitidoEm,por}`. O servidor valida que o modelo pertence ao município do processo, a unidade pertence ao processo e o núcleo pertence ao mesmo município. A função `preparar` não grava registros. A função `emitir` lê novamente os dados canônicos e o modelo exato, recompõe o texto e compara a `textoEsperado`. Se os dados mudaram, retorna conflito e pede uma nova prévia. Não aceitar texto, HTML, data ou autor enviados pelo cliente como conteúdo definitivo.

Somente na emissão explícita, um trigger adiciona a referência imutável a `documentosGerados` da origem efetiva, mantendo o critério existente `termo_gerado`. O registro é bloqueado para preservar adições concorrentes, e o array anterior é conservado integralmente. Nenhuma etapa, aprovação, check ou campo cadastral é alterado; somente `documentosGerados` e `updated_at`. O append conserva RLS e o guard de contrato atual. Uma falha nessa escrita reverte o snapshot na mesma transação. Repetir o pedido retorna a emissão anterior sem duplicar a referência. Histórico malformado gera diagnóstico, sem conversão automática. O callback opcional `onEmitida(emissao)` permite recarregar o estado pela sincronização existente após confirmar a persistência; não deve salvar uma cópia obsoleta de `p`.

Gestão de modelos: Administrador e tipos `Diretor …`, alinhados à tela existente `ConfigModelos`. Não se utiliza `can_manage_core`, que concede administração também ao Comercial para outros fins. Emissão: Administrador, Diretores, Projeto(s), Comercial, Atendimentos, Topografia, Jurídico e Pós-protocolo, por tipo ou setor, sempre ativos e dentro das políticas de leitura já existentes. O helper `podeGerarTermosMunicipais` corresponde à matriz SQL validada. Ler e baixar uma emissão autorizada não implica poder administrar modelos, assinar, aprovar ou enviar documentos.

## Marcadores e renderização

O catálogo exato é `CAMPOS_TERMO`, em `src/termos-municipais.js`. `dados` é um mapa plano: por exemplo `{'requerente.nome':'…','unidade.area':'120,0450'}`. O preenchimento é uma passagem literal pelo padrão `{{campo}}`; não executa expressões ou recursão de marcadores. Campos desconhecidos e delimitadores incompletos são recusados. Os obrigatórios devem fazer parte do corpo e do catálogo.

- Nome/documento, RG, estado civil, profissão e nacionalidade: campos efetivos do requerente, sem presumir valores.
- Cônjuge: preencher somente quando aplicável segundo as mesmas regras documentais existentes, respeitando `beneficiario !== 'nao'` e o tipo de pessoa.
- `qualificacao`: o servidor reutiliza `qualificacaoRequerente.quali_compromisso`, `qualificacao.textos.compromisso` ou `qualificacao.textos.completa`, nessa ordem. Não reescreve textos manuais. Sem texto salvo completo, o usuário deve gerar/revisar a qualificação individual antes de emitir um modelo que exija esse campo. Qualificações com lacunas `[campo]` ou sublinhados são consideradas incompletas. Uma qualificação marcada desatualizada não é usada como substituta silenciosa.
- Código, área e Q_L: da unidade selecionada, com os mesmos formatos e precisão do cadastro.
- Município, núcleo, modalidade e endereço: somente os registros vinculados. Não assumir REURB-S, nacionalidade, município ou endereço ausentes.
- `data`: data de emissão calculada no servidor em America/Sao_Paulo.
- `observacao`: observação de compromisso já cadastrada, quando houver.

`htmlTermoMunicipal` produz apenas título, parágrafos e quebras de linha com o texto escapado. A prévia e a exportação sempre regeneram HTML a partir do texto persistido. HTML retornado pelo servidor ou introduzido no texto de modelo não é executado. O exportador atual do sistema é recebido via `onExportar({html,titulo,nome,formato,emissao})`; reutilizar `baixarDocumentoCliente` e o timbrado atuais. A emissão é persistida antes do download; um erro ao baixar conserva o snapshot para nova tentativa, sem nova emissão.

## Ilhota e modelos oficiais

Nenhum modelo municipal foi semeado. O texto oficial de Ilhota não estava disponível neste snapshot. A configuração apresenta a regra informada pelo solicitante para conferência com o modelo oficial, sem inventar cláusulas ou estendê-la a outras cidades. A emissão sem modelo municipal cadastrado permanece indisponível com indicação do conteúdo faltante. O termo legado e os documentos já emitidos não devem ser reclassificados ou migrados automaticamente.

## Validação executada neste módulo

- `node --test tests/termos-municipais.test.js tests/qualificacoes-nucleo.test.js`: 15 testes aprovados, com dados fictícios, incluindo o gerador real da aba individual para PF, PJ e cônjuge não beneficiário.
- JSX dos dois componentes transformado com esbuild sem erros.
- Cobertura: separação municipal, snapshots sem mutação, campos ausentes, conteúdo malicioso, marcadores inválidos, precisão decimal, vínculo unidade/município, regra de teste de Ilhota isolada, equivalência com escolha individual, cópia limpa, paginação completa, mudança concorrente e falhas de rede.
- `node --test tests/termos-municipais-banco.test.js`: 16 testes aprovados no PGlite, usando tipos/colunas do snapshot real de 06/11 e políticas de escopo fictícias restritivas. Verificados CAS, identidade e unidade canônicas, idempotência, bloqueio de replay com conteúdo diferente, imutabilidade, INSERT direto sem falsificação de autor/data/versão/conteúdo, acesso cruzado, perfil inativo, banco versus frontend, paginação de 66 moradores, ausência de complemento e UF não presumida. Identidades com aliases inconsistentes são diagnosticadas sem escolher ou mesclar um cadastro. A referência `termo_gerado` foi verificada nos caminhos atual e legado, com o guard de mutação capturado da produção, preservação integral do histórico e rollback quando o contrato nega a edição. A seleção do contrato da fixture é parametrizada; não representa contratos reais de usuários.
- Total da rodada conjunta: 31 testes aprovados. Concorrência CAS validada com chamadas concorrentes encaminhadas ao PGlite; não se afirma teste de carga com múltiplas conexões de produção.
- Integração ao App, exportação final e inspeção visual são verificações da revisão integrada.

## Aplicação e reversão

`supabase/operacoes/termos-municipais-20261106.sql` contém a operação aditiva transacional. A CLI Supabase não estava instalada neste executor; não foi inventado um registro de migration aplicada. Antes de produção, registrar a migration pelo fluxo do projeto, confirmar backup recuperável e ensaiar a aplicação/reversão na homologação.

São criadas duas tabelas com RLS: `integracao_termos_modelos` (revisões com `modelo_id` lógico) e `integracao_termos_emissoes` (snapshots). A aplicação recebe somente SELECT/INSERT nessas tabelas; triggers também recusam UPDATE/DELETE executados pelo dono. Cada INSERT de emissão reconstrói os dados canônicos sob RLS, e cada revisão verifica a versão base sob bloqueio transacional. Todas as funções novas usam SECURITY INVOKER. A aplicação do esquema não atualiza registros de negócio nem documentos legados. Futuras emissões explícitas acrescentam apenas a referência documental descrita acima, usando os privilégios de edição já existentes, sem ampliá-los.

`termos-municipais-reversao-20261106.sql` revoga os dois RPCs públicos e novas inserções, conservando todas as revisões e emissões existentes. A aplicação pode voltar à versão anterior sem apagar os dados novos. A retomada deve restaurar os GRANTs explícitos após validação, e não executar novamente CREATE TABLE sobre o esquema já instalado.

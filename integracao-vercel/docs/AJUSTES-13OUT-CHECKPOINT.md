# Checkpoint de trabalho — ajustes de 13/10

Estado local, ainda não pronto para publicar. Nenhum push, PR, merge, deploy ou aplicação de SQL em produção foi realizado.

Base: main 0bfa14035650ff2d7f128a6e3f7222351b9a0a35. Branch: codex/ajustes-integracao-13out.

| Item | Estado neste checkpoint |
| --- | --- |
| CPF de menores | Regra etária centralizada, cadastro, requisitos e qualificação ajustados; edição rápida do CRM consulta nascimento. Proposta de servidor em supabase/operacoes/cpf-menores.sql, testada somente em PostgreSQL isolado. |
| Verificação humana | Entrada sem IA, responsável, justificativa, histórico e autorização documental existente. Bloqueios obrigatórios continuam exigindo a exceção da Diretoria. |
| REURB municipal | Editor em Município → Regras → Critério REURB; prioridade municipal, fallback legado por núcleo, aviso de divergências; não reenquadra moradores. Resumo recebe municipioId. |
| Ocupantes e IA | Contexto ampliado, seleção explícita, destino por identificador estável, homônimos sem destino automático, cache v2; documentos de ocupantes não satisfazem a identidade do requerente. Falta ampliar QA visual com respostas de IA simuladas. |
| Composição familiar | Quadro padrão cp_familia removido da apresentação e da exigência padrão; respostas anteriores e campos personalizados distintos preservados. |
| Seis meses | Pendente de confirmação do documento. Regra de residência de 90 dias e datas históricas de posse não foram alteradas. |
| Empresa/timbrado | Configuração por município, fallback Integral, Minha Casa Legal exige dados fiscais/endereço/timbrado preenchidos. Resolução para PRF, comerciais, memoriais, termo e seleção explícita nos ofícios. Dados oficiais MCL ainda não recebidos. Falta QA de PDF/DOCX e telas novas. |
| Parcelas nos dois sistemas | Repo financeiro_integral obtido no commit 4c7414267880824f1f1464de18b465770fc2d8c8, branch codex/ajustes-parcelas-13out ainda sem mudanças. Modelo e proposta SQL local financeiro-plano-parcelas.sql com prévia, preservação de pagas/parciais/entrada/boletos/Ailos, versão, auditoria e repetição idempotente; testes isolados. **Ainda sem integração da UI em nenhum dos dois sistemas.** Não altera automaticamente contrato, distribuição, juros ou valores reais. |
| Funil | Componente no CRM institucional: Nuvens → Prospecção municipal até quatro → Reserva/Preparação/Venda por núcleos existentes, múltiplos por município, histórico. Não converte nem duplica cadastros. Outros limites aguardam confirmação. Edição conservadora somente para administradores já reconhecidos; nenhuma ampliação de acesso. Falta QA visual/persistência e revisar adequação do acesso comercial com o modelo existente. |

## Validação realizada

- 852 testes e npm run build passaram antes das últimas extensões de CRM, ofícios e plano de parcelas. Evidência fora do repo: ../../ajustes-page-evidencias/testes-build-final.log. Não representa a suíte completa do HEAD deste checkpoint.
- Depois: 15 testes CRM (incluindo SQL de menores) passaram; 14 testes focados de cadastro, pessoas, empresa, funil e plano passaram; Vite build mais recente passou. Sem chamadas de IA paga.
- Edge local em 1440 e 390: rótulo CPF opcional para menor, quadro familiar ausente, ocupante selecionável e gravação de verificação humana. Sem erros de página. Uma tentativa de fonte Google bloqueada em cada caso; demais chamadas isoladas por fixture. Capturas em ../../ajustes-page-evidencias/documentos-humano-1440.png e -390.png.
- QA local disponível enquanto o servidor estiver ativo: http://127.0.0.1:5178/tests/browser.html (dados fictícios; login teste@example.invalid / fixture). Não usar a entrada normal para testes com credenciais reais.
- Build conserva avisos preexistentes de tamanho de bundle e imports mistos de PDF/DOCX.
- Ainda falta: suíte completa final, UI/persistência do funil e configurações municipais, exportações PDF/DOCX, casos negativos de perfis no navegador, revisão independente do SQL proposto e UI de parcelas em ambos os repos.

## Retomada e isolamento

Não misturar esta branch com a etapa de permissões programada. Para permissões, iniciar outra branch/worktree a partir de origin/main. Os scripts SQL deste checkpoint são propostas em operacoes; não foram registrados nem aplicados como migrations. CLI Supabase não encontrada localmente; antes da publicação, gerar migrations pelo fluxo suportado e concluir revisão.

## Atualização posterior ao checkpoint

As telas de revisão de quantidade/valores foram concluídas nos dois sistemas, com editor compartilhado, prévia, motivo e confirmação explícita. RPC ausente apresenta indisponibilidade; não existe fallback de gravações parciais. A proposta SQL continua local e não foi aplicada.

QA Edge concluído em 1440 e 390: cancelar sem gravação, conflito sem perda, confirmação única, preservação de parcelas pagas/parciais/entrada/boletos e reabertura. No Financeiro Integral, o editor e o adaptador reais foram executados em harness isolado; não foi realizado login financeiro de produção. Perfis Financeiro/Administrador/Diretor de Projetos operacionais e Comercial/Topografia em consulta verificados no Integração com fixture.

Funil: Nuvens → Prospecção → vínculo de núcleo → Reserva/Preparação/Venda, histórico e recarga a partir de backend fictício preservado passaram nos dois tamanhos. Critério municipal salvo e MCL incompleta bloqueada. Não foi configurada empresa real MCL.

PDF/Word: declaração de renda, contrato e distrato; PDF do termo de compromisso, em desktop e celular. Foi corrigida a sobreposição do botão flutuante do agente sobre Baixar PDF no celular. Teste adicional verifica empresa municipal nos metadados de PDF/DOCX. Margens e timbrados existentes cobertos pela suíte. Ainda não é possível validar um timbrado oficial MCL sem o material confirmado.

Suíte Integração mais recente: 856 testes esperados após teste adicional de metadados; conferir log final em ../../ajustes-page-evidencias/testes-build-final.log antes de citar contagem. Suíte Financeiro: 84/84 passaram. Financeiro não possui script build: módulos alterados e server.js passaram em node --check; servidor local atende em http://127.0.0.1:5182. Nenhuma integração de banco, pagamento ou IA real foi executada.

Permanecem pendentes: prazo de seis meses, limites de núcleos, dados/timbrado oficiais MCL, revisão final de risco SQL e geração/aplicação formal das migrations. Nenhum push/deploy autorizado ou executado para este conjunto. Permissões noturnas serão implementadas em ../integracao-permissoes, branch separada codex/permissoes-contrato-noite, baseada em main.

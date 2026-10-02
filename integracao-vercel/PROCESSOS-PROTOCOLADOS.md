# Processos Internos e Processos Protocolados

A página Processos mantém o Kanban interno e acrescenta um fluxo municipal independente com Parecer Social, Notificações, Parecer setor Planejamento, Parecer setor Meio Ambiente, Parecer setor Defesa Civil, Despacho de Saneamento e CRF.

A etapa municipal e o início dessa etapa são colunas próprias em `processos_kanban`. Movimentações geram histórico com `fluxo=prefeitura`, sem alterar `etapa_atual`, fase REURB, moradores, documentos ou checklists. Casos sem etapa confirmada aparecem em Etapa a definir. Comercial e Consulta visualizam; Diretoria e Pós-protocolo movimentam e registram andamentos, respeitando as permissões existentes.

O card permite registrar descrição para o morador, previsão, autorização à IA e observação interna. A observação também é registrada no histórico da equipe com autor e data. Andamentos novos autorizados inicializam a configuração IA somente quando ela ainda não existe; recusas e instruções anteriores são preservadas. O card permite consultar e alterar a configuração do núcleo. O contexto do Chatwoot exige identidade confirmada, atendimento do núcleo habilitado e andamento autorizado; não inclui observações internas.

Migração: `20260930173755_processos_protocolados_prefeitura.sql`. Aplicada no ERP INTEGRAL Interno em 30/09/2026. Nenhuma nova tabela ou permissão pública. Função de inicialização em schema privado, SECURITY INVOKER e sem execução direta por anon/authenticated. Verificação de segurança não apresentou novos alertas.

Inicialização dos dados autorizados pelo usuário: 259 núcleos classificados a partir dos andamentos e das linhas reconciliadas da planilha Acompanhamento Pós Protocolo, com histórico e origem. Casos ambíguos ou de retorno a projeto ficam sem classificação automática. Não se presume data de entrada na etapa. Todos os valores de etapa interna foram conferidos antes/depois e permaneceram iguais.

Validação: 598 testes aprovados e compilação concluída. Chrome com dados fictícios para Administrador, Diretor de Projetos, Pós-protocolo, Comercial e Consulta; navegação entre abas, sete colunas, teclado, movimentação, andamento, observação, histórico, autorização anteriormente desativada e largura 390px. Fluxo real `integracao_gravar` testado com permissões da Diretoria dentro de transação revertida.

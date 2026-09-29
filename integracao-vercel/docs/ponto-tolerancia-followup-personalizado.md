# Tolerância de ponto e prazo personalizado de FollowUp

## Folha de ponto

A partir de 29/09/2026, a jornada CLT com horários fixos abona atrasos de até 5 minutos na primeira entrada e antecipações de até 5 minutos na última saída. O limite é inclusivo e avaliado com precisão de segundos. Quando uma extremidade excede o limite, o desvio dessa extremidade é considerado integralmente. O abono máximo é 10 minutos por dia e não cobre pausas adicionais.

A apuração preserva horários originais e revisados, tempo efetivamente trabalhado, horas extras, decisões de aprovação e ajustes manuais. O abono aparece no saldo e no CSV, separado do tempo trabalhado. Jornadas flexíveis, dias sem jornada, dias incompletos e dias anteriores à vigência mantêm a regra anterior.

A migração altera somente o trecho do saldo na função existente, preservando a versão em produção que também atende jornadas flexíveis. O corpo atual foi validado em PostgreSQL isolado, com a mesma migração, antes da aplicação.

## CRM

As sugestões de 1, 2 e 4 dias permanecem. O mesmo campo oferece calendário (data futura) ou quantidade inteira de 1 a 3650 dias. São dias corridos, calculados pelo calendário de Brasília e mantendo o horário do registro. A data é convertida em dias ao enviar o formulário.

Disponível no FollowUp comercial, no FollowUp institucional e no primeiro agendamento do cadastro institucional. A conclusão e o próximo prazo continuam atômicos, preservando permissões, idempotência, histórico e bloqueios de concorrência e arquivamento.

## Verificação

501 testes automatizados e compilação aprovados. Fluxos de navegador verificados em 1440 e 390 pixels: sugestões, quantidade personalizada, calendário, conclusão com resumo, histórico e cadastro institucional. Migração de ponto testada também com o corpo atual da função de produção, incluindo preservação da jornada flexível.

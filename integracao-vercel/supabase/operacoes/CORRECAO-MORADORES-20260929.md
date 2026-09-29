# Correção de conflito falso no cadastro de moradores

A comparação integral de integracao_moradores.dados rejeitava até alterações iguais ou independentes. A migração moradores_mesclagem_sem_conflito combina base, edição local e banco por campo, incluindo objetos aninhados.

Valores locais inalterados preservam o banco; alterações iguais convergem; campos independentes são combinados. Alterações incompatíveis no mesmo valor, arrays concorrentes e exclusão versus edição continuam retornando PT409. Ausência de chave e null são distintos.

Mantém transação, bloqueio de linha, identidade imutável, RLS e recibos idempotentes. A função auxiliar é SECURITY INVOKER, sem acesso a tabelas e sem EXECUTE público/anônimo.

Os testes moradores-mesclagem.test.js verificam reprodução do defeito, mesclagem aninhada, proteção contra perda de atualização, atomicidade, RLS, usuário inativo/anônimo e idempotência. Resultados e rascunhos de contas reais devem permanecer privados.

A confirmação da gravação e a atualização do navegador são etapas independentes. A correção complementar do frontend persiste o recibo antes de ler novamente, retoma falhas transitórias automaticamente e tolera fichas antigas indisponíveis durante a reconciliação. Não limpar armazenamento local nem importar snapshots completos para contornar avisos.

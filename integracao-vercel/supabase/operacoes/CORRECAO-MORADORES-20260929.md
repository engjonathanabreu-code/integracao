# Correção de conflito falso no cadastro de moradores

Ativa em produção pela migração Supabase 20260929145521_moradores_mesclagem_sem_conflito.

A fila preservada de Marcelo enviava um documento completo em integracao_moradores.dados. Desde sua leitura, o banco tinha recebido apenas checks.apresentacao=true, exatamente o mesmo valor contido no rascunho. A comparação integral rejeitava a operação e, por atomicidade, impedia também as demais 54 operações.

A RPC agora combina as três versões (base, edição local e banco) por campo, incluindo objetos aninhados. Valores locais inalterados preservam o banco; alterações iguais convergem; campos independentes são combinados. Alterações incompatíveis no mesmo valor, arrays concorrentes e exclusão versus edição continuam retornando PT409. Ausência de chave e null são distintos.

O ajuste se limita a updates de integracao_moradores na coleção processos. Mantém a transação, bloqueio de linha, identidade imutável, RLS, recibos idempotentes, inserts, exclusões e comparação das demais colunas. A função auxiliar é SECURITY INVOKER, sem acesso a tabelas e sem EXECUTE público/anônimo.

Validação: 480 testes passaram, incluindo reprodução do defeito antes da migração, mesclagem aninhada, proteção contra perda de atualização, atomicidade, RLS, usuário inativo/anônimo e idempotência. O registro real exportado foi comparado ao banco em teste local, sem incluir dados pessoais no repositório. As 55 operações passaram também em transação revertida, com papel authenticated e identidade do titular.

A fila original foi posteriormente gravada com o mesmo pedido e repetida com sucesso pelo recibo, sem duplicação. O arquivo contém edições posteriores ao lote; elas permanecem no rascunho do navegador e devem seguir o fluxo normal após sua confirmação. Não importar o snapshot completo nem limpar armazenamento local.

Na tela já aberta, “Tentar salvar novamente” confirma o pedido salvo, recarrega os dados e permite processar edições posteriores. A correção do servidor não exige publicação de frontend. A inspeção da tela no dispositivo de Marcelo não foi realizada.

Auditoria de segurança antes/depois sem novos apontamentos. Migração criada pela CLI e renomeada para a versão efetivamente registrada pelo MCP em produção.

# Mesclagem segura de alterações

A comparação integral de documentos JSON pode bloquear alterações compatíveis. A migração modulos_mesclagem_sem_conflito estende a mesclagem por campo aos módulos compartilhados de núcleos, municípios, remessas, metas, planos, ordens de serviço, calendário e complementos de usuários.

Campos independentes e valores iguais convergem. Alterações incompatíveis no mesmo campo, arrays concorrentes e exclusão versus edição continuam retornando PT409. RLS, bloqueio de linha, identidade imutável, atomicidade e idempotência permanecem ativos.

Os testes modulos-mesclagem.test.js reproduzem o comportamento anterior e verificam mesclagem aninhada, reenvio, conflitos reais, isolamento de usuários e rollback do lote. As regras específicas de leitura do chat e das notificações permanecem independentes.

Os scripts auditar-sincronizacao-contas.sql e auditar-leituras-contas.sql permitem validação operacional por identidade. Exigem acesso administrativo para enumerar contas, executam os cenários como authenticated e revertem as alterações em subtransações e ROLLBACK externo. Os resultados dessa execução devem ser mantidos em ambiente privado.

Configurações, ponteiros de arquivos e colunas canônicas mantêm as regras anteriores. Não descartar rascunhos locais para solucionar avisos; divergências reais exigem revisão.

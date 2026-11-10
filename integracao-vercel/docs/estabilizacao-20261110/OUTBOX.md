# Outbox v2 — expansão preparada, não implantada

A migration 20261110143311 cria somente um schema privado, configuração, fila e RPCs exclusivas de service_role. RLS está ligada, sem grants para anon/authenticated. Não copia registros existentes e não habilita envio. O corte começa NULL; habilitar exige um corte explícito. Nenhuma tabela financeira/CRM ou RPC antiga é substituída.

Cada conteúdo é persistido por chave estável antes do claim. A chave de convite inclui item/sequência; resumo inclui hash do destinatário/dia/fuso. Conteúdo diferente com mesma chave é recusado. O claim transacional com SKIP LOCKED grava estado enviando, lease e tentativa. O provedor recebe corpo congelado e Idempotency-Key. Só um recibo externo não vazio permite finalizar como enviado e atualizar a linha antiga na mesma transação.

Timeout, 5xx ou crash após claim não autorizam novo envio. Lease expirado vira incerto. A resposta do provedor pode ter sido aceita; o resultado precisa ser reconciliado antes de qualquer nova tentativa. 429 usa Retry-After/backoff, até cinco tentativas. Recusas determinísticas ficam bloqueadas. Itens bloqueados/incertos não consomem as 40 vagas das próximas consultas.

A retenção de idempotência da Resend é de 24 horas: https://resend.com/docs/dashboard/emails/idempotency-keys. Portanto, o estado incerto não pode ser automaticamente liberado após esse prazo. Não há purge nesta expansão.

## Validação local

Worker com provedor simulado: concorrência, repetição confirmada, timeout após aceite, falha ao persistir recibo, 429, recusa determinística, deadline e chave por destinatário/dia. PostgreSQL 17.6 com duas conexões reais: claim exclusivo, finalização e atualização do registro legado, autorização e estado incerto após lease. Tabelas/políticas auxiliares são sintéticas, não uma cópia da produção.

## Ativação pendente

1. Revisar corte, permissões, migration e ambiente. Não retomar PR 97/migration interrompida.
2. Homologar os dois endpoints HTTP e a recuperação assistida com o protocolo completo; ausência de erros no worker não basta.
3. Interromper os consumidores antigos durante a transição e aguardar a janela de execuções em voo. Um envio antigo sem recibo precisa ser classificado; não presumir falha.
4. Aplicar expansão desabilitada e publicar consumidor compatível em ordem coordenada.
5. Somente com autorização de envio, definir corte posterior à cessação do consumidor antigo e habilitar piloto sintético. Não liberar envs/backlog nesta tarefa por efeito colateral.
6. Histórico anterior ao corte exige inventário, prévia, autorização seletiva e ferramenta de recuperação ainda pendente. A migration não o libera.

Rollback: desabilitar envio e manter o consumidor v2 ou fazer forward fix. Recolocar o sender antigo diante de registros incertos permite duplicação e não é rollback seguro. Reverter o banco para snapshot também não é aceitável. A expansão pode permanecer sem uso; não apagar recibos.

## Limitações que impedem rollout

Ainda falta a ferramenta de reconciliação de resultado incerto com evidência do provedor e envio seletivo autorizado. A integração SQL usa service_role como o worker anterior, mas os demais consumidores externos e os efeitos do corte não foram validados em produção. Nada foi enviado nem ativado.

# Outbox v2 — expansão preparada, não implantada

A migration 20261110143311 cria somente um schema privado, configuração, fila e RPCs exclusivas de service_role. RLS está ligada, sem grants para anon/authenticated. Não copia registros existentes e não habilita envio. O corte começa NULL; habilitar exige um corte explícito. Nenhuma tabela financeira/CRM ou RPC antiga é substituída.

Cada conteúdo é persistido por chave estável antes do claim. A chave de convite inclui item/sequência; resumo inclui hash do destinatário/dia/fuso. Conteúdo diferente com mesma chave é recusado. O claim transacional com SKIP LOCKED grava estado enviando, lease e tentativa. O provedor recebe corpo congelado e Idempotency-Key. Só um recibo externo não vazio permite finalizar como enviado e atualizar a linha antiga na mesma transação.

Timeout, 5xx ou crash após claim não autorizam novo envio. Lease expirado vira incerto. A resposta do provedor pode ter sido aceita; o resultado precisa ser reconciliado antes de qualquer nova tentativa. 429 usa Retry-After/backoff, até cinco tentativas. Recusas determinísticas ficam bloqueadas. Itens bloqueados/incertos não consomem as 40 vagas das próximas consultas.

A retenção de idempotência da Resend é de 24 horas: https://resend.com/docs/dashboard/emails/idempotency-keys. Portanto, o estado incerto não pode ser automaticamente liberado após esse prazo. Não há purge nesta expansão.

## Validação local

Worker com provedor simulado: concorrência, repetição confirmada, timeout após aceite, falha ao persistir recibo, 429, recusa determinística, deadline e chave por destinatário/dia. PostgreSQL 17.6 com duas conexões reais: claim exclusivo, finalização e atualização do registro legado, autorização e estado incerto após lease. Tabelas/políticas auxiliares são sintéticas, não uma cópia da produção.

## Ativação pendente

1. Revisar corte, permissões, migration e ambiente. Não retomar PR 97/migration interrompida.
2. Os três testes HTTP locais de concorrência/deduplicação/configuração passaram com transporte simulado. Ainda homologar o protocolo completo e a recuperação assistida com consumidores e banco; ausência de erros no worker não basta.
3. Interromper os consumidores antigos durante a transição e aguardar a janela de execuções em voo. Um envio antigo sem recibo precisa ser classificado; não presumir falha.
4. Aplicar expansão desabilitada e publicar consumidor compatível em ordem coordenada.
5. Somente com autorização de envio, definir corte posterior à cessação do consumidor antigo e habilitar piloto sintético. Não liberar envs/backlog nesta tarefa por efeito colateral.
6. Histórico anterior ao corte exige inventário, prévia, autorização seletiva e ferramenta de recuperação ainda pendente. A migration não o libera.

Rollback: desabilitar envio e manter o consumidor v2 ou fazer forward fix. Recolocar o sender antigo diante de registros incertos permite duplicação e não é rollback seguro. Reverter o banco para snapshot também não é aceitável. A expansão pode permanecer sem uso; não apagar recibos.

## Limitações que impedem rollout

Ainda falta a ferramenta de reconciliação de resultado incerto com evidência do provedor e envio seletivo autorizado. A integração SQL usa service_role como o worker anterior, mas os demais consumidores externos e os efeitos do corte não foram validados em produção. Nada foi enviado nem ativado.

## Recuperação seletiva implementada em 10/11

`server/recuperacao-outbox.js` e `scripts/recuperar-outbox.mjs` fornecem prévia de IDs explícitos (até 20), mascarando destinatários e omitindo conteúdo. A confirmação de um resultado incerto exige recibo consultado no provedor e correspondência de remetente, destinatários, assunto, corpo e janela do claim. A gravação de confirmação usa versão da prévia e registra hash da evidência em auditoria transacional. O helper não chama endpoint de envio.

Modos: `previa`, `confirmar-recibo`, `previa-legado`, `autorizar-legado`. O arquivo JSON de seleção deve informar IDs; confirmação inclui `id`, `versao`, `reciboId`. Autorização histórica exige um único ID numérico, versão, `referenciaAprovacao` e `confirmado:true`. É uma autorização de envio posterior pelo worker quando habilitado, não um teste inofensivo. Credenciais são fornecidas explicitamente via `RECUPERACAO_SUPABASE_URL`, `RECUPERACAO_SERVICE_ROLE` e, para consulta externa, `RECUPERACAO_RESEND_KEY`; não existem defaults de produção nem leitura automática de .env.

Nenhuma autorização histórica, consulta de recibo real, reconciliação ou envio real foi executado. A fila de produção tinha 76 pendentes e nenhum enviado registrado na leitura agregada anterior à implantação. A expansão continua desabilitada, sem corte e sem autorizações. Ativar futuros envios ou selecionar históricos é operação posterior específica; a publicação não drena essa fila.

A migration de recuperação e os testes substituem a limitação anterior de ausência de ferramenta. Persistem os limites de correspondência do recibo externo: prova insuficiente não permite reenviar; deve permanecer incerto.

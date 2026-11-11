# Auditoria da confirmação e propagação

Base inspecionada: a72a2ca. Comparação: 2c4255a. Nenhuma operação em produção ou navegador de usuário.

## Evidência reproduzida

1. Campo `processos.comercial.entrada`: entrada textual `500,00`; `prepararEdicao` produz `fin_receb_clientes.valor_entrada = 500`; `projetar` retorna `500`; `alteracoesConfirmadas` rejeitava. A gravação simulada e releitura usaram as funções reais da aplicação e fixture. É falso conflito de representação, não diferença de valor.
2. Campo `usuarios.setor`, usuário vinculado a profiles: mudança de diretoria para comercial gera complemento `integracao_usuarios.dados.setor`; projeção considera setor canônico de profiles e devolve diretoria. Confirmação rejeita. Não corrigir com aceitação automática: comando de perfil precisa respeitar sua fonte canônica. A frente de acesso já trabalha separadamente nisso.

Esses casos demonstram defeitos de contrato existentes. Não identificam o payload específico do usuário em produção. O diagnóstico conhecido de usuários/LEITURA_DIVERGENTE é compatível com a classe 2, mas não prova esse campo.

## Por que acumula e parece não propagar

O envio já é automático: mutate agenda flush em 250 ms. A fila oferece durabilidade, idempotência e recuperação. Não é simplesmente ausência de tentativa de envio.

Após recibo, a aplicação exige releitura dos campos iguais à intenção. Após cinco falhas, a retentativa fica suspensa. A fila bloqueia operações posteriores no mesmo recurso ou dependências. Além disso, `materializar` sobrepõe intenções não terminais à base remota, inclusive aquelas com recibo aguardando leitura. Assim valores locais podem permanecer visíveis acima dos valores atuais de outros usuários.

Há atualização via websocket de integracao_revisoes e fallback de 120 segundos. Avisos aguardam edição em andamento terminar; falha/busy reagenda avisos. Isso não prova ausência de falha no realtime de produção, que exige medição autenticada.

A igualdade após o recibo também não distingue uma gravação efetivada de outra alteração legítima posterior no mesmo campo. Sem versão/resultado do commit, aceitar tudo seria esconder conflito e rejeitar tudo mantém pendência falsa. Requer contrato transacional com revisão/resultados canônicos.

## Comparação entre publicações

O diff 2c4255a..a72a2ca altera classificação por fase, preservação de recibos, revisão, avisos e diagnóstico. A exigência de confirmação por releitura e o limite de cinco falhas já existiam. Portanto não há evidência para afirmar que a72a2ca criou todos esses problemas ou que rollback isolado os resolveria. O diff pode mudar visibilidade/classificação; a causa de cada item exige dados do item e contrato correspondente.

## Correção local limitada

`confirmacao-mutacoes.js`: reconhecer somente representação canônica dos cinco campos numéricos financeiros já codificados, vinculando ao mesmo ID do cliente e mesma coluna/valor da operação persistida. Não comparar números frouxamente em outros campos, não arredondar, não modificar dinheiro, fila ou banco. Testes negativos preservam divergência real, operações de outro registro, outro valor e campo não codificado.

Escopo desta correção: edições de campos financeiros existentes. Não declara resolver todos os casos, não é correção global da fila nem autoriza liberar antigas pendências sem reconciliação.

## Caminho server-first seguro

- Interface envia ao servidor imediatamente e só confirma sucesso após commit; fica explícito quando a ação ainda não foi salva.
- Outbox durável privada continua como proteção contra queda, com mesma identidade/idempotency key, e não como estado autoritativo da tela para sempre.
- Servidor retorna resultado canônico e revisão por entidade no mesmo contrato transacional que produz o recibo.
- Atualização visual/cache/realtime é fase separada do sucesso da gravação. Divergência posterior é classificada pela revisão, nunca reenvia pedido confirmado.
- Permissão/validação gera erro específico e mantém rascunho recuperável, sem bloqueio de recursos independentes.
- Fila existente migra por item, preservando original, recibo e dependências. Recibos são conciliados; pedidos incertos consultam recibo antes de retry; recusados não são descartados em massa. Não limpar IndexedDB/cache.

## Liberação e reversão

Sem publicação até completar revisão independente, testes de duas sessões, perda de resposta após commit, duplicação, sessão expirada, edição concorrente e reconciliação dos itens antigos. Canary controlado antes de distribuição. Reverter apenas aplicação não deve apagar filas nem recibos; manter compatibilidade de protocolo. Migration de servidor futura precisa estratégia própria compatível e autorização. Este patch é somente cliente e não exige migration.

## Integração das frentes e validação

A frente cliente reproduziu e corrigiu também a segunda intenção: base local `500,00`, novo valor `600,00`, leitura `500` causava PT409 falso. Helper `contrato-financeiro.js` centraliza encode/projeção/comparação restrita. Preparação usa cópia, sem reescrever originais nem payload já enviado. Integrado do commit aca853a (local 5e7fdaa).

A frente servidor consultou a definição live e executou cópia em PGlite isolado: transação/rollback e idempotência funcionaram; replay não sobrescreveu alteração posterior. Recibo só possui aliases, não pós-trigger/versão. 47 regressões de backend passaram (relatório separado dessa frente).

30 testes focados integrados passaram. Antes da integração, suíte completa 1220/1220 e build Vite passaram. Suíte completa final: 1222 testes aprovados, zero falhas; build Vite aprovado (aviso já existente de chunk grande).

Teste adicional `diario-contrato-financeiro.browser.cjs` cobre duas intenções na fila IndexedDB, sequência de expected 400/500, resultado 600 e preservação dos originais. As 16 jornadas de navegador não iniciaram neste executor: binário padrão Playwright ausente; Chromium instalado também termina antes da página com socket() Operation not permitted, inclusive após escalonamento autorizado. Logo teste E2E não validado e publicação bloqueada. Não foi usada sessão pessoal do usuário.

Limites: revisão manual previa/resolver continua exigindo comparação estrita; criação de registro inteiro não abrangida pela correção de folha financeira; setor/perfil deve usar contrato canônico e revisão de acesso. Não declarar solução definitiva do incidente com este patch isolado.

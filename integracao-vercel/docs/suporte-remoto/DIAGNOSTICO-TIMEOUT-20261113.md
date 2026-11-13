# Executor sem contato — investigação local de 13/11/2026

Base remota verificada: `main`, commit `c1dbf54a22ac2a46edea43776ee6c7840e875870` (PR 111). Checkout independente em `suporte-executor-20261113`, branch local `fix/suporte-executor-timeout-20261113`. A investigação e os testes iniciais foram exclusivamente locais, sem alteração de banco. Posteriormente, Jonathan autorizou commit, envio, integração e publicação da correção pelo fluxo normal do repositório. A conferência anterior à publicação confirmou main remoto e produção ainda em c1dbf54, sem mudanças concorrentes. CI, PR e implantação efetiva devem ser conferidos nas evidências da publicação; essa autorização não comprova resolução de pendências individuais.

## Evidência do incidente e grau de certeza

Foi informado que às 09:14 de São Paulo (12:14 UTC), Francine tinha telemetria das 09:12, seis pendências e contato do executor das 08:54, com envio de comandos desabilitado. Vanessa também tinha telemetria recente e executor antigo. Versão informada: `v8784e27-sync-v4`. São evidências fornecidas pelo solicitante, não novas leituras desta investigação. Não foi comprovada a causa nos aparelhos nem resolvida qualquer pendência real.

## Defeitos confirmados e correção

`requisicao` combinava o sinal da sessão com `options.signal || AbortSignal.timeout(25000)`. O executor sempre passa um sinal, portanto o timeout era omitido. `buscarREST` criava outro timeout, mas o sobrescrevia ao espalhar `options`. Uma requisição sem resposta, inclusive durante o corpo, podia ficar pendente, mantendo `emCurso=true` e bloqueando os próximos passos dessa instância.

A renovação compartilhada da autenticação também só usava o sinal da sessão. Uma espera sem resposta, inclusive em `r.json()`, podia manter `refreshing` e bloquear os consumidores.

Os oito testes novos reproduziram os problemas antes da correção: contato/autorização/revalidação/conclusão presos, renovação sem deadline e GET com sinal externo sem avançar à segunda tentativa. Cancelamento e troca de conta já passavam. Isso comprova defeitos do código, sem atribuí-los ao incidente real.

`transporte-rest.js` agora combina cancelamento externo e timeout de 25 segundos em cada tentativa, incluindo o corpo. `dados-compartilhados.js` preserva sinais da sessão/chamador e delega o timeout REST ao transporte. A renovação recebe timeout próprio de 25 segundos com o sinal da sessão. O cancelamento individual de um consumidor não cancela a renovação compartilhada dos demais.

Não há liberação artificial de `emCurso` por relógio nem corrida contra uma execução ainda viva. O `finally` existente libera o executor após término/rejeição do transporte. Timeout solicita cancelamento do fetch; não comprova rollback no servidor. POSTs continuam sem repetição automática. Autorização perdida permanece em `vistos`, sem novo efeito. ACK perdido não é reenviado nem convertido em sucesso. Falha após início mantém as regras de resultado incerto. A recuperação testada permite novo contato normal, sem repetir comando incerto.

Nenhuma modificação em filas, arquivos, cópias, payloads, recibos, autorização exclusiva de Jonathan, critérios de presença ou migrações. Nenhuma nova dependência, SQL administrativo, comando de suporte ou acesso a tela/terminal de funcionário.

## Telemetria e presença do executor

`DiagnosticoSincronizacao.jsx` relata contagens a cada 120 segundos com conexão e `diagnosticoPronto()`, sem exigir visibilidade nem fornecer sinal externo. Essa requisição já tinha timeout antes da correção. `SuporteRemotoExecutor.jsx` agenda passos a cada 30 segundos e em `online`/`visibilitychange`; o executor exige conexão e aba não oculta, sessão válida e vínculo persistente.

Logo, aba oculta pode continuar relatando contagens e deixar de contatar o suporte. É hipótese plausível, não comprovada nos aparelhos. Abas também podem ser suspensas pelo navegador.

Na RPC de listagem, `ultimo_relato` vem de `integracao_sincronizacao_dispositivos`; o contato do suporte vem de `integracao_suporte_privado.dispositivos` quando vinculado. A associação é declarada pelo aplicativo, não atestação física. O painel e o servidor exigem contato autêntico de suporte de até 120 segundos e protocolo compatível, além das demais autorizações. Telemetria recente não substitui contato. O bloqueio informado é consistente com essas guardas e não deve ser contornado com heartbeat sintético.

## Diário e vínculo

`diagnosticoPronto()` exige diário existente, abertura encerrada e baseline disponível: `!!diario.current && !opening.current && !!server.current`. A guarda é compartilhada pelos dois canais. Relato recente indica prontidão naquele momento e instalação, não comprova estado atual ou sucesso do executor.

A abertura inclui migração do diário, leitura da base, hidratação e recuperação de arquivos. Espera persistente em armazenamento, abertura em andamento ou baseline ausente podem impedir contato. O patch cobre REST e renovação, sem deadlines artificiais em efeitos do diário.

`suporte-remoto-vinculo.js` usa IndexedDB separado, transação atômica e prova por conta. Erro/quota/bloqueio/vínculo inválido falham sem fallback volátil nem substituição da identidade existente. Se uma operação IndexedDB nunca emitir evento, a espera também pode persistir. Esse risco não foi reproduzido nem alterado; liberar o executor enquanto a transação ainda pode gravar não seria uma correção segura. Não se regenerou prova nem se migrou vínculo.

## Validação e limites

- Direcionados: `node --test tests/suporte-remoto-timeout.test.js tests/transporte-rest.test.js tests/suporte-remoto-executor.test.js`: 27/27 passaram, incluindo oito regressões novas com módulos reais e fetch/sinais de prazo controlados.
- Suíte completa: `npm test`: 1.348/1.348 testes aprovados, zero falhas/cancelamentos/skips; duração de 282,65 segundos. Evidência: `test-timeout-suite.log`.
- Build: `node node_modules/vite/bin/vite.js build`: aprovado; aviso de tamanho de chunks. Executado diretamente para não repetir a suíte já em andamento.
- Lint/tipos: não há scripts declarados nesta base.
- Três jornadas de Chromium tentadas (`suporte-remoto-vinculo`, `suporte-remoto-interface`, `diario-suporte`): navegador não iniciou por `socket() failed: Operation not permitted`, seguido de SIGABRT. Não são aprovações de comportamento em navegador. O harness restringia transporte a localhost.
- Dependências copiadas de instalação local com lockfile idêntico, em diretório próprio. Checkouts antigos preservados.

`AbortSignal.timeout` mede tempo ativo: suspensão de documento/worker pode pausar o relógio. Não há garantia de contato em aba suspensa, oculta, offline, com sessão inválida ou IndexedDB indisponível. A versão já carregada não recebe a correção automaticamente. Atualização continua exigindo fluxo local seguro; não forçar recarga.

Após eventual autorização específica de publicação, validar contato autêntico recente, sessão, vínculo e prontidão no aparelho autorizado. Só então o operador exclusivo pode solicitar diagnóstico técnico e conferir pedidos por recibo/releitura. Não repetir confirmados ou operações de resultado incerto. A resolução das seis pendências e a propagação a outro aparelho exigem evidência aparelho-servidor; fixtures não comprovam isso.

Referências consultadas: [sessões Supabase](https://supabase.com/docs/guides/auth/sessions), [timeout do navegador](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) e changelog Supabase. Nenhuma alteração em contrato de banco/SDK.

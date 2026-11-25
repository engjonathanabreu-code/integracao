# Conflitos de negócio sem repetição no PostgREST — 25/11/2026

## Causa

O PostgREST 14 trata o SQLSTATE `40001` como falha transitória e repete a transação inteira.
Quando a função recusa de propósito (versão ou revisão divergente), a recusa se repete a cada
tentativa e a requisição não termina. Em 28/09/2026 isso foi corrigido em `integracao_gravar`
(`supabase/migrations/20260928152249_conflitos_sem_retry.sql`), trocando o código por `PT409`,
que o PostgREST devolve como HTTP 409 sem repetir. Seis funções continuavam com `40001`.

## O que muda

`supabase/migrations/20261125135233_conflitos_negocio_sem_retry.sql` troca somente o literal
`'40001'` por `'PT409'` em:

| Função | md5 do corpo antes | Literais |
| --- | --- | --- |
| `public.integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid)` | `53fb35c55a6a560b8ddea6db37ada23c` | 1 |
| `public.integracao_documental_alternar(boolean,bigint)` | `af3673f98553b7dbf42c8ebb0fa54e3f` | 1 |
| `public.integracao_documentos_observacoes_operar(text,text,jsonb)` | `617587e13ef73d5360c54ed3f6e8bee2` | 2 |
| `integracao_documentos_observacoes_privado.proteger()` (gatilho) | `2ac1ffcbab6a9242daf7121d943b3479` | 1 |
| `public.integracao_mailing_salvar(text,bigint,jsonb)` | `f82f3e6070e9252a5e283efd3d1c9b15` | 3 |
| `public.reorder_plan_steps(uuid,uuid[],uuid[])` | `0411647835ba76f881c5da2f5e99bcf1` | 1 |

A migration lê a definição viva (`pg_get_functiondef`), substitui o literal e a executa. Mensagens,
validações, permissões, dono, ACL, `security definer`, `search_path` e dados não mudam.

É tudo ou nada, em uma transação com `lock_timeout` de 5 s: cada função precisa existir com o md5
acima e com a quantidade esperada do literal. Qualquer divergência aborta antes da primeira
alteração. Reaplicar falha avisando que a correção já está instalada; não há modo idempotente.

`reorder_plan_steps` não tem chamador no Integração; entra para que nenhuma função exposta
mantenha o padrão.

## Por que o cliente não muda

- Mailing, fluxo documental e atribuições exibem a mensagem do servidor (`error.message`), que
  continua a mesma. Nenhuma dessas telas consulta o código `40001`.
- Observações de documentos (`erroObservacao`) reconhece o conflito pelo texto da mensagem
  ("Conflito de versão…"), que não muda. A lista de códigos dessa função ainda cita `40001` e
  `409`, não `PT409`; o reconhecimento depende portanto do texto. Fica registrado como ponto de
  atenção, sem alteração nesta entrega.
- `erroConcorrencia`, `rejeicaoDefinitiva` e a classificação da fila já tratam `PT409` e HTTP 409
  como conflito. O transporte não repete gravações recusadas.

## Validação executada

Sem acesso a produção; tudo em PGlite com os arquivos do repositório.

- `tests/conflitos-negocio-sem-retry.test.js`: as seis definições geradas pelos arquivos do
  repositório têm o md5 esperado; depois da migration cada recusa de conflito sai com `PT409` e a
  mesma mensagem; corpo muda só no literal e oid, ACL, dono, `security definer` e `search_path`
  ficam iguais; reaplicar falha sem alterar nada; a reversão restaura o corpo idêntico; função
  divergente ou ausente aborta sem alterar nenhuma outra (migration e reversão).
- O segundo `raise` de `integracao_documentos_observacoes_operar` ("Confira a observação atual")
  não é alcançável em teste sequencial (a linha já está travada com a versão conferida); a troca
  do literal nele é verificada pelo corpo, não por execução.
- `tests/mailing-browser-fixture.js` passou a simular a resposta real (HTTP 409 com `PT409`).
- `npm run build`: 1.622/1.622 testes e build Vite concluído. `npm run test:browser`: 96/96 jornadas.

Não validado: comportamento do PostgREST real diante de `PT409` nessas funções (a referência é
o comportamento já observado em `integracao_gravar`) e os md5 em produção, que a própria
migration confere ao ser aplicada.

## Reversão

`supabase/operacoes/conflitos-negocio-sem-retry-reversao.sql` devolve o literal `'40001'`. Só age
se as seis funções estiverem exatamente como a migration deixou; caso contrário aborta sem alterar
nada. Reverter reintroduz a repetição sem limite nas recusas de conflito.

## Aplicação em produção — 25/11/2026

A migration foi aplicada com autorização específica e o arquivo foi renomeado para a versão registrada (`20261125135233`); o SQL não mudou. Conferido em seguida no banco: as seis funções sem o literal `'40001'`, com a quantidade esperada de `'PT409'`, corpo igual ao original com o literal trocado (md5 conferido), e ACL, dono, `security definer` e `search_path` inalterados; o gatilho de observações continua ativo.

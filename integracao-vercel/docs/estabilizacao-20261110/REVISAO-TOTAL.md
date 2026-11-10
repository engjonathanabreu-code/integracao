# Revisão transversal da sincronização — 10/11/2026

## Escopo e referência

Revisão da versão publicada eb77918, no repositório engjonathanabreu-code/integracao, branch codex/estabilizacao-20261110. Inspeção da fila, diário, migração, projeção, confirmação, arquivos, sessão e contratos de testes dos módulos consumidores. Todas as reproduções de escrita utilizaram dados fictícios, IndexedDB e servidores locais. Nenhuma alteração em registros reais, migration, PR 97 ou envio de mensagens foi realizada nesta revisão.

O baseline congelado executou 57 jornadas de navegador: 41 passaram e 16 falharam. Parte dos testes estava ligada à fila antiga, a textos ocultos, nomes anteriores de navegação ou fixtures que não implementavam os contratos atuais. Esses testes foram atualizados; a investigação também revelou defeitos reais que a suíte de unidade não detectava.

## Defeitos corrigidos

1. **Reimportação após atualização:** o mesmo rascunho legado podia ser rejeitado porque a nova extração exclui presença local. A migração reconhece uma entrada compatível já persistida, preserva seu checksum e não recria pedidos. Conteúdo divergente continua preservado para revisão.
2. **Revisão invalidada por outro registro:** a confirmação da prévia comparava a base inteira. Agora compara os registros da intenção; alteração no registro em revisão continua exigindo nova conferência.
3. **Substituição entre abas:** a criação da nova intenção e a substituição da antiga eram transações separadas. Agora ocorrem em uma única transação IndexedDB; outra aba que concluiu a revisão impede a criação de uma substituição órfã. Falha/abort mantém a intenção original.
4. **Exportação durante persistência:** uma intenção podia sair da lista volátil depois do snapshot persistido e ficar fora da cópia. A exportação captura primeiro as intenções em gravação e elimina duplicações pelo ID.
5. **Confirmação de arquivos:** recibo sem releitura correspondente podia consumir a fila. A confirmação exige chave, tamanho, hash e caminho esperados, e verifica todos os arquivos antes de consumir o lote. Gravação de nova versão e confirmação são serializadas no contexto da conta.
6. **Versões sucessivas de arquivo:** uma edição podia manter a base anterior à própria gravação precedente e provocar conflito artificial. A preparação avança a base apenas por dependências próprias confirmadas, inclusive quando a edição foi criada entre duas confirmações. Mudanças de outra origem continuam sujeitas à comparação do servidor.
7. **Retomada contendo somente arquivo:** a ausência de alterações em entidades podia encerrar a intenção sem reenviar o arquivo. Arquivos pendentes agora impedem esse encerramento.
8. **Cadastros novos já gravados permanecendo pendentes:** município, remessa e núcleo recebem a marca de origem ERP na projeção. A confirmação reconhece somente a transição conhecida de origem vazia para ERP, mantendo a verificação dos campos de negócio e de qualquer origem explícita.
9. **Meta nova com histórico/anexos:** horários gerados no servidor e a conversão da chave local para o caminho de armazenamento causavam falsa divergência. As regras dos filhos também se aplicam a pais novos. O caminho do arquivo deve coincidir exatamente com a operação enviada, que inclui o hash dos bytes; nome, tipo, tamanho, vínculo e autoria permanecem conferidos. Recibo não causa reenvio da escrita.

## Testes e prevenção

- `diario-resiliencia.browser.cjs`: migração, prévia independente, prévia alterada, exportação concorrente, revisão por outra aba, substituições simultâneas, abort transacional, retomada só de arquivo e versões sucessivas/intercaladas.
- `arquivos-confirmacao.test.js`: releitura ausente, lote parcialmente divergente e nova edição durante persistência da confirmação.
- `arquivos-intencoes.test.js`: avanço somente por predecessores confirmados, substituição, remoção e base efetiva de edição intercalada.
- `confirmacao-mutacoes.test.js`: projeção real de novos município/remessa/núcleo; meta com histórico e anexos; negativos de conteúdo, identidade, autoria, horário inválido e caminho/hash divergente.
- Jornadas existentes atualizadas para o diário v2, consulta incremental do CRM, autorização de exportação, reserva idempotente de ofícios e fluxos atuais de metas. Asserções de permissão, persistência e dados continuam presentes.

Comandos reproduzíveis em `integracao-vercel/`:

```sh
npm ci
npx playwright install chromium
npm run build
npm run test:browser:sync
npm run test:browser
```

Playwright 1.57.0 é dependência de desenvolvimento, fixada no lockfile. O executor abre Vite local, utiliza dados fictícios e bloqueia HTTP/WebSocket externos nos navegadores. Relatórios e capturas ficam em `test-results/browser/`, ignorado pelo Git. `BROWSER_TEST_OUTPUT` permite escolher outra pasta. `BROWSER_TEST_PLAYWRIGHT_MODULE` permite usar uma instalação local já existente.

O workflow `.github/workflows/sincronizacao.yml` executa build/testes e as jornadas de navegador em PR e push para main, sem segredos de produção. Ações têm revisões fixadas. Esse workflow acrescenta uma verificação; **não configura sozinho proteção de branch nem bloqueio de promoção na Vercel**. Nesta publicação, a validação local precede o push autorizado.

## Publicação e reversão

Publicar somente depois das verificações locais, por push não forçado para main, verificando que o remoto continua em eb77918. Não há alteração de esquema nem necessidade de restaurar banco. Referência de reversão: deployment anterior dpl_H2CEaDpGCMWhWVVb4RFWWhy7g1YM e código eb77918. Uma reversão deve preservar IndexedDB e os rascunhos; correção aditiva é preferível se houver novas revisões persistidas.

## Limites

Os testes exercitam Chromium em larguras de desktop/celular; não representam Safari/iOS/Android físicos nem o armazenamento particular de Marcelo ou de outros colaboradores. Erros legítimos de permissão, conflito real entre pessoas e indisponibilidade continuam preservando alterações para revisão. A nova lógica não altera permissões nem confirma valores divergentes para remover avisos.

Não foi necessário repetir migrations ou testes PostgreSQL de duas conexões: nenhum SQL/RPC mudou nesta revisão; esses contratos tinham sido validados na etapa anterior. A validação nova de concorrência usa IndexedDB real. A consulta somente de leitura aos erros de execução da hospedagem na janela de uma hora não retornou ocorrências; isso não prova ausência de erros de navegador. Lint e typecheck dedicados não estão declarados no package.json. Permanecem os avisos conhecidos de bundle grande/importações no build.

Validação local: 1.180 testes passaram, zero falhas, build Vite concluído. As 58 jornadas distintas de navegador passaram, com repetição das duas falhas transitórias de execução conjunta descritas no JSON. Identificação da publicação e evidências consolidadas em `REVISAO-TOTAL-RESULTADOS.json`.

Publicação operacional confirmada: 4201afc, deployment dpl_DhPBEufHbx1dYgR7dfH5GdmZoLf2 READY, alias público HTTP 200 e marcadores do código conferidos. A hospedagem repetiu os 1.180 testes sem falhas. A primeira execução GitHub passou 56/58 jornadas; as duas falhas eram verificações de teste (medição de layout e classificação de RPCs de leitura). Ambas foram ajustadas e passaram localmente; uma nova execução independente será registrada no relatório de publicação. O código da aplicação não foi alterado por esse ajuste de testes.

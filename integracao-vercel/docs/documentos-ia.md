# IA da aba Documentos do cliente

Estas otimizações são opt-in para a aba Documentos do cliente. Cadastro inicial,
campo, devolutivas e agentes continuam no contrato e modelo global anteriores.

## Modelos e ativação

- `OPENAI_DOCUMENT_MODEL`: modelo da análise documental e padrão do OCR.
- `OPENAI_DOCUMENT_OCR_MODEL`: override opcional apenas do OCR documental.
- Sem override documental, permanece `OPENAI_MODEL` ou `gpt-6-astra`.
- Para usar Sol em ambas as etapas, configure `OPENAI_DOCUMENT_MODEL=gpt-6.1-sol`.
  Não é necessário alterar `OPENAI_MODEL` nem criar o override de OCR.
- Uma alteração na Vercel só vale para o deployment que incorporar o código e
  essa configuração. Não há chave de API ou escolha livre de modelo no browser.

O endpoint autenticado `documentos_config` informa somente modelos e versão.
Cada análise compara essa configuração novamente; mudança durante o fluxo
retorna conflito explícito, sem usar uma combinação antiga de modelos.

## Reaproveitamento seguro

- Cache somente em memória enquanto a aba estiver montada, sem localStorage,
  IndexedDB ou armazenamento de arquivos/transcrições no banco.
- A chave considera SHA-256 dos bytes originais, tipo MIME, usuário/sessão,
  processo/permissões, cadastro, regras, tipos, data, modelos e versão do pipeline.
- A configuração é consultada com autenticação antes de cada reaproveitamento.
- Troca de contexto, perda de acesso, logout/fechamento ou limpeza da lista
  invalida o cache e impede aplicar respostas tardias.
- Até 20 entradas e 8 MiB de cache, reutilizáveis por até 15 minutos. Esses são
  limites de memória: quando atingidos, descarta-se cache; nunca se bloqueia a
  análise nem se corta conteúdo por limite financeiro.
- Cliques simultâneos compartilham uma operação. Resultados idênticos não
  duplicam o histórico da mesma análise.
- PDFs grandes mantêm internamente páginas de OCR já concluídas após falha.
  Somente uma análise final completa é aplicada. Arquivos falhos ficam na fila.

## Integridade e medição

Todas as páginas/imagens continuam sendo enviadas no fluxo visual existente,
preservando a leitura de assinaturas, carimbos e rasuras. Não há OCR local que
substitua automaticamente imagens. A aba deixa de omitir regras após a vigésima;
entrada excessiva falha explicitamente. Respostas JSON malformadas ou que omitam
regras aplicáveis não entram no cache e preservam o original para nova tentativa.

`usage` mantém a última resposta por compatibilidade. Nas chamadas documentais,
`usage_attempts` registra cada tentativa e `usage_total` soma os valores conhecidos,
incluindo retries. A telemetria de servidor contém apenas etapa, modelos,
status e contagens; não contém nomes, conteúdo, impressões digitais ou tokens de
autenticação. Tentativas sem contagem informada usam `null`: o custo pode existir
mesmo quando a API não retorna `usage`. Logs incluem tanto OCR quanto análise;
o `usage_total` de uma resposta corresponde apenas àquela chamada HTTP e seus
retries, não ao documento inteiro.

Os limites de saída e a política de retry anteriores são mantidos. Economia real
deve ser medida por uso observado; não decorre automaticamente de limitar saída.
Os testes são mockados. Qualidade em documentos reais e compatibilidade da conta
com o modelo precisam ser validadas separadamente, sob autorização apropriada.

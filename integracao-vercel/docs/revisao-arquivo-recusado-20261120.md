# Revisão explícita de arquivo privado recusado

## Defeito comprovado e escopo

A revisão normal substituía a intenção recusada, mas preservava o `expected` antigo do arquivo. Novo pedido repetia o PT409; descendentes corretamente aguardavam. Esta mudança não automatiza a escolha nem altera a retomada normal.

O novo botão aparece **somente** para PT409 comprovado na fase de envio, sem recibo, exatamente um arquivo privado cujo ID/caminho/autor pertencem à sessão, sem edição de dados, sem remoção, sem legado e sem substituição prévia. Payload, original e bytes precisam concordar. Arquivos públicos, lotes, múltiplas pessoas e escopo desconhecido são recusados. A existência de pendências não comprova elegibilidade: confirme a prévia real.

## Fluxo local

1. Na mesma conta/aparelho com os originais, abra Pendências de sincronização > Revisar esta alteração.
2. Confira chave, tamanho e SHA-256 local e servidor. O botão usa o original **deste pedido**, não o mais novo da cadeia.
3. Escolha “Preservar as duas cópias e substituir este arquivo” e confirme.
4. O app consulta o recibo exato do pedido/payload original. Recibo existente ou falha da consulta bloqueiam substituição. Confirmada a ausência, baixa o remoto usando a própria sessão/RLS, verifica bytes/hash, guarda ambos integralmente no store IndexedDB `originais`, e confere o conteúdo por uma nova transação de leitura.
5. Relê o servidor e exige igualdade com a prévia. Só então enfileira nova intenção com auditoria e cópia anterior. Original/ checksum não são alterados; substituição e dependências são atômicas.
6. A gravação usa o RPC normal, autorização normal, recibo e releitura normal. Nenhum comando remoto, refresh forçado, senha administrativa ou bypass.

## CAS exato e descendentes

O RPC existente reconcilia JSON em três vias, logo apenas mudar expected não bastaria para exigir igualdade integral. Uma primeira operação conserva updated_at e coloca os metadados completos em expected, sem dados em changes. Assim a comparação é exata e adquire o lock; a segunda operação aplica dados com updated_at em expected-only (bloqueia inclusive ABA só de timestamp), e a terceira aplica o carimbo normal, na mesma transação. Mudança concorrente aborta tudo, sem recibo. Conteúdo idêntico também percorre guarda/recibo, sem duplicar arquivo.

A guarda não altera updated_at. O trigger de revisão auxiliar (verificado separadamente, somente leitura em produção) poderá incrementar sua versão três vezes, atomicamente; não altera campos do arquivo. Não há migration ou nova permissão.

Filhos só atravessam A→B após predecessor confirmado com recibo, vínculo recíproco substitui/substituidaPor, checksum original e bytes/version/base preservados. Aceitar mera leitura remota não ganha essa autorização.

## Recuperação e limites

A cópia separada está em originais e também na intenção substituta. Exportar o diário inclui ambas e o original recusado. O código não coleta nem elimina o store originais, nem exclui intenções confirmadas. Isso sobrevive a recarga/fechamento, mas não à limpeza dos dados do navegador: exporte a cópia antes de limpar ou trocar de aparelho. Falha de quota/readback aborta sem enfileirar. Restauração é revisão manual a partir da cópia, não novo overwrite automático.

Se a substituição for novamente recusada, ela não oferece outra exceção automática. Não foi realizada recuperação real. Não há afirmação de que casos reais cabem neste escopo sem examinar suas prévias locais autorizadas.

## Validação

Testes sintéticos cobrem checksums, bytes, conta/tipo/escopo, resultado incerto, recibos, concorrência durante backup, falha de persistência, duas gerações de sucessores e mesmo conteúdo. PostgreSQL PGlite executa RPC/migrations reais: guarda exata contra mudança concorrente, RLS, atomicidade, idempotência e recibos canônicos para três operações da mesma linha.

A branch está desabilitada para deploy Vercel nos dois arquivos de configuração. PR draft serve apenas para revisão/CI; não autoriza merge, deploy ou recuperação.

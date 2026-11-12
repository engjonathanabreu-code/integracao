# Leitura das intenções de Metas

## Problema reproduzido

O diário usava a carga completa de tabelas tanto para preparar quanto para reler uma intenção de Metas. Uma falha de leitura em uma tabela alheia, como mensagens do chat, rejeitava essa carga mesmo quando a leitura da meta e de seus filhos estava disponível. O recibo continuava preservado, mas a confirmação e as intenções dependentes podiam aguardar uma leitura que incluía essa tabela sem relação com a edição.

Isso foi reproduzido em servidor fictício com HTTP 503 em mensagens e dados de Metas disponíveis. Não identifica a causa de uma pendência real sem o pedido e a prévia atuais.

## Alteração limitada

O callback de carga do diário usa os grupos `metas`, `usuarios` e `auxiliar` somente quando há ao menos uma edição da coleção `metas` e todas as demais edições pertencem a `metas` ou `auditoria`. Intenções vazias, de arquivos apenas, de outras coleções ou mistas continuam usando a carga completa.

- `metas`: registro canônico, setor, responsáveis, checklist, comentários, histórico, anexos e complementos.
- `usuarios`: perfis e complementos; a presença de `profiles` mantém a leitura nova do contrato autenticado, além do diretório.
- `auxiliar`: arquivos compartilhados, notificações e auditoria.

A base anterior dos grupos alheios é conservada pelo mecanismo de carga parcial já existente. A abertura e o refresh geral não foram alterados. Falhas de tabelas necessárias, perfil, contrato ou sessão continuam interrompendo a operação. Não há migração, nova permissão, tratamento de ausência como sucesso, normalização de valores ou alteração da identidade dos pedidos.

## Validação

- Dois testes unitários do seletor cobrem o caso exclusivo, os grupos necessários e os casos de fallback completo.
- Os testes focados de leitura de fichas e Realtime permanecem aprovados: 12 testes no conjunto executado.
- Uma jornada com hook e IndexedDB reais cobre sete cenários isolados: Metas com auditoria, histórico e anexo diante de chat indisponível; falha de checklist; perfil recusado; contrato recusado; troca de sessão; leitura necessária recusada após recibo, recuperada sem reenvio; e intenção mista conservando carga completa.
- A jornada confirma contrato novo na preparação e na releitura, um único upload do anexo e preservação da intenção original nos casos recusados.
- Rede externa bloqueada, dados e credenciais fictícios. Nenhum cadastro ou fila real foi acessado ou modificado por esses testes.

O build e as jornadas completas do conjunto devem ser executados após integrar este commit às demais correções. Não foram executados novamente neste trabalho isolado. Não há scripts de lint ou tipos no pacote inspecionado.

## Reversão e limites

Reverter este commit restaura a carga completa no callback do diário; nenhuma fila, cópia, recibo ou registro precisa ser apagado ou restaurado. Não há publicação neste trabalho.

O escopo restrito é deliberadamente conservador. Uma intenção de Metas que também altera outra coleção continuará dependendo da carga completa até que esse caso tenha seu conjunto de dependências mapeado e testado. Este ajuste não confirma recuperação de aparelhos reais nem garante propagação para outra sessão sem observar a leitura dessa sessão.

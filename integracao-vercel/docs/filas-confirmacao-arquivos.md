# Filas de arquivos e revisão de recibos

## Escopo

Correção do cliente sobre `07d5dadf`. Não altera SQL, RLS, credenciais ou contratos de gravação. Não limpa bancos locais nem descarta intenções automaticamente.

- Uma edição captura somente arquivos referenciados pelos registros alterados, incluindo os valores anteriores em remoções e a chave implícita de KML de um núcleo.
- Eventos de arquivo congelam somente a versão alterada. Recuperação na abertura e antes do envio registra arquivos separados, sem duplicar a mesma versão já coberta por uma intenção.
- Intenções antigas ainda não preparadas/enviadas podem receber `escopoArquivos` versão 1. O escopo limita arquivos e dependências automáticas comprovadamente indevidas, sem alterar `original`, checksum ou dependências históricas exportáveis. O escopo é persistido transacionalmente antes de inferir sucessores ou preparar o envio.
- Dependências explícitas, mesma unidade, identidades criadas/referenciadas, leases ativos e pedidos já enviados continuam protegidos. Payloads fixados sem esse escopo não são reinterpretados. Lotes somente de arquivos mantêm seus arquivos.
- Erros de upload e leitura do Storage preservam o status HTTP, inclusive quando a resposta não é JSON. Uma recusa 403 deixa de parecer falha de rede e não recebe repetição automática. A verificação de sessão e as regras de permissão continuam iguais.

## Recibo não significa valor atual

A confirmação automática ainda exige recibo e releitura dos campos/arquivos enviados. Divergência nunca causa uma nova gravação com outro ID.

A prévia usa o mesmo contrato da confirmação, inclusive os adaptadores financeiros, datas e IDs. Isso identifica também o retorno ao valor base, remoções e divergência somente de arquivo, que não aparecem necessariamente como conflito de três versões.

O usuário pode repetir somente a leitura ou reconhecer explicitamente os valores atuais. O reconhecimento relê a informação e recusa a decisão se os campos/arquivos mostrados mudaram. A decisão e o recibo ficam arquivados com o original. Ela não afirma que o conteúdo enviado permanece atual, não reenvia dados e não autoriza uma versão posterior de arquivo a sobrescrever conteúdo concorrente.

Abertura e refresh hidratam apenas as fichas referenciadas por intenções pendentes, usando a sessão atual. Uma carga resumida não é interpretada como exclusão. Consulta vazia autorizada mantém a ficha ausente; erro de leitura não vira ausência nem libera nova gravação.

O overlay mostra valores remotos nos campos conflitantes, preservando alterações locais compatíveis. Recibos cuja leitura comprovadamente divergiu não reaplicam o snapshot enviado sobre a leitura atual. O conteúdo local continua disponível na revisão e exportação.

O reconhecimento ou descarte explícito consome somente a mesma versão do arquivo na fila auxiliar. Versões posteriores são preservadas. O cache não associa bytes antigos a um caminho remoto diferente. Se essa atualização local falhar após a decisão durável, a próxima abertura/retomada completa a reconciliação da mesma versão, sem reenvio.

## Validação

Executar `npm test`, `npm run build` e `npm run test:browser` contra o commit final. A suíte de navegador bloqueia rede externa e usa fixtures locais. Os testes específicos cobrem isolamento de arquivos, intenções antigas, escopo e checksum, reload, substituição, recibo divergente, prévia obsoleta, quota, sessão e preservação de versão posterior.

O ajuste de teste da PR 108 foi reaproveitado: comparação dos originais financeiros por ID, não pela ordem diferente entre exportação IndexedDB e listagem de processamento. As configurações de deploy daquela branch não foram copiadas.

Não inferir que pendências reais foram resolvidas a partir desses testes. Essa confirmação exige observar a fila no aparelho/conta afetados após publicação autorizada, sem escolher valores conflitantes por conta própria.

## Publicação e rollback

Antes de push/PR, confirmar o fluxo de deploy. Se for necessária CI isolada, impedir deploy da branch de validação na configuração Vercel e usar a imagem Playwright fixada do workflow existente. Não misturar mudança permanente da configuração de produção à correção.

Antes de produção: revisar o diff final, verificar CI do SHA exato, registrar o deployment/commit atual e obter autorização para publicar. Validar primeiro uma conta/dispositivo autorizado; não limpar IndexedDB, localStorage ou filas para simular sucesso.

Rollback: voltar o deployment/commit anterior, preservando os bancos locais e recibos. O campo adicional de escopo não muda o schema IndexedDB. Um cliente anterior pode voltar a aguardar dependências históricas, mas deve continuar mantendo o original e o payload fixado. Reabrir abas com a mesma versão evita comportamento misto durante validação.

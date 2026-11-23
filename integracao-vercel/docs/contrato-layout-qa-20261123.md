# Contratos compactos: validação de layout (23/11/2026)

Escopo: contratos novos explicitamente marcados com `data-documento="contrato"`. Não altera cláusulas, modelos salvos, dados ou outros documentos. O marcador é emitido pelo montador comercial. Contratos personalizados/extensos podem precisar de mais páginas: não há corte de conteúdo nem escala automática ilegível.

## Parâmetros
- A4, corpo 11 pt, entrelinha 1,1; no Word, entrelinha exata de 12,1 pt para evitar expansão dependente do processador.
- Margens laterais 20 mm, respeitando acréscimos configurados; topo/base preservam a proteção do papel timbrado.
- Parágrafos com 2 pt após e sem recuo; títulos de cláusulas junto ao texto seguinte.
- Data e assinaturas consecutivas juntas; cada assinatura indivisível. Sem página vazia artificial.
- Outros documentos seguem 12 pt, entrelinha 1,5 e margens anteriores.

## Evidências
Dados exclusivamente sintéticos, nomes/CPFs fictícios, timbrado padrão, contrato integral vigente. Individual e casal com duas qualificações/assinaturas; valor de R$ 6.000, entrada R$ 1.200 e 12 parcelas de R$ 400.

| Saída | Individual | Casal |
| --- | --- | --- |
| PDF nativo | 3 páginas | 4 páginas |
| DOCX renderizado no LibreOffice | 3 páginas | 4 páginas |

LibreOfficeDev 26.8; Word usa substituição métrica Liberation Serif neste ambiente (Times New Roman é a fonte pedida no arquivo). Paginação no Microsoft Word não foi diretamente testada. A contagem depende dos dados, fonte disponível, timbrado e modelo; não é promessa para textos arbitrários.

Onze testes de layout/exportação passaram. O script abaixo renderiza os dois formatos, verifica limites e compara cada trecho textual do modelo com o texto extraído dos PDFs, incluindo o render do Word. Espaços e quebras são normalizados; `pdftotext -layout` preserva hífens de fim de linha. Nenhuma cláusula foi cortada. Revisão visual das páginas inicial/final verificou texto legível, separação do timbrado e assinaturas completas. PDF conserva fontes padrão não incorporadas, como anteriormente; a aparência fina pode variar entre leitores.

```sh
node --test tests/contrato-layout.test.js tests/documento-docx.test.js tests/documentos-formatacao.test.js
node scripts/validar-layout-contrato.mjs /tmp/contrato-layout-qa-final
```

O segundo comando requer `soffice`, `pdfinfo` e `pdftotext`; gera somente arquivos locais sintéticos e falha se ultrapassar 3/4 páginas ou faltar texto. Artefatos da validação em `/tmp/contrato-layout-qa-final`.

Histórico: a base local era shallow; consulta ao histórico após aprofundar 35 commits encontrou apenas a base consolidada para os arquivos de exportação, sem referência verificável do layout anterior de 3/4 páginas. Não houve restauração por suposição. A referência verificável é o modelo integral atual e a meta de páginas solicitada. Nenhum push/deploy realizado.

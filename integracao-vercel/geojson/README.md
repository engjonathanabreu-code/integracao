# GeoJSON de lotes e áreas

Em Clientes → município → núcleo → Mapa, **Importar GeoJSON** lê o arquivo local e pede o campo de código das feições. A prévia não grava dados. Após confirmar, o levantamento fica no JSONB do núcleo (`levantamentoGeoJSON`), com autor, data, EPSG, vértices e códigos. Cada vínculo exige uma segunda revisão explícita.

O agente escolhe uma unidade ativa do núcleo, o contorno do núcleo, uma via, APP, risco, área pública ou servidão. O código da feição não é presumido como prova de titularidade. Vínculos preenchem os campos existentes de memoriais; as medidas passam pelo caminho atual do PRF. O mapa desenha contornos, códigos e vértices (estes a partir do zoom 18).

## Limites explícitos

- SIRGAS 2000 / UTM Sul, EPSG 31978–31985, com SRC declarado. Outros SRC, inclusive GeoJSON em graus, exigem reprojeção no QGIS nesta versão.
- Polygon simples ou MultiPolygon de uma única parte, sem anéis internos. Partes, furos, códigos repetidos/vazios, contornos abertos ou cruzados são rejeitados; nenhuma parte é descartada silenciosamente.
- Até 10 MB, 2.000 feições, 2.000 vértices por contorno e 10.000 vértices no total.
- Não substitui levantamento importado nem permite desvincular/reimportar automaticamente. Revisão de vínculos fica para um fluxo próprio. Memoriais existentes no destino só são substituídos após aviso explícito.
- Não deduz confrontantes, titularidade ou lote/quadra a partir de texto arbitrário. Vértices coincidentes exatos compartilham nome; próximos não são arredondados/fundidos.
- Medidas e azimutes usam as coordenadas UTM originais. A inversa UTM GRS80 serve à visualização/longitude/latitude; não altera os valores métricos. Referência: https://proj.org/en/stable/operations/projections/tmerc.html
- O profissional deve manter as configurações de emissão (responsável, meridiano e sistema) coerentes com o levantamento na aba Memoriais.

## Persistência e proteção

Usa `mutar` e a RPC existente, com merge nos campos do levantamento/unidade e detecção de revisão concorrente do memorial. Não há migração, dependência, service role ou escrita em tabelas canônicas. Importação/vínculo só na etapa Topografia com a permissão existente de Topografia/Diretoria; leitura posterior permanece.

## Validação

`node --test integracao-vercel/tests/*.test.js`: 114 testes, 114 passaram.
`npm run build --prefix integracao-vercel`: passou.

No navegador, usando `tests/memoriais.browser.html?etapa=1` e dois retângulos inteiramente fictícios: seleção do campo, prévia (200 m², 60 m), confirmação, vínculo a unidade e APP, desenho de 2 polígonos, nomes de vértices compartilhados e conferência na aba Memoriais. O simulador intercepta a RPC e bloqueia escritas canônicas. Sem erros de console.

O arquivo fornecido pelo usuário foi apenas lido localmente para validar o formato (14 feições, 107 vértices de contorno). Não foi incluído no código, enviado ao GitHub, importado no navegador nem aplicado em qualquer cadastro. Todos os testes versionados usam dados sintéticos.

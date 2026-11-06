# Mapas, GeoJSON e perímetro do núcleo

A importação é autorizada pela capacidade `importacaoGeografica`, separada da etapa do processo. A gravação usa `mutar.confirmado` e o mecanismo existente de persistência e concorrência. A autorização efetiva e o escopo continuam validados no banco.

## GeoJSON

O importador mantém o fluxo existente SIRGAS 2000 / UTM Sul (EPSG 31978 a 31985 com SRC declarado). As medidas dos memoriais continuam calculadas pelas coordenadas UTM originais. A inversa UTM GRS80 serve somente à visualização.

Também aceita Polygon e MultiPolygon conforme RFC 7946 em longitude/latitude WGS84, sem membro `crs`. Não presume um SRC quando há declaração incompatível. Anéis internos, partes, altitude e coordenadas são preservados. As feições geográficas servem ao mapa; não preenchem área, perímetro ou memorial técnico. Podem complementar um levantamento UTM sem converter ou modificar suas feições antigas. Dois fusos UTM diferentes continuam exigindo uma revisão externa.

A importação exige prévia e confirmação e é aditiva. Códigos/IDs duplicados são bloqueados; nenhum lote ou vínculo antigo é substituído. As feições ficam em `n.levantamentoGeoJSON.feicoes`; as novas geometrias geográficas usam `geometria`, além do exterior de compatibilidade em `poligono`. Os helpers `geometriaDaFeicao` e `poligonosDaGeometria` são a fonte completa para desenhar.

Projetos pode importar e, quando autorizado para memorial do núcleo, vincular uma feição UTM ao próprio núcleo. O vínculo que preenche memorial individual de unidade, vias ou outras áreas continua restrito aos perfis anteriores. Código de feição não é prova de titularidade; vínculos exigem revisão explícita. Alterações concorrentes do memorial são bloqueadas.

## KML e KMZ

`ImportadorPerimetro` lê KML; para KMZ recebe `extrairKMZ`, reutilizando o extrator da aplicação. Arquivos compactados e o texto extraído devem ter até 10 MB. Polígonos com anéis internos e MultiGeometry são preservados; quando há várias feições, o usuário seleciona as pertinentes antes de gravar.

O parser rejeita entidades/DOCTYPE, links de rede, referências externas e conteúdo ativo. Não busca URLs nem executa HTML. Pontos/linhas não são transformados silenciosamente em perímetros.

A geometria completa é persistida em `n.geo.geojson`; `n.geo.poligonos` mantém os exteriores compatíveis. A substituição exige confirmação específica e comparação com o `geo` anterior. Nenhuma área numérica ou memorial é recalculado. `poligonosParaMapa` retorna todos os anéis; renderizar com `caminhoPoligonoSVG` e `fillRule="evenodd"`. `gerarKMLGeografico` gera o download a partir do dado persistido, inclusive em outra sessão, sem depender de localStorage.

## Limites e validação

Até 10 MB, 2.000 feições, 2.000 vértices por anel e 10.000 vértices por arquivo. Contornos abertos, cruzados ou degenerados e furos inválidos são rejeitados. Contornos que cruzam o antimeridiano precisam ser divididos antes da importação. O fluxo UTM anterior preserva seu limite de polígonos simples sem furos; o novo fluxo geográfico preserva furos e multipartes.

Verificação isolada em 06/11/2026: `node --test tests/geojson.test.js tests/geometria-geografica.test.js tests/memorial-nucleo.test.js` — 34 testes passaram. Todos os casos usam dados fictícios. A validação integrada de UI, permissões do banco e persistência real pertence à suíte geral desta entrega.

Referências verificadas:
- https://www.rfc-editor.org/rfc/rfc7946
- https://www.ogc.org/standards/kml/
- https://proj.org/en/stable/operations/projections/tmerc.html

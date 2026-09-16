# Aba Memoriais

Substitui a planilha **GM 7.5 – Gerador de Memoriais**. O que era digitado à mão
na planilha (requerente, qualificação, núcleo, modalidade, endereço, área e
perímetro) passa a vir do cadastro do Integração. O usuário informa apenas os
vértices do levantamento.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `memoriaisCalculos.js` | lê vértices de TXT/CSV/texto colado, calcula azimute, distância, área e perímetro |
| `memoriaisTexto.js` | monta o texto do memorial descritivo (UTM ou geográfica) |
| `AbaMemoriais.jsx` | a aba em si |
| `modeloMemorial.js` | modelo do documento com marcadores `{{...}}` |
| `memoriais.test.mjs` | 40 testes, sem framework: `node memoriais/memoriais.test.mjs` |

Nenhuma dependência nova. Só React e `lucide-react`, que o projeto já usa.

## Integração — quatro pontos

**1. Registrar a aba na tela do núcleo**, ao lado das demais:

```jsx
import AbaMemoriais from "./memoriais/AbaMemoriais.jsx";

{aba === "memoriais" && (
  <AbaMemoriais
    nucleo={nucleo}
    municipio={municipio}
    unidades={unidadesDoNucleo}
    config={db.memoriais}
    podeEditar={perm.projeto || perm.estrutura}
    etapaLiberada={nucleo.etapa === "Topografia"}
    aoSalvarUnidade={salvarMemorialDaUnidade}
    aoSalvarConfig={salvarConfigMemoriais}
    aoGerarDocumento={gerarDocumentoMemorial}
  />
)}
```

**2. Montar a lista de unidades** com o formato que a aba espera. Uma entrada por
unidade imobiliária (um morador pode ter mais de uma):

```js
const unidadesDoNucleo = moradores
  .filter((m) => m.dados.nucleoId === nucleo.id)
  .flatMap((m) => (m.dados.unidades || []).map((u) => ({
    id: u.id,
    codigo: m.codigo,                    // fin_receb_clientes.codigo
    requerente: m.nome,
    morador: m,                          // usado para pegar quali_memorial
    area: u.area,
    perimetro: u.perimetro,
    caracteristicas: u.caracteristicas,
    memorial: u.memorial,                // já existe no sistema
    vertices: u.vertices,                // campo novo
  })));
```

**3. Gravar o resultado** de volta no morador, via o mesmo `mutar` dos demais
módulos. Grave sempre os quatro: vértices, área, perímetro e memorial — a área e
o perímetro alimentam também o PRF, que hoje os recebe digitados.

```js
const salvarMemorialDaUnidade = (unidade, dados) =>
  mutar((d) => {
    const m = d.moradores.find((x) => (x.dados.unidades || []).some((u) => u.id === unidade.id));
    const u = m.dados.unidades.find((x) => x.id === unidade.id);
    u.vertices = dados.vertices;
    u.area = dados.area;
    u.perimetro = dados.perimetro;
    u.memorial = dados.memorial;
    return d;
  }, "Memorial descritivo gravado", { detalhe: `${unidade.codigo}, ${dados.vertices.length} vértices` });
```

**4. Emitir o documento** pelo gerador que já existe. `dadosDoMemorial()` devolve
o objeto de marcadores pronto; o resto é a sua função de montar documento com
papel timbrado:

```js
const gerarDocumentoMemorial = (unidade, marcadores) =>
  montarDocumento("memorialDescritivo", marcadores, db, {});
```

Cadastre `MODELO_MEMORIAL_DESCRITIVO` junto aos demais modelos em
Configurações > Modelos e representantes, e `MARCADORES_MEMORIAL` na lista de
ajuda da tela.

## Campos novos

- `unidades[].vertices` — lista de `{ nome, e, n, longitude, latitude, azimute, distancia, confrontante }`
- `unidades[].area` e `unidades[].perimetro` — passam a ser calculados
- `unidades[].caracteristicas` — descrição das benfeitorias, se ainda não existir
- `db.memoriais` — `{ sistema, meridiano, prefixo, responsavel: { nome, registro } }`

## Cálculos

Portados do VBA, com a mesma convenção e o mesmo arredondamento:

- **Distância**: `√(ΔE² + ΔN²)`, 2 casas.
- **Azimute**: contado do Norte no sentido horário, `atan2(ΔE, ΔN)` normalizado
  em [0, 360), exibido como `123°45'45"`. O VBA fazia a correção de quadrante
  somando 180 ao arco-tangente; `atan2` resolve os quatro quadrantes de uma vez,
  inclusive ΔN = 0, que na planilha dependia de um desvio à parte.
- **Área**: fórmula dos determinantes (Gauss), `|Σ(Eᵢ·Nᵢ₊₁) − Σ(Eᵢ₊₁·Nᵢ)| / 2`,
  2 casas. Independe do sentido de percurso.
- **Perímetro**: soma das distâncias, 2 casas.

O polígono é sempre fechado: o último vértice liga de volta ao primeiro.

## Texto do memorial

As frases são as mesmas da planilha, palavra por palavra — não as reescreva sem
combinar com a equipe técnica, porque elas vão para o registro de imóveis. As
duas variações são com e sem confrontante, em UTM ou em coordenadas geográficas,
e o fecho muda conforme o sistema (o de UTM cita o meridiano central).

## O que ficou de fora da planilha, de propósito

Navegação entre abas, zoom, exportação para pasta local, importação de GeoJSON e
o módulo de leitura de TXT por delimitadores configuráveis — esse último estava
marcado como "em construção" no VBA e nunca funcionou. O leitor daqui detecta
sozinho o separador (`;` `,` tab, espaço), o decimal (vírgula ou ponto) e o
cabeçalho, e ainda entende o formato `ponto V-1 UTM E: ... UTM N: ...` que a
macro tentava ler.

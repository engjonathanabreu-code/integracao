# Dados do PRF no município

Cadastro dos dados estáveis que o Projeto de Regularização Fundiária usa e que hoje saem em branco no documento gerado. Preenchidos uma vez por município, valem para todos os núcleos daquela cidade.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `camposPRF.js` | esquema declarativo dos 9 grupos de dados e a checagem de pendências |
| `FormularioDadosPRF.jsx` | o formulário, renderizado a partir do esquema |
| `marcadoresPRF.js` | monta o objeto `{{campo}} → valor` do PRF e lista o que ainda falta, por origem |
| `municipio-prf.test.mjs` | 38 testes: `node municipio-prf/municipio-prf.test.mjs` |

Sem dependência nova. React e `lucide-react`, que o projeto já usa.

## O que o formulário cobre

Lei municipal de REURB · plano diretor e macrozonas · concessionárias de energia e de água · comarca do registro de imóveis · prefeitura e representante legal · leis de denominação de logradouros · bibliografia municipal.

A empresa que elabora (`{{elaboracao.*}}`) **não** entra aqui: é uma só para todos os municípios e pertence a Configurações, junto com o cadastro que o contrato também precisa.

## Integração — quatro pontos

**1. O botão na aba Municípios.** No card de cada município, ao lado do que já existe:

```jsx
import FormularioDadosPRF from "./municipio-prf/FormularioDadosPRF.jsx";
import { pendencias } from "./municipio-prf/camposPRF.js";

const faltam = pendencias(municipio.dados?.prf || {}).length;

<button className="btn btn-sm" onClick={() => setAberto(municipio.registro_id)}>
  <FileText size={14} />Dados do PRF{faltam ? ` (${faltam} pendentes)` : ""}
</button>
```

**2. Gravar.** Os dados vão em `integracao_municipios.dados.prf` — chave nova dentro do JSONB, sem alteração de schema. Use o `mutar` do projeto, preservando as demais chaves de `dados`:

```jsx
<FormularioDadosPRF
  municipio={municipio}
  dados={municipio.dados?.prf}
  podeEditar={perm.estrutura}
  aoSalvar={(prf) => mutar((d) => {
    const m = d.municipios.find((x) => x.registro_id === municipio.registro_id);
    m.dados.prf = prf;
    return d;
  }, "Dados do PRF atualizados", { detalhe: municipio.dados.nome })}
  aoFechar={() => setAberto(null)}
/>
```

**3. Ligar no gerador do PRF.** `marcadoresPRF()` devolve `{ marcadores, unidades, faltando }`. Os marcadores entram na substituição que já existe; `unidades` alimenta os laços `{{#cada:unidades}}` dos quadros 1, 3, 5, 6, 7 e 8:

```js
import { marcadoresPRF } from "./municipio-prf/marcadoresPRF.js";

const { marcadores, unidades, faltando } = marcadoresPRF({
  municipio, dadosPRF: municipio.dados?.prf, nucleo, moradores,
  elaboracao: db.configuracoes?.empresa,
});
```

**4. Mostrar o que falta antes de gerar.** `faltando` já vem agrupado por onde o dado teria de nascer — "Topografia — aba Memoriais", "Análise de matrícula do núcleo", "Cadastro de dados do PRF, na aba Municípios". Renderize isso na tela de geração em vez de deixar o usuário descobrir pelo documento com marcador cru.

## O que este pacote já resolve no PRF

Comparando com a prévia exportada do núcleo NANT02_01, onde 176 dos 219 campos saíram vazios:

**Dados que já existiam no banco e não estavam sendo usados.** `marcadoresPRF()` monta a partir do que está lá:

- `{{unidade.requerentes}}` — vem de `qualificacaoRequerente.assinantes`, com fallback para `beneficiarios`. Estava preenchido nos 17 moradores e saía vazio.
- `{{nucleo.totalProcessos}}`, `processosSocial`, `processosEspecifico`, `modalidadePredominante`, `modalidadeSufixo`, `negacaoRequisitos` — contados de `dados.social.modalidade`, que o gerador já lia para imprimir a coluna do Quadro 3. Em caso de empate entre as duas modalidades, nada é escolhido: o campo fica vazio e aparece nas pendências, porque a decisão é humana.
- `{{nucleo.tetoRendaSalarios}}` — de `criterio.salarioMinimo`.
- `{{documento.dataExtenso}}`.

**Quadra e lote.** `separarQuadraLote()` quebra o campo único `loteQuadra` nas duas colunas que os quadros pedem. Reconhece "Lote 07A, Quadra 03" e "Quadra 04 / Lote 12". O que não casar com nenhum padrão volta vazio e entra nas pendências em vez de virar dado errado — hoje só 7% das unidades têm esse campo preenchido, então a maior parte vai continuar em branco até alguém cadastrar.

**Os 13 campos do município**, que antes não tinham onde morar.

## O que continua faltando, e por quê

Em ordem de peso no documento:

- **Área e perímetro** do núcleo, das áreas públicas, dos logradouros, das servidões, das áreas de risco e das APPs, com as versões por extenso. Vêm da topografia, pela aba Memoriais.
- **Matrícula atingida**: número, comarca, ORI, proprietários, frações, reserva legal, CAR. Vem da análise de matrícula do núcleo.
- **Infraestrutura por unidade**: rede e modo de abastecimento de energia, água e esgoto. Três quadros de uma linha por unidade, hoje sem nenhum campo no cadastro.
- **Projeto urbanístico**: quadras, logradouros com classificação e extensão, áreas usucapidas.
- **Cronograma físico** e responsável de cada medida do termo de compromisso.

Esses cinco não são cadastro de município: são produto de etapas do projeto. O `faltando` os identifica um a um com a origem, o que dá para transformar numa lista de tarefas por núcleo.

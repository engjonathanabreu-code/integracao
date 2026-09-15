# Testes e uso dos modelos HTML

## Executar

- `node --test tests/*.test.js`: suíte existente, regressão dos marcadores legados, lacunas, resolução de caminhos e DOCX com realce.
- `npm run dev`: abrir `/tests/modelos-html.html` no navegador. A página executa 18 casos com o DOMParser e Range reais do navegador e mostra cada resultado. Os testes usam a mesma interface `test(nome, fn)` e `assert` da suíte Node, sem instalar um simulador de DOM.
- `npm run build`: compilação de produção.

A suíte DOM inclui os quatro escopos de repetição, coleção vazia, duas matrículas com três unidades cada, laços irmãos de unidades/logradouros/remanescentes, condicionais aninhados, descarte de linhas e parágrafos, marcadores divididos por tags, apelidos, lacunas e texto escapado.

## Contrato dos dados

`montarDocumentoComercial(tipo, d, db, extras)` avalia os controles com `{ ...d, ...extras }`, nesta ordem: `aplicarCondicionais`, `expandirLacos` (que também resolve caminhos com ponto) e `preencherModelo`, sem modificar o preenchimento legado.

As coleções devem ser arrays no objeto de dados. Coleções ausentes ou vazias removem o escopo do laço; um valor presente que não seja array gera erro de modelo. Cada item fica disponível por `item` e pelo apelido singular documentado em `APELIDOS`. O contexto do pai permanece acessível, mas campos ausentes do item não herdam valores do item pai.

As condições são caminhos de dados, não expressões JavaScript: `false`, `0`, `null`, `undefined`, texto vazio e arrays vazios selecionam o ramo falso. Outras strings, inclusive `"false"`, são texto não vazio; o chamador deve fornecer booleanos quando a condição representar sim/não.

Exemplo:

```html
<p>{{#se:nucleo.social}}Modalidade social{{senao}}Modalidade específica{{/se}}</p>
<table><tr><td>{{#cada:unidades}}{{unidade.nome}}</td><td>{{unidade.quadra}}{{/cada}}</td></tr></table>
```

```js
{ nucleo: { social: true }, unidades: [{ nome: 'Morador teste', quadra: 'A' }] }
```

Campos novos são texto escapado, não HTML arbitrário. Caminhos inexistentes, nulos ou vazios permanecem como marcadores para revisão. Os marcadores legados de blocos HTML continuam passando pelo preenchedor original. Modelos sem controles nem caminhos com ponto não são reserializados pelo DOMParser.

## Limites do escopo

- Não cria dados, coleções ou condições de negócio a partir de cadastros; o chamador deve fornecer os objetos necessários. A propriedade legada `unidades`, quando textual, continua válida para `{{unidades}}`, mas não serve como coleção de `{{#cada:unidades}}` sem fornecer um array no contexto.
- A integração do motor é em `montarDocumentoComercial`, conforme solicitado. O gerador de PRF baseado em correspondência manual/IA de lacunas é um fluxo separado e não foi migrado para este motor. Seus dois uploads preservam o realce.
- Laços entre linhas exigem o mesmo grupo de linhas (`tbody`, `thead` ou `tfoot`); atravessar grupos diferentes gera erro explícito.
- Não altera armazenamento, banco ou dependências. Mammoth suporta `highlight` desde 1.8.0, portanto não foi necessário atualizar a dependência. O realce vira `<mark>` e é preservado por `limparHtml`.
- Validação com modelos sintéticos; não foram fornecidos os novos DOCX jurídicos para conferir seu conteúdo real.

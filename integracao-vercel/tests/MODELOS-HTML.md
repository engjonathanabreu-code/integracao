# Testes e uso dos modelos HTML

## Executar

- `node --test tests/*.test.js`: suíte existente, regressão dos marcadores legados, lacunas, resolução de caminhos e DOCX com realce.
- `npm run dev`: abrir `/tests/modelos-html.html` no navegador. A página executa 21 casos com o DOMParser e Range reais do navegador e mostra cada resultado. Os testes usam a mesma interface `test(nome, fn)` e `assert` da suíte Node, sem instalar um simulador de DOM.
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

- Na montagem comercial, o chamador fornece as coleções em `d`/`extras`; o campo textual legado `unidades` continua válido para `{{unidades}}`. No PRF, o contexto é montado a partir das unidades dos moradores ativos do núcleo, preservando o mascaramento de CPF. Matrículas são agrupadas pelo número expressamente cadastrado; logradouros, pelo endereço do imóvel (ou endereço cadastrado quando não houver o do imóvel). Quadras usam o campo explícito, sem tentar decompor o texto livre `loteQuadra`. Não se presume proprietário registral a partir do ocupante, nem situação jurídica a partir de informação ausente. Coleções técnicas adicionais são utilizadas quando existentes no objeto do núcleo, sem criar novos cadastros ou estrutura de banco.
- O motor atende `montarDocumentoComercial` e a prévia/exportação do PRF. `prepararModeloPRF` expande primeiro, preserva os marcadores do catálogo antigo para inserção de blocos HTML e só então calcula as posições das lacunas. A correspondência manual é invalidada quando o HTML preparado muda, evitando aplicar escolhas antigas em posições diferentes.
- Laços entre linhas exigem o mesmo grupo de linhas (`tbody`, `thead` ou `tfoot`); atravessar grupos diferentes gera erro explícito.
- Não altera armazenamento, banco ou dependências. Mammoth suporta `highlight` desde 1.8.0, portanto não foi necessário atualizar a dependência. O realce vira `<mark>` e é preservado por `limparHtml`.
- Validação com modelos sintéticos; não foram fornecidos os novos DOCX jurídicos para conferir seu conteúdo real.


## Integração e exportação do PRF

O PRF conserva todos os valores do catálogo anterior, inclusive tabelas e memoriais em HTML. Modelos antigos continuam com a correspondência por palavras-chave/IA. Modelos estruturados exibem a prévia automaticamente; sublinhados podem ser associados manualmente. Marcadores ainda sem valor ficam destacados. O aviso diferencia lacunas de trechos originalmente realçados no Word.

`contextoPRF` fornece `municipio`, `remessa`, `nucleo`, `unidades`, `matriculas`, `logradouros` e `quadras`. Nas unidades: `codigo`, `nome`, `cpf`, `conjuge`, `area`, `memorial`, `loteQuadra`, `lote`, `quadra`, `matricula`, `logradouro`, `modalidade`, `requerente` e `confrontantes`. Os booleanos `modalidadeSocial` e `modalidadeEspecifica` são verdadeiros apenas quando todas as unidades têm a classificação correspondente; também estão disponíveis em `nucleo`. `cronograma` usa a informação expressamente existente no núcleo. Não são emitidas conclusões jurídicas automaticamente.

Teste de interface isolado: abrir `/tests/browser.html?prf=1&mobile=1`, entrar com `teste@example.invalid` / `teste-local`, abrir o núcleo NUI01 e “Gerar prévia do PRF”. O cenário contém um modelo estruturado e dados fictícios; nenhuma chamada externa real é permitida. Nessa modalidade de teste, o conteúdo produzido pelos botões de exportação é capturado em `#exportacao-teste`, com nome e tipo MIME, para validar o mesmo Blob enviado ao download em produção.

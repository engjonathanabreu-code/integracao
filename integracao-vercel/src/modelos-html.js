// Expansão estrutural dos modelos importados do Word. Os valores novos são texto,
// enquanto os marcadores legados continuam com seu preenchimento de HTML original.
export const ESTILOS_WORD = { styleMap: ["highlight => mark"] };
export const APELIDOS = {
  unidades: 'unidade', matriculas: 'matricula', 'matricula.unidades': 'unidade',
  'matricula.logradouros': 'logradouro', 'matricula.remanescentes': 'remanescente',
  'matricula.proprietarios': 'proprietario', unidadesSemEspecializacao: 'unidade',
  quadras: 'quadra', logradouros: 'logradouro', areasUsucapidas: 'usucapida',
  versoes: 'versao', equipeTecnica: 'tecnico', proprietariosCadeiaDominial: 'proprietario',
  unidadesAtingidasRodovia: 'unidade', unidadesAtingidasCursoAgua: 'unidade',
  'medida.unidades': 'unidade', 'bibliografia.municipio': 'referencia',
};
const proibidos = new Set(['__proto__', 'prototype', 'constructor']);
export function resolverCaminho(dados, caminho) {
  return caminho.split('.').reduce((obj, chave) => !proibidos.has(chave) && obj != null && Object.hasOwn(Object(obj), chave) ? obj[chave] : undefined, dados);
}
export const marcadorControle = chave => /^(?:#cada\s*:|\/cada$|#se\s*:|senao$|\/se$)/.test(chave.trim());
const vazio = valor => valor == null || (typeof valor === 'string' && !valor.trim());
const verdadeiro = valor => Array.isArray(valor) ? valor.length > 0 : !vazio(valor) && Boolean(valor);
const padrao = /\{\{\s*([^{}]+?)\s*\}\}/g;

// Usa o texto concatenado apenas para localizar os caracteres. Todo recorte e
// deslocamento é feito por Range, inclusive quando o Word divide um marcador.
function marcar(raiz) {
  const doc = raiz.ownerDocument;
  const walker = doc.createTreeWalker(raiz, 4);
  const nos = []; let texto = '', no;
  while ((no = walker.nextNode())) { nos.push({ no, inicio: texto.length }); texto += no.data; }
  const marcas = [...texto.matchAll(padrao)];
  for (const m of marcas.reverse()) {
    const inicio = m.index, fim = inicio + m[0].length;
    const a = nos.find(n => n.inicio <= inicio && n.inicio + n.no.length > inicio);
    const b = nos.find(n => n.inicio < fim && n.inicio + n.no.length >= fim);
    if (!a || !b) continue;
    const range = doc.createRange(); range.setStart(a.no, inicio - a.inicio); range.setEnd(b.no, fim - b.inicio);
    range.deleteContents(); range.insertNode(doc.createComment('modelo:' + m[1].trim()));
  }
}
function marcas(raiz) {
  const walker = raiz.ownerDocument.createTreeWalker(raiz, 128); const lista = []; let no;
  while ((no = walker.nextNode())) if (no.data.startsWith('modelo:')) lista.push(no);
  return lista;
}
const chave = no => no.data.slice(7);
function pares(raiz) {
  const pilha = [], lista = [];
  for (const no of marcas(raiz)) {
    const c = chave(no);
    if (/^#(cada|se):/.test(c)) {
      const tipo = c.startsWith('#cada:') ? 'cada' : 'se';
      const par = { inicio: no, tipo, nome: c.slice(tipo.length + 2).trim(), pai: pilha.at(-1) };
      pilha.push(par); lista.push(par);
    } else if (c === 'senao') {
      const par = pilha.at(-1);
      if (!par || par.tipo !== 'se' || par.senao) throw new Error('Modelo com {{senao}} fora de um condicional ou duplicado.');
      par.senao = no;
    } else if (c === '/cada' || c === '/se') {
      const par = pilha.pop();
      if (!par || c !== '/' + par.tipo) throw new Error('Modelo com fechamento de laço ou condicional fora de ordem.');
      par.fim = no;
    }
  }
  if (pilha.length) throw new Error('Modelo com laço ou condicional sem fechamento.');
  return lista;
}
function limparVazios(no, raiz) {
  while (no && no !== raiz && !no.textContent.trim() && !no.querySelector?.('img,br,table') && !marcas(no).length) {
    const pai = no.parentNode;
    // Células e linhas são removidas pelo escopo, nunca por estarem em branco.
    if (!/^(P|SPAN|B|STRONG|I|EM|MARK)$/.test(no.nodeName)) break;
    no.remove(); no = pai;
  }
}
function retirar(no, raiz, estrutural = false) {
  const candidato = estrutural ? limite(no) : no;
  const alvo = /^(TD|TH)$/.test(candidato.nodeName) ? no : candidato;
  const pai = alvo.parentNode; alvo.remove(); limparVazios(pai, raiz);
}
function limite(no) {
  let atual = no;
  for (let pai = no.parentElement; pai && /^(SPAN|B|STRONG|I|EM|MARK|P|TD|TH|TR)$/.test(pai.tagName); pai = pai.parentElement) {
    if (pai.textContent.trim() || marcas(pai).length !== 1 || pai.querySelector('img,br,table')) break;
    atual = pai;
  }
  return atual;
}
function apagar(a, b, raiz) {
  const pa = a.parentNode, pb = b.parentNode;
  const range = raiz.ownerDocument.createRange(); range.setStartBefore(limite(a)); range.setEndAfter(limite(b));
  const comum = range.commonAncestorContainer; range.deleteContents();
  limparVazios(pa, raiz); limparVazios(pb, raiz); limparVazios(comum, raiz);
}
function condicionar(raiz, dados) {
  while (true) {
    // Condicionais dentro de laços aguardam o contexto do item correspondente.
    const par = pares(raiz).find(p => p.tipo === 'se' && !p.pai);
    if (!par) return;
    if (verdadeiro(resolverCaminho(dados, par.nome))) {
      if (par.senao) apagar(par.senao, par.fim, raiz); else retirar(par.fim, raiz, true);
      retirar(par.inicio, raiz, true);
    } else if (par.senao) {
      apagar(par.inicio, par.senao, raiz); retirar(par.fim, raiz, true);
    } else apagar(par.inicio, par.fim, raiz);
  }
}
function recorte(par, raiz) {
  const range = raiz.ownerDocument.createRange();
  const a = par.inicio.parentElement, b = par.fim.parentElement;
  const linhaA = a?.closest('tr'), linhaB = b?.closest('tr');
  const celulaA = a?.closest('td,th'), celulaB = b?.closest('td,th');
  if (linhaA && linhaB && linhaA.closest('table') === linhaB.closest('table') && (linhaA !== linhaB || celulaA !== celulaB)) {
    if (linhaA.parentNode !== linhaB.parentNode) {
      // O Word pode pôr a abertura em thead e o fechamento em tbody.
      // Isola só as linhas do laço em seções completas, para que Range não
      // reinsira seções dentro de outras seções nem repita linhas externas.
      let inicio = linhaA.parentElement, fim = linhaB.parentElement;
      const tabela = linhaA.closest('table');
      if (inicio.parentNode !== tabela || fim.parentNode !== tabela) throw new Error('Não foi possível identificar as seções da tabela do laço.');
      if (linhaA.previousSibling) {
        const trecho = inicio.cloneNode(false); inicio.after(trecho);
        for (let no = linhaA; no;) { const proximo = no.nextSibling; trecho.append(no); no = proximo; }
        inicio = trecho;
      }
      if (linhaB.nextSibling) {
        const restante = fim.cloneNode(false); fim.after(restante);
        while (linhaB.nextSibling) restante.append(linhaB.nextSibling);
      }
      // Cabeçalhos/rodapés que fazem parte da repetição viram grupos de linhas
      // do corpo. As células th, atributos, estilos e linhas ficam intactos.
      for (let secao = inicio; secao;) {
        const ultima = secao === fim, proxima = secao.nextSibling;
        if (/^(THEAD|TFOOT)$/.test(secao.nodeName)) {
          const corpo = raiz.ownerDocument.createElement('tbody');
          for (const atributo of secao.attributes) corpo.setAttribute(atributo.name, atributo.value);
          while (secao.firstChild) corpo.append(secao.firstChild);
          secao.replaceWith(corpo);
          if (secao === inicio) inicio = corpo;
          if (secao === fim) fim = corpo;
        }
        if (ultima) break;
        secao = proxima;
      }
      range.setStartBefore(inicio); range.setEndAfter(fim);
      return range;
    }
    range.setStartBefore(linhaA); range.setEndAfter(linhaB);
  } else {
    range.setStartBefore(limite(par.inicio)); range.setEndAfter(limite(par.fim));
  }
  return range;
}
function preencherCaminhos(raiz, dados, proteger, preservar = []) {
  for (const no of marcas(raiz)) {
    const c = chave(no);
    if (marcadorControle(c) || !c.includes('.') || preservar.includes(c)) continue;
    const valor = resolverCaminho(dados, c);
    const texto = vazio(valor) || typeof valor === 'object' ? proteger('{{' + c + '}}') : String(valor);
    no.replaceWith(raiz.ownerDocument.createTextNode(texto));
  }
}
function expandir(raiz, dados, proteger, preservar) {
  condicionar(raiz, dados);
  while (true) {
    const par = pares(raiz).find(p => p.tipo === 'cada' && !p.pai);
    if (!par) break;
    const itens = resolverCaminho(dados, par.nome);
    if (itens != null && !Array.isArray(itens)) throw new Error(`A coleção ${par.nome} precisa ser uma lista.`);
    const range = recorte(par, raiz), molde = range.extractContents();
    const destino = raiz.ownerDocument.createComment('destino'); range.insertNode(destino);
    retirar(par.inicio, molde); retirar(par.fim, molde);
    for (const item of itens || []) {
      const copia = molde.cloneNode(true), apelido = APELIDOS[par.nome];
      const contexto = { ...dados, item, ...(apelido ? { [apelido]: item } : {}) };
      expandir(copia, contexto, proteger, preservar);
      preencherCaminhos(copia, contexto, proteger, preservar);
      destino.before(copia);
    }
    const pai = destino.parentNode; destino.remove(); limparVazios(pai, raiz);
  }
}
function restaurar(raiz) {
  for (const no of marcas(raiz)) no.replaceWith(raiz.ownerDocument.createTextNode('{{' + chave(no) + '}}'));
}
function documento(html) {
  if (typeof DOMParser === 'undefined') throw new Error('A geração deste modelo requer DOMParser.');
  const doc = new DOMParser().parseFromString(html, 'text/html'); marcar(doc.body); return doc;
}
export function aplicarCondicionais(html, dados) {
  if (!/#se\s*:/.test(String(html).replace(/<[^>]*>/g, ''))) return html;
  const doc = documento(html); condicionar(doc.body, dados); restaurar(doc.body); return doc.body.innerHTML;
}
export function expandirLacos(html, dados, { preservar = [] } = {}) {
  if (!/#cada\s*:/.test(String(html).replace(/<[^>]*>/g, ''))) return substituirCaminhos(html, dados, preservar);
  const doc = documento(html), pendentes = [];
  // Protege lacunas do item contra uma segunda resolução no escopo do pai.
  const proteger = texto => { const id = `\uE000lacuna${pendentes.length}\uE001`; pendentes.push([id, texto]); return id; };
  expandir(doc.body, dados, proteger, preservar); preencherCaminhos(doc.body, dados, proteger, preservar); restaurar(doc.body);
  let resultado = doc.body.innerHTML;
  for (const [id, texto] of pendentes) resultado = resultado.split(id).join(texto);
  return resultado;
}
export function substituirCaminhos(html, dados, preservar = []) {
  // Modelos antigos não passam por serialização DOM: mantêm exatamente seu HTML.
  if (!/\{\{[^{}]*\.[^{}]*\}\}/.test(String(html).replace(/<[^>]*>/g, ''))) return html;
  const doc = documento(html); preencherCaminhos(doc.body, dados, texto => texto, preservar); restaurar(doc.body); return doc.body.innerHTML;
}
export function lacunasDoDocumento(html) {
  const texto = typeof DOMParser === 'undefined' ? String(html).replace(/<[^>]+>/g, '') : new DOMParser().parseFromString(html, 'text/html').body.textContent;
  const marcadores = [...texto.matchAll(padrao)].map(m => m[1].trim()).filter(c => !marcadorControle(c) && /^[\w.]+$/.test(c));
  return { marcadores: [...new Set(marcadores)], tracos: (texto.match(/_{6,}/g) || []).length };
}

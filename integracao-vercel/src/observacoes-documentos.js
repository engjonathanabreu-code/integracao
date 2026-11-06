export const LIMITES_OBSERVACAO = Object.freeze({ blocos: 200, trechos: 1000, caracteres: 20000, bytes: 131072 });
const TIPOS = new Set(['paragraph', 'bullet', 'ordered', 'check']);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const objeto = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function chaves(value, permitidas) { if (Object.keys(value).some(k => !permitidas.includes(k))) throw Error('A observação contém uma formatação não permitida.'); }
export function novoBloco(type = 'paragraph') { return { id: crypto.randomUUID(), type, ...(type === 'check' ? { checked: false } : {}), runs: [{ text: '' }] }; }
export function observacaoVazia() { return { version: 1, blocks: [novoBloco()] }; }
// A mesma estrutura e os mesmos limites são verificados pelo RPC. Não aceita HTML.
export function validarObservacao(conteudo, { permitirVazia = false } = {}) {
  if (!objeto(conteudo) || conteudo.version !== 1 || !Array.isArray(conteudo.blocks)) throw Error('O formato desta observação não é reconhecido.');
  chaves(conteudo, ['version', 'blocks']);
  if (!conteudo.blocks.length || conteudo.blocks.length > LIMITES_OBSERVACAO.blocos) throw Error('Use entre 1 e 200 linhas na observação.');
  let caracteres = 0, trechos = 0; const ids = new Set();
  const blocks = conteudo.blocks.map(b => {
    if (!objeto(b) || typeof b.id !== 'string' || !ID.test(b.id) || ids.has(b.id) || !TIPOS.has(b.type)) throw Error('Há uma linha inválida na observação.');
    ids.add(b.id); chaves(b, ['id', 'type', 'checked', 'runs']);
    if (b.type === 'check' ? typeof b.checked !== 'boolean' : b.checked !== undefined) throw Error('O estado do checklist é inválido.');
    if (!Array.isArray(b.runs) || !b.runs.length) throw Error('Há um trecho inválido na observação.');
    const runs = b.runs.map(r => {
      if (!objeto(r) || typeof r.text !== 'string' || /\u0000/.test(r.text)) throw Error('Há um texto inválido na observação.');
      chaves(r, ['text', 'bold', 'italic']);
      if ((r.bold !== undefined && r.bold !== true) || (r.italic !== undefined && r.italic !== true)) throw Error('Há uma formatação inválida na observação.');
      caracteres += r.text.length; trechos++;
      return { text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}) };
    });
    return { id: b.id, type: b.type, ...(b.type === 'check' ? { checked: b.checked } : {}), runs };
  });
  if (caracteres > LIMITES_OBSERVACAO.caracteres || trechos > LIMITES_OBSERVACAO.trechos || new TextEncoder().encode(JSON.stringify(conteudo)).length > LIMITES_OBSERVACAO.bytes) throw Error('A observação ultrapassou o limite de tamanho. Reduza o texto ou a formatação.');
  if (!permitirVazia && !blocks.some(b => b.runs.some(r => r.text.trim()))) throw Error('Escreva uma observação antes de salvar.');
  return { version: 1, blocks };
}
export function textoObservacao(conteudo) {
  let n = 0;
  return validarObservacao(conteudo, { permitirVazia: true }).blocks.map(b => {
    n = b.type === 'ordered' ? n + 1 : 0;
    return (b.type === 'check' ? `[${b.checked ? 'x' : ' '}] ` : b.type === 'bullet' ? '• ' : b.type === 'ordered' ? `${n}. ` : '') + b.runs.map(r => r.text).join('');
  }).join('\n');
}
export function mudarTipoBloco(conteudo, id, type) {
  if (!TIPOS.has(type)) throw Error('Tipo de lista inválido.');
  return { ...conteudo, blocks: conteudo.blocks.map(b => b.id === id ? { id: b.id, type, runs: b.runs, ...(type === 'check' ? { checked: b.type === 'check' ? b.checked : false } : {}) } : b) };
}
export function marcarItem(conteudo, id, checked) {
  let achou = false;
  const blocks = conteudo.blocks.map(b => { if (b.id !== id) return b; if (b.type !== 'check' || typeof checked !== 'boolean') throw Error('Item de checklist inválido.'); achou = true; return { ...b, checked }; });
  if (!achou) throw Error('Item de checklist não encontrado.');
  return validarObservacao({ ...conteudo, blocks });
}
export function podeEditarObservacao(observacao, usuario, administrador = false) {
  const id = usuario?.erpRef || usuario?.erpId || usuario?.id;
  return Boolean(id && usuario?.ativo !== false && (administrador || String(observacao.autor_id) === String(id).replace(/^erp_/, '')));
}
export function erroObservacao(error) {
  const mensagem = String(error?.message || 'Não foi possível salvar. Seu texto foi mantido.');
  if (['40001', '409'].includes(String(error?.code || error?.status)) || /versão|versao|conflito|outro usu.rio/i.test(mensagem)) return 'Esta observação foi alterada em outra sessão. Seu texto foi mantido. Confira a versão atual antes de continuar.';
  return mensagem;
}
export function criarHistoricoEditor(inicial, limite = 80) {
  let estados = [JSON.stringify(inicial)], indice = 0;
  const ler = () => JSON.parse(estados[indice]);
  return {
    registrar(valor) { const s = JSON.stringify(valor); if (s === estados[indice]) return; estados = estados.slice(0, indice + 1); estados.push(s); if (estados.length > limite) estados.shift(); indice = estados.length - 1; },
    desfazer() { if (indice > 0) indice--; return ler(); }, refazer() { if (indice < estados.length - 1) indice++; return ler(); },
    get podeDesfazer() { return indice > 0; }, get podeRefazer() { return indice < estados.length - 1; }
  };
}
// Lê apenas texto e marcas reconhecidas. Conteúdo colado chega como text/plain.
// Elementos executáveis, mídia e seus descendentes são descartados integralmente.
export function lerTrechosDOM(elemento) {
  const runs = []; const proibidos = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO']);
  const incluir = (text, marks) => { if (!text) return; const anterior = runs.at(-1); if (anterior && !!anterior.bold === !!marks.bold && !!anterior.italic === !!marks.italic) anterior.text += text; else runs.push({ text, ...marks }); };
  const visitar = (node, marks = {}) => {
    if (node.nodeType === 3) return incluir(node.nodeValue || '', marks);
    if (node.nodeType !== 1 || proibidos.has(node.tagName?.toUpperCase())) return;
    const tag = node.tagName.toUpperCase(); if (tag === 'BR') return incluir('\n', marks);
    const proximas = { ...marks, ...(['B', 'STRONG'].includes(tag) || node.style?.fontWeight === 'bold' || Number(node.style?.fontWeight) >= 600 ? { bold: true } : {}), ...(['I', 'EM'].includes(tag) || node.style?.fontStyle === 'italic' ? { italic: true } : {}) };
    if (['P', 'DIV'].includes(tag) && runs.length && !runs.at(-1).text.endsWith('\n')) incluir('\n', marks);
    for (const filho of node.childNodes || []) visitar(filho, proximas);
  };
  for (const filho of elemento.childNodes || []) visitar(filho);
  return runs.length ? runs : [{ text: '' }];
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LIMITE_DOCUMENTO_IA, LIMITE_PAGINAS_PDF_IA, validarPaginasPDF, conferirPaginasPDF, transcreverPDFGrande } from '../src/documentos-ia-envio.js';
import { LIMITE_PAGINAS_PDF_IA as LIMITE_SERVIDOR, contarPaginasPDF, limitarPaginasPDF, chamarOpenAI, ErroIA } from '../server/openai.js';

// Nenhuma chamada real: o envio e o fetch são sempre simulados.
const fonte = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
function pdfFalso(paginas) {
  let destruido = false; const abertas = [];
  return { pdf: { numPages: paginas, getPage: async n => { abertas.push(n); return { getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve() }), cleanup() {} }; }, destroy: async () => { destruido = true; } }, abertas, destruido: () => destruido };
}

test('IA-C3: o limite de páginas é o mesmo no navegador e no servidor', () => {
  assert.equal(LIMITE_PAGINAS_PDF_IA, 30); assert.equal(LIMITE_SERVIDOR, LIMITE_PAGINAS_PDF_IA);
});
test('IA-C3: aceita exatamente o limite e recusa acima com mensagem clara', () => {
  for (const ok of [0, 1, LIMITE_PAGINAS_PDF_IA, undefined, null, NaN]) validarPaginasPDF(ok);
  assert.throws(() => validarPaginasPDF(LIMITE_PAGINAS_PDF_IA + 1), /Este PDF tem 31 páginas e o limite por análise é de 30 páginas.*Nada foi enviado: divida o arquivo/);
  assert.throws(() => validarPaginasPDF(400), /400 páginas/);
});
test('IA-C3: PDF grande acima do limite é recusado antes da primeira página, sem nenhum envio pago', async () => {
  const f = pdfFalso(LIMITE_PAGINAS_PDF_IA + 1); let envios = 0;
  await assert.rejects(transcreverPDFGrande({ size: LIMITE_DOCUMENTO_IA }, async () => { envios++; return { content: [{ type: 'text', text: 'x' }] }; }, async () => f.pdf), /31 páginas.*Nada foi enviado/);
  assert.equal(envios, 0); assert.deepEqual(f.abertas, []); assert.equal(f.destruido(), true);
});
test('IA-C3: PDF grande com exatamente o limite percorre todas as páginas', async () => {
  globalThis.document = { createElement: () => ({ getContext: () => ({}), toDataURL: () => 'data:image/jpeg;base64,YQ==' }) };
  try {
    const f = pdfFalso(LIMITE_PAGINAS_PDF_IA); let envios = 0;
    const texto = await transcreverPDFGrande({ size: 5 * 1024 * 1024 }, async () => { envios++; return { content: [{ type: 'text', text: `Texto ${envios}` }] }; }, async () => f.pdf);
    assert.equal(envios, LIMITE_PAGINAS_PDF_IA); assert.match(texto, /Página 30\/30:\nTexto 30$/); assert.equal(f.destruido(), true);
  } finally { delete globalThis.document; }
});
test('IA-C3: PDF pequeno também é contado antes do envio; falha ao abrir não bloqueia', async () => {
  const dentro = pdfFalso(LIMITE_PAGINAS_PDF_IA);
  assert.equal(await conferirPaginasPDF({}, async () => dentro.pdf), LIMITE_PAGINAS_PDF_IA); assert.equal(dentro.destruido(), true);
  const fora = pdfFalso(LIMITE_PAGINAS_PDF_IA + 1);
  await assert.rejects(conferirPaginasPDF({}, async () => fora.pdf), /31 páginas/); assert.equal(fora.destruido(), true); assert.deepEqual(fora.abertas, []);
  assert.equal(await conferirPaginasPDF({}, async () => { throw new Error('PDF protegido'); }), null);
  // Na tela, a contagem acontece antes de ler o arquivo para envio.
  const analisar = fonte.slice(fonte.indexOf('async function analisarDocumentoIA('), fonte.indexOf('const MAX_LOTE_DEVOLUTIVA'));
  assert.ok(analisar.indexOf('if (!grande && arquivo.type === "application/pdf") await conferirPaginasPDF(arquivo);') > 0);
  assert.ok(analisar.indexOf('await conferirPaginasPDF(arquivo)') < analisar.indexOf('await lerBase64(arquivo)'));
  assert.ok(analisar.indexOf('await conferirPaginasPDF(arquivo)') < analisar.indexOf('transcreverPDFGrande('));
});

const base64PDF = (corpo) => Buffer.from(`%PDF-1.4\n${corpo}\n%%EOF`, 'latin1').toString('base64');
const comPaginas = (n, { declarar = true } = {}) => base64PDF(`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${i + 3} 0 R`).join(' ')}]${declarar ? ` /Count ${n}` : ''} >> endobj\n${Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n')}`);
const mensagem = (data) => [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }, { type: 'text', text: 'Documento fictício' }] }];

test('IA-C3: servidor estima as páginas do PDF e não se confunde com /Pages nem com revisões repetidas', () => {
  assert.equal(contarPaginasPDF(comPaginas(3)), 3);
  assert.equal(contarPaginasPDF(comPaginas(31)), 31);
  assert.equal(contarPaginasPDF(comPaginas(7, { declarar: false })), 7);
  // Arquivo salvo em revisões: objetos de página repetidos, mas a árvore declara 2 páginas.
  assert.equal(contarPaginasPDF(base64PDF(`${'9 0 obj << /Type /Page >> endobj\n'.repeat(40)}2 0 obj << /Count 2 /Kids [3 0 R 4 0 R] /Type /Pages >> endobj`)), 2);
  // /Count de marcadores (Outlines) não é contagem de páginas.
  assert.equal(contarPaginasPDF(base64PDF('5 0 obj << /Type /Outlines /Count 99 >> endobj\n3 0 obj << /Type /Page >> endobj')), 1);
  for (const desconhecido of ['', null, undefined, base64PDF('objetos compactados sem marcas legíveis')]) assert.equal(contarPaginasPDF(desconhecido), 0);
});
test('IA-C3: servidor aceita o limite exato, recusa acima e ignora o que não é PDF', () => {
  limitarPaginasPDF(mensagem(comPaginas(LIMITE_SERVIDOR)));
  limitarPaginasPDF(mensagem(base64PDF('sem marcas')));
  limitarPaginasPDF([{ role: 'user', content: 'só texto' }]); limitarPaginasPDF(null); limitarPaginasPDF([{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: comPaginas(99) } }] }]);
  assert.throws(() => limitarPaginasPDF(mensagem(comPaginas(LIMITE_SERVIDOR + 1))), e => e instanceof ErroIA && e.status === 413 && /Este PDF tem 31 páginas e o limite por análise é de 30 páginas\. Nada foi enviado à IA/.test(e.message));
});
test('IA-C3: análise documental acima do limite não chega à OpenAI; no limite, chega uma vez', async () => {
  const antes = { chave: process.env.OPENAI_API_KEY, fetch: global.fetch };
  process.env.OPENAI_API_KEY = 'test-only'; let chamadas = 0;
  global.fetch = async () => { chamadas++; return Response.json({ status: 'completed', model: 'modelo-teste', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] }); };
  try {
    const opcoes = { purpose: 'documentos_cliente', stage: 'analise', onUsage() {} };
    await assert.rejects(chamarOpenAI({ messages: mensagem(comPaginas(LIMITE_SERVIDOR + 1)) }, opcoes), e => e instanceof ErroIA && e.status === 413 && /31 páginas/.test(e.message));
    assert.equal(chamadas, 0);
    const r = await chamarOpenAI({ messages: mensagem(comPaginas(LIMITE_SERVIDOR)) }, opcoes);
    assert.equal(chamadas, 1); assert.equal(r.content[0].text, '{}');
    // Os demais fluxos de IA (devolutivas, ofícios) não ganham esse limite nesta entrega.
    await chamarOpenAI({ messages: mensagem(comPaginas(LIMITE_SERVIDOR + 1)) });
    assert.equal(chamadas, 2);
  } finally { global.fetch = antes.fetch; if (antes.chave === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = antes.chave; }
});

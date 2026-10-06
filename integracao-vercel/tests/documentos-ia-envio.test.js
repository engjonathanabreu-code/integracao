import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITE_DOCUMENTO_IA, validarDocumentoIA, transcreverPDFGrande, enviarPedidoIA } from '../src/documentos-ia-envio.js';
test('aceita exatamente 20 MB e recusa acima antes de abrir ou enviar', async () => {
  validarDocumentoIA({ size: LIMITE_DOCUMENTO_IA });
  let abriu = false;
  await assert.rejects(transcreverPDFGrande({ size: LIMITE_DOCUMENTO_IA + 1 }, () => {}, () => { abriu = true; }), /20 MB/);
  assert.equal(abriu, false);
});
function fixture(falhar = 0) {
  const chamadas = [], limpas = [];
  let destruido = false;
  globalThis.document = { createElement: () => ({ getContext: () => ({}), toDataURL: () => 'data:image/jpeg;base64,YQ==' }) };
  const pdf = { numPages: 3, getPage: async n => ({ getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve() }), cleanup: () => limpas.push(n) }), destroy: async () => { destruido = true; } };
  const enviar = async content => {
    chamadas.push(content);
    if (chamadas.length === falhar) throw new Error('Falha de conexão');
    return { content: [{ type: 'text', text: `Texto ${chamadas.length}` }] };
  };
  return { pdf, enviar, chamadas, limpas, destruido: () => destruido };
}
test('PDF de 20 MB percorre todas as páginas na ordem e libera memória', async () => {
  const f = fixture();
  const original = { size: LIMITE_DOCUMENTO_IA, name: 'original.pdf' };
  const copia = { ...original };
  const texto = await transcreverPDFGrande(original, f.enviar, async () => f.pdf);
  assert.match(texto, /Página 1\/3:\nTexto 1[\s\S]*Página 3\/3:\nTexto 3/);
  assert.equal(f.chamadas.length, 3);
  assert.deepEqual(f.limpas, [1, 2, 3]);
  assert.equal(f.destruido(), true);
  assert.deepEqual(original, copia);
  delete globalThis.document;
});
test('falha intermediária não devolve análise parcial e preserva o original', async () => {
  const f = fixture(2);
  const original = { size: 5 * 1024 * 1024 };
  await assert.rejects(transcreverPDFGrande(original, f.enviar, async () => f.pdf), /Falha de conexão/);
  assert.equal(f.chamadas.length, 2);
  assert.deepEqual(f.limpas, [1, 2]);
  assert.equal(f.destruido(), true);
  assert.equal(original.size, 5 * 1024 * 1024);
  delete globalThis.document;
});
test('pedido grande demais é bloqueado antes da rede; falhas propagam a mensagem do servidor', async () => {
  let enviou = false;
  await assert.rejects(enviarPedidoIA('/api/ia', {}, [{ type: 'text', text: 'x'.repeat(4250000) }], 2000, async () => { enviou = true; }), /limite de análise/);
  assert.equal(enviou, false);
  await assert.rejects(enviarPedidoIA('/api/ia', {}, [{ type: 'text', text: 'teste' }], 2000, async () => ({ ok: false, json: async () => ({ erro: 'Sessão expirada' }) })), /Sessão expirada/);
});

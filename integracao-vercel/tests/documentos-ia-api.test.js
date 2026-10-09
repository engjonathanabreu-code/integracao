import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ia.js';
import { configuracaoDocumentosIA } from '../server/openai.js';

const concluida = () => ({ status: 'completed', model: 'gpt-6.1-sol', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, output: [{ type: 'message', content: [{ type: 'output_text', text: '{"tipo":"outro","campos":{},"regras":[]}' }] }] });
async function fixture(run) {
  const nomes = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_DOCUMENT_MODEL', 'OPENAI_DOCUMENT_OCR_MODEL'];
  const anteriores = Object.fromEntries(nomes.map(n => [n, process.env[n]]));
  const originalFetch = globalThis.fetch, originalLog = console.info; const chamadas = [], logs = [];
  process.env.OPENAI_API_KEY = 'ficticia'; process.env.OPENAI_MODEL = 'gpt-6-astra'; process.env.OPENAI_DOCUMENT_MODEL = 'gpt-6.1-sol'; delete process.env.OPENAI_DOCUMENT_OCR_MODEL;
  let ativo = true;
  globalThis.fetch = async (url, options) => {
    if (url.includes('/auth/')) return Response.json({ id: 'usuario-ficticio' });
    if (url.includes('/profiles?')) return Response.json([{ ativo }]);
    chamadas.push(JSON.parse(options.body)); return Response.json(concluida());
  };
  console.info = (...p) => logs.push(p);
  const invoke = async (body, authorization = 'Bearer teste', origin = 'https://integracao.example') => {
    const res = { status(n) { this.code = n; return this; }, json(d) { this.data = d; return this; }, setHeader() {} };
    await handler({ method: 'POST', headers: { authorization, origin, host: 'integracao.example' }, body }, res); return res;
  };
  try { await run({ invoke, chamadas, logs, desativar: () => { ativo = false; } }); }
  finally { globalThis.fetch = originalFetch; console.info = originalLog; for (const n of nomes) { if (anteriores[n] === undefined) delete process.env[n]; else process.env[n] = anteriores[n]; } }
}
const pedido = extra => ({ purpose: 'documentos_cliente', stage: 'analise', document_config: configuracaoDocumentosIA(), messages: [{ role: 'user', content: 'Documento fictício' }], ...extra });
test('configuração documental requer sessão ativa e não chama a OpenAI', async () => fixture(async ({ invoke, chamadas, desativar }) => {
  const body = { purpose: 'documentos_cliente', action: 'documentos_config' };
  assert.equal((await invoke(body, '')).code, 401);
  assert.equal((await invoke(body)).data.model, 'gpt-6.1-sol');
  assert.equal(chamadas.length, 0);
  desativar(); assert.equal((await invoke(body)).code, 403); assert.equal(chamadas.length, 0);
}));
test('documentos usam modelo servidor, cliente não escolhe modelo; outros fluxos mantêm global', async () => fixture(async ({ invoke, chamadas }) => {
  assert.equal((await invoke(pedido({ model: 'modelo-injetado' }))).code, 200);
  assert.equal((await invoke(pedido({ stage: 'ocr' }))).code, 200);
  assert.equal((await invoke({ messages: [{ role: 'user', content: 'Teste genérico' }], model: 'modelo-injetado' })).code, 200);
  assert.deepEqual(chamadas.map(c => c.model), ['gpt-6.1-sol', 'gpt-6.1-sol', 'gpt-6-astra']);
}));
test('configuração alterada, etapa inválida e origem externa não gastam tokens', async () => fixture(async ({ invoke, chamadas }) => {
  assert.equal((await invoke(pedido({ document_config: { model: 'antigo', ocr_model: 'antigo', version: 'v0' } }))).code, 409);
  assert.equal((await invoke(pedido({ stage: 'injetado' }))).code, 400);
  assert.equal((await invoke(pedido(), 'Bearer teste', 'https://outra.example')).code, 403);
  assert.equal(chamadas.length, 0);
}));
test('texto excessivo retorna erro explícito, sem truncar nem chamar a API', async () => fixture(async ({ invoke, chamadas }) => {
  const resposta = await invoke(pedido({ messages: [{ role: 'user', content: 'x'.repeat(120001) }] }));
  assert.equal(resposta.code, 413); assert.match(resposta.data.erro, /Texto muito extenso/);
  assert.equal(chamadas.length, 0);
}));
test('usage documental não revela conteúdo do documento e erros mantêm telemetria', async () => fixture(async ({ invoke, chamadas, logs }) => {
  const resposta = await invoke(pedido());
  assert.equal(resposta.data.usage_total.total_tokens, 15);
  assert.equal(resposta.data.usage_attempts[0].model, 'gpt-6.1-sol');
  assert.ok(!JSON.stringify(logs).includes('Documento fictício'));
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, options) => url.includes('api.openai.com')
    ? Response.json({ error: { code: 'insufficient_quota', message: 'SEGREDO' }, usage: { input_tokens: 7, output_tokens: 0, total_tokens: 7 } }, { status: 429 })
    : fetchOriginal(url, options);
  const erro = await invoke(pedido());
  assert.equal(erro.code, 429); assert.equal(erro.data.usage_total.input_tokens, 7);
  assert.ok(!JSON.stringify(erro.data).includes('SEGREDO')); assert.equal(chamadas.length, 1);
}));

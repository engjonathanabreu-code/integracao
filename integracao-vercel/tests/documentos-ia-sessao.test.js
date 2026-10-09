import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSessaoDocumentosIA, regrasDocumentoCliente, obterConfiguracaoDocumentosIA, validarResultadoDocumentoCliente } from '../src/documentos-ia-sessao.js';
import { transcreverPDFGrande, enviarPedidoIA } from '../src/documentos-ia-envio.js';

const arquivo = (texto = 'Documento fictício', type = 'application/pdf') => new File([texto], 'ficticio.pdf', { type });
const pedido = (extra = {}) => ({ arquivo: arquivo(), usuario: 'usuario-1', autorizacao: 'Bearer sessao-ficticia', escopo: { processoId: 'cliente-1' }, contexto: { tipo: 'auto', data: '2026-10-09', regras: [] }, configuracao: { model: 'modelo-teste', ocr_model: 'modelo-teste', version: 'v1' }, ...extra });
test('mesmo documento reaproveita resultado isolado e deduplica chamadas concorrentes', async () => {
  const sessao = criarSessaoDocumentosIA(); let chamadas = 0;
  const analisar = async () => { chamadas++; await new Promise(r => setTimeout(r, 5)); return { campos: { nome: 'Fictício' } }; };
  const [a, b] = await Promise.all([sessao.executar(pedido(), analisar), sessao.executar(pedido(), analisar)]);
  assert.equal(chamadas, 1); assert.deepEqual(a, b);
  a.campos.nome = 'Alterado';
  const c = await sessao.executar(pedido(), analisar);
  assert.equal(chamadas, 1); assert.equal(c.campos.nome, 'Fictício'); assert.equal(c.metaIA.reutilizada, true);
  assert.ok(!JSON.stringify(c.metaIA).includes('sessao-ficticia'));
});
test('invalida ao mudar usuário, sessão, cliente, cadastro, regra, data, arquivo, modelo ou versão', async () => {
  const mudancas = [
    { usuario: 'outro' }, { autorizacao: 'Bearer outra-sessao' }, { escopo: { processoId: 'outro' } },
    { contexto: { pessoa: 'outra' } }, { contexto: { regras: [{ instrucao: 'Nova regra' }] } },
    { contexto: { data: '2026-10-10' } }, { arquivo: arquivo('Mudou') }, { arquivo: arquivo('Documento fictício', 'image/png') },
    { configuracao: { model: 'outro', ocr_model: 'modelo-teste', version: 'v1' } },
    { configuracao: { model: 'modelo-teste', ocr_model: 'outro', version: 'v1' } },
    { configuracao: { model: 'modelo-teste', ocr_model: 'modelo-teste', version: 'v2' } },
  ];
  for (const mudanca of mudancas) {
    const sessao = criarSessaoDocumentosIA(); let n = 0;
    const analisar = async () => ({ n: ++n });
    await sessao.executar(pedido(), analisar);
    const b = await sessao.executar(pedido(mudanca), analisar);
    assert.equal(b.n, 2, JSON.stringify(mudanca));
  }
});
test('logout/fechar limpa resultados e impede conclusão ou próximas páginas de pedido antigo', async () => {
  const sessao = criarSessaoDocumentosIA(); let liberar, iniciou;
  const pronto = new Promise(r => { iniciou = r; });
  const promessa = sessao.executar(pedido(), async ({ paginas, verificar }) => {
    paginas.guardar(1, 2, 'Página fictícia'); iniciou();
    await new Promise(r => { liberar = r; });
    verificar(); return { ok: true };
  });
  await pronto; sessao.limpar(); liberar();
  await assert.rejects(promessa, /sessão ou o contexto mudou/);
  const r = await sessao.executar(pedido(), async ({ paginas }) => { assert.equal(paginas.obter(1, 2), undefined); return { ok: true }; });
  assert.equal(r.metaIA.reutilizada, false);
});
test('falha não cacheia resultado parcial e reaproveita OCR de páginas já concluídas', async () => {
  const sessao = criarSessaoDocumentosIA(); let falhar = true; const chamadas = [];
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({}), toDataURL: () => 'data:image/jpeg;base64,YQ==' }) };
  const carregar = async () => ({ numPages: 3, getPage: async n => ({ getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve() }), cleanup() {} }), destroy: async () => {} });
  const enviar = async content => {
    const numero = Number(content[1].text.match(/página (\d+)/)[1]); chamadas.push(numero);
    if (falhar && numero === 2) throw new Error('Falha de conexão');
    return { content: [{ type: 'text', text: `Página ${numero}: carimbo e assinatura fictícios` }] };
  };
  const analisar = async ({ paginas }) => ({ texto: await transcreverPDFGrande(arquivo(), enviar, carregar, paginas) });
  try {
    await assert.rejects(sessao.executar(pedido(), analisar), /conexão/);
    falhar = false;
    const completo = await sessao.executar(pedido(), analisar);
    assert.deepEqual(chamadas, [1, 2, 2, 3]);
    assert.match(completo.texto, /Página 1\/3:[\s\S]*Página 3\/3:/);
    assert.match(completo.texto, /carimbo e assinatura/);
  } finally { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; }
});
test('falha na etapa final reaproveita todo OCR sem aplicar análise parcial', async () => {
  const sessao = criarSessaoDocumentosIA(); let n = 0;
  await assert.rejects(sessao.executar(pedido(), async ({ paginas }) => { paginas.guardar(1, 1, 'Texto integral'); throw new Error('JSON inválido'); }), /JSON inválido/);
  const r = await sessao.executar(pedido(), async ({ paginas }) => { n++; return { texto: paginas.obter(1, 1) }; });
  assert.equal(n, 1); assert.equal(r.texto, 'Texto integral');
});
test('TTL e limites apenas descartam cache, sem truncar resultado ou bloquear uso', async () => {
  let tempo = 0, n = 0;
  const sessao = criarSessaoDocumentosIA({ agora: () => tempo, ttlMs: 10, maxEntradas: 1 });
  const analisar = async () => ({ n: ++n });
  await sessao.executar(pedido(), analisar); tempo = 11;
  assert.equal((await sessao.executar(pedido(), analisar)).n, 2);
  await sessao.executar(pedido({ arquivo: arquivo('outro') }), analisar);
  assert.equal((await sessao.executar(pedido(), analisar)).n, 4);
  const pequeno = criarSessaoDocumentosIA({ maxBytes: 10 }); const texto = 'Tudo '.repeat(100);
  for (let i = 0; i < 2; i++) assert.equal((await pequeno.executar(pedido(), async () => ({ texto }))).texto, texto);
});
test('não omite regras após a vigésima nem muda objetos originais', () => {
  const regras = Array.from({ length: 25 }, (_, i) => ({ id: String(i), ativa: true, tipos: ['identidade'] }));
  assert.equal(regrasDocumentoCliente(regras, 'auto').length, 25);
  assert.equal(regrasDocumentoCliente(regras, 'comp_posse').length, 0);
  assert.equal(regras.length, 25);
});
test('configuração é buscada com autenticação e falhas de acesso não retornam cache', async () => {
  let pedidoCapturado;
  const config = await obterConfiguracaoDocumentosIA('/api/ia', { Authorization: 'Bearer teste' }, async (_, p) => { pedidoCapturado = p; return Response.json({ model: 'modelo', ocr_model: 'modelo', version: 'v1' }); });
  assert.equal(pedidoCapturado.headers.Authorization, 'Bearer teste'); assert.equal(config.model, 'modelo');
  assert.equal(JSON.parse(pedidoCapturado.body).action, 'documentos_config');
  await assert.rejects(obterConfiguracaoDocumentosIA('/api/ia', {}, async () => Response.json({ erro: 'Sessão expirada' }, { status: 401 })), /Sessão expirada/);
});
test('envio genérico mantém contrato; somente pedido documental envia purpose/configuração', async () => {
  const corpos = []; const fetcher = async (_, p) => { corpos.push(JSON.parse(p.body)); return Response.json({ content: [] }); };
  await enviarPedidoIA('/api/ia', {}, [{ type: 'text', text: 'fictício' }], 2000, fetcher);
  await enviarPedidoIA('/api/ia', {}, [{ type: 'text', text: 'fictício' }], 2000, fetcher, { stage: 'ocr', configuracao: pedido().configuracao });
  assert.deepEqual(Object.keys(corpos[0]).sort(), ['max_tokens', 'messages']);
  assert.equal(corpos[1].purpose, 'documentos_cliente'); assert.equal(corpos[1].stage, 'ocr');
});
test('JSON vazio ou malformado não entra no cache nem descarta o arquivo; retry pode completar', async () => {
  const valido = { tipo: 'outro', legivel: true, confianca: 0.9, pessoa: 'indefinido', campos: {}, regras: [], alertas: [], vinculo: { pertenceAoProcesso: 'indefinido', divergencias: [] }, analise: { qualidade: 'boa', encontrado: [], melhorar: [] } };
  for (const invalido of [{}, { ...valido, regras: {} }, { ...valido, campos: [] }, { ...valido, alertas: [{}] }, { ...valido, campos: { nome: {} } }, { ...valido, analise: { ...valido.analise, encontrado: 'texto' } }]) {
    const sessao = criarSessaoDocumentosIA();
    await assert.rejects(sessao.executar(pedido(), async () => validarResultadoDocumentoCliente(invalido)), /formato inválido/);
    const r = await sessao.executar(pedido(), async () => validarResultadoDocumentoCliente(valido));
    assert.equal(r.tipo, 'outro'); assert.equal(r.metaIA.reutilizada, false);
  }
});
test('regra aplicável omitida ou duplicada falha explicitamente antes de cachear', () => {
  const res = { tipo: 'identidade', legivel: true, confianca: 0.9, pessoa: 'conjuge', campos: {}, regras: [], alertas: [] };
  const regras = [{ id: 'assinatura', ativa: true, tipos: ['identidade_conjuge'], gravidade: 'bloqueia' }];
  assert.throws(() => validarResultadoDocumentoCliente(res, regras), /todas as regras aplicáveis/);
  const item = { id: 'assinatura', resultado: 'atende' };
  assert.throws(() => validarResultadoDocumentoCliente({ ...res, regras: [item, item] }, regras), /todas as regras aplicáveis/);
  assert.equal(validarResultadoDocumentoCliente({ ...res, regras: [item] }, regras).regras.length, 1);
  assert.throws(() => validarResultadoDocumentoCliente({ ...res, tipo: 'tipo-inventado' }, [], { outro: 'Outro' }), /formato inválido/);
});

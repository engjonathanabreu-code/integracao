import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarSessaoDocumentosIA, regrasDocumentoCliente } from '../src/documentos-ia-sessao.js';

// Executa os handlers reais da aba com hooks mínimos. Não renderiza JSX nem usa clientes reais.
const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const inicio = source.indexOf('function AbaDocumentos(');
const handlers = source.slice(inicio, source.indexOf('  const validar =', inicio))
  + 'return { analisar, analisarLote, escolher, descartarArquivo, tirarDaLista, estado, arquivos, resultado, erro, lote }; }';
function tela({ responder = async () => ({ tipo: 'outro', campos: {}, regras: [], metaIA: { model: 'modelo-teste' } }) } = {}) {
  const hooks = []; let index = 0, efeitos = [], chamadas = 0, configs = 0;
  const p = { id: 'p1', municipioId: 'm1', nucleoId: 'n1', docs: [] };
  const props = { p, db: { processos: [p] }, usuario: { id: 'u1', nome: 'Usuário fictício' }, perm: { editarClientes: true }, rascunho: { requerente: { nome: 'Pessoa fictícia' }, conjuge: {}, endereco: {}, social: {} }, setToast() {}, aplicarIA() {}, cancelado: false };
  props.mutar = fn => fn(props.db);
  const dependencias = {
    useState(inicial) { const n = index++; hooks[n] ||= { valor: inicial }; return [hooks[n].valor, v => { hooks[n].valor = typeof v === 'function' ? v(hooks[n].valor) : v; }]; },
    useRef(inicial) { const n = index++; hooks[n] ||= { current: inicial }; return hooks[n]; },
    useEffect(fn, deps) { const n = index++, anterior = hooks[n]; if (!anterior || deps.some((v, i) => v !== anterior.deps[i])) efeitos.push(() => { anterior?.cleanup?.(); hooks[n] = { deps, cleanup: fn() }; }); },
    criarSessaoDocumentosIA, regrasDocumentoCliente,
    regrasDoMunicipio: () => [], nucleoDe: () => null, municipioDe: () => null, cpfValido: () => false,
    DOC_TIPOS: { outro: 'Outro' }, montarLinhas: () => [], uid: () => `d${p.docs.length}`,
    TIPOS_ACEITOS: ['application/pdf'], LIMITE_DOCUMENTO_IA: 20 * 1024 * 1024, MAX_LOTE: 10,
    cabecalhosIA: async () => ({ Authorization: 'Bearer teste' }), URL_IA: '/api/ia',
    obterConfiguracaoDocumentosIA: async () => { configs++; return { model: 'modelo-teste', ocr_model: 'modelo-teste', version: 'v1' }; },
    analisarDocumentoIA: async (...args) => { chamadas++; return responder(...args); },
    enviarPedidoIA: async () => { throw new Error('Nenhuma rede é permitida neste teste.'); },
  };
  const componente = new Function(...Object.keys(dependencias), `return (${handlers});`)(...Object.values(dependencias));
  const render = () => { index = 0; efeitos = []; const r = componente(props); efeitos.forEach(f => f()); return r; };
  const fechar = () => hooks.forEach(h => h?.cleanup?.());
  return { render, fechar, props, chamadas: () => chamadas, configs: () => configs };
}
const arquivo = (texto = 'Documento fictício') => new File([texto], `${texto}.pdf`, { type: 'application/pdf' });
test('double click dispara uma análise e reanexo idêntico usa cache sem duplicar histórico', async () => {
  const t = tela(); let r = t.render(); r.escolher([arquivo()]); r = t.render();
  await Promise.all([r.analisar(), r.analisar()]);
  assert.equal(t.chamadas(), 1); assert.equal(t.props.p.docs.length, 1);
  r = t.render(); assert.equal(r.arquivos.length, 0); assert.equal(r.estado, 'resultado');
  r.escolher([arquivo()]); r = t.render(); await r.analisar(); r = t.render();
  assert.equal(t.chamadas(), 1); assert.equal(t.configs(), 2); assert.equal(t.props.p.docs.length, 1);
  assert.equal(r.resultado.metaIA.reutilizada, true);
});
test('lote mantém somente os arquivos falhos e nova tentativa não reanalisa sucessos', async () => {
  let falhar = true;
  const t = tela({ responder: async f => { if (f.name.startsWith('falho') && falhar) throw new Error('Falha fictícia'); return { tipo: 'outro', campos: {}, regras: [] }; } });
  const falho = arquivo('falho'), bom = arquivo('bom'); let r = t.render(); r.escolher([bom, falho]); r = t.render();
  await r.analisarLote(); r = t.render();
  assert.deepEqual(r.arquivos, [falho]); assert.equal(t.props.p.docs.length, 1); assert.equal(r.estado, 'erro');
  assert.match(r.erro, /continuam na fila/); assert.equal(t.chamadas(), 2);
  falhar = false; await r.analisar(); r = t.render();
  assert.equal(t.chamadas(), 3); assert.equal(t.props.p.docs.length, 2); assert.equal(r.arquivos.length, 0);
});
test('fechar/logout durante leitura não aplica resultado tardio nem continua lote', async () => {
  let liberar, iniciou;
  const pronto = new Promise(r => { iniciou = r; });
  const t = tela({ responder: async () => { iniciou(); await new Promise(r => { liberar = r; }); return { tipo: 'outro', campos: {}, regras: [] }; } });
  let r = t.render(); r.escolher([arquivo('um'), arquivo('dois')]); r = t.render();
  const operacao = r.analisarLote(); await pronto; t.fechar(); liberar(); await operacao;
  assert.equal(t.props.p.docs.length, 0); assert.equal(t.chamadas(), 1);
});
test('alteração de cadastro durante análise invalida resposta e preserva documento', async () => {
  let liberar, iniciou;
  const pronto = new Promise(r => { iniciou = r; });
  const t = tela({ responder: async () => { iniciou(); await new Promise(r => { liberar = r; }); return { tipo: 'outro', campos: {}, regras: [] }; } });
  let r = t.render(); r.escolher([arquivo()]); r = t.render();
  const operacao = r.analisar(); await pronto;
  t.props.rascunho.requerente.nome = 'Outro nome'; t.render(); liberar(); await operacao;
  r = t.render(); assert.equal(t.props.p.docs.length, 0); assert.equal(r.arquivos.length, 1); assert.equal(r.estado, 'erro');
});
test('controles e handlers respeitam bloqueio durante lote e permissão revogada', async () => {
  let liberar, iniciou;
  const pronto = new Promise(r => { iniciou = r; });
  const t = tela({ responder: async () => { iniciou(); await new Promise(r => { liberar = r; }); return { tipo: 'outro', campos: {}, regras: [] }; } });
  const original = arquivo('um'); let r = t.render(); r.escolher([original]); r = t.render();
  const operacao = r.analisar(); await pronto;
  r.escolher([arquivo('outro')]); r.descartarArquivo(); r.tirarDaLista(0);
  assert.deepEqual(t.render().arquivos, [original]);
  t.props.perm = {}; r = t.render(); liberar(); await operacao;
  await r.analisar(); assert.equal(t.chamadas(), 1); assert.equal(t.props.p.docs.length, 0);
});

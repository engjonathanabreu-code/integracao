import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { destinoDocumento } from '../src/documentos-pessoas.js';
import { marcarPlausibilidade, selecaoInicialSugestoes, sugestoesSelecionadas } from '../src/documentos-ia-plausibilidade.js';
import { regrasDocumentoCliente, validarResultadoDocumentoCliente } from '../src/documentos-ia-sessao.js';

// Executa os handlers reais do "Novo morador" com hooks mínimos e IA simulada. Sem rede e sem JSX.
const fonte = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const inicioModal = fonte.indexOf('function ModalMorador(');
const modal = fonte.slice(inicioModal, fonte.indexOf('function ModalVincular(', inicioModal));
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const setPath = (o, p, v) => { const a = p.split('.'); const k = a.pop(); a.reduce((x, c) => x[c] ??= {}, o)[k] = v; };
const so = v => String(v ?? '').replace(/\D/g, '');
const MAPA_IA = { nome: { rot: 'Nome', campo: 'nome' }, cpf: { rot: 'CPF', campo: 'cpf' }, rg: { rot: 'RG', campo: 'rg' }, nascimento: { rot: 'Nascimento', campo: 'nascimento' }, mae: { rot: 'Mãe', campo: 'mae' }, logradouro: { rot: 'Logradouro', path: 'endereco.logradouro' } };
const depsLinhas = { marcarPlausibilidade, destinoDocumento, preenchido: v => String(v ?? '').trim() !== '', getPath, normalizar: v => String(v).toLowerCase(), so, MAPA_IA };
const montarLinhas = new Function(...Object.keys(depsLinhas), fonte.slice(fonte.indexOf('function montarLinhas('), fonte.indexOf('/* ---------------- gerador de PRF')) + ';return montarLinhas;')(...Object.values(depsLinhas));
const REGRAS = [{ id: 'r1', nome: 'Regra fictícia', ativa: true, tipos: ['identidade'], gravidade: 'alerta', instrucao: 'x' }];
const resposta = (campos) => ({ tipo: 'identidade', legivel: true, confianca: 0.9, pessoa: 'requerente', campos: { nome: 'Requerente Fictício', ...campos }, regras: [{ id: 'r1', resultado: 'atende' }], alertas: [] });

function tela({ ia }) {
  const corpo = modal.slice(modal.indexOf('  const atualizarItem ='), modal.indexOf('  const removerItem ='));
  const st = { fila: [], divergencias: [], selecaoIA: {}, preenchidos: 0, processando: false, rascunho: null };
  const aplicarSetter = (k) => (v) => { st[k] = typeof v === 'function' ? v(st[k]) : v; };
  const chamadas = [];
  const d = {
    filaRef: { current: [] }, setFila: aplicarSetter('fila'), rascunhoRef: { current: null }, setRascunho: aplicarSetter('rascunho'),
    setPasso() {}, setErroArquivo() {}, inputRef: { current: null }, arquivosRef: { current: {} }, idMorador: { current: 'p-novo' },
    montarMorador: () => ({}), acessoCRM: () => ({}), TIPOS_ACEITOS: ['application/pdf'], LIMITE_DOCUMENTO_IA: 20 * 1024 * 1024, uid: (() => { let n = 0; return p => `${p}-${++n}`; })(),
    DOC_TIPOS: { identidade: 'Identidade', outro: 'Outro' }, destinoDocumento, extrair: x => structuredClone(x), montarLinhas, clone: structuredClone, setPath,
    regrasAplicaveis: (r, t) => r.filter(x => x.tipos.includes(t)), regrasDoMunicipio: () => REGRAS, db: {}, municipio: { id: 'm1' },
    INSTRUCAO_RESIDENCIA_SEIS_MESES: 'n/a', avaliarPrazoResidencia: () => null, usuario: { nome: 'Atendente fictícia' },
    setProcessando: aplicarSetter('processando'), impressaoDigital: async () => 'impressao-ficticia', simularAnalise: () => { throw new Error('simulação não usada neste teste'); },
    regrasDocumentoCliente, selecaoInicialSugestoes, sugestoesSelecionadas,
    analisarDocumentoIA: async (...args) => { chamadas.push(args); const r = await ia(...args); validarResultadoDocumentoCliente(r, args[4].regrasObrigatorias, { identidade: 'Identidade' }); return r; },
    setPreenchidos: aplicarSetter('preenchidos'), setDivergencias: aplicarSetter('divergencias'), setSelecaoIA: aplicarSetter('selecaoIA'),
  };
  // Os handlers leem o estado do render corrente; o teste refaz o "render" a cada passo.
  const render = () => new Function(...Object.keys(d), 'divergencias', 'selecaoIA', `${corpo}; return { analisar, aplicarSugestoes, dispensarSugestoes, definirRascunho };`)(...Object.values(d), st.divergencias, st.selecaoIA);
  const ficha = () => d.rascunhoRef.current;
  const enfileirar = (id = 'arq-1') => { d.arquivosRef.current[id] = { name: 'rg-ficticio.pdf', size: 10 }; d.filaRef.current = [...d.filaRef.current, { id, nome: 'rg-ficticio.pdf', tamanho: 10, tipoEsperado: 'identidade', estado: 'fila', erro: '', resumo: '' }]; };
  render().definirRascunho({ id: 'p-novo', requerente: { nome: 'Requerente Fictício', cpf: '529.982.247-25', mae: 'Mãe Digitada' }, conjuge: {}, endereco: {}, docs: [] });
  return { render, st, ficha, enfileirar, chamadas, filaRef: d.filaRef };
}

test('IA-C1: a análise não preenche a ficha; tudo vira sugestão com a mesma seleção da aba Documentos', async () => {
  const t = tela({ ia: async () => resposta({ rg: 'RG-FICTICIO', nascimento: '1971-05-14', mae: 'Mãe do Documento' }) });
  t.enfileirar(); await t.render().analisar();
  assert.equal(t.filaRef.current[0].estado, 'ok');
  assert.match(t.filaRef.current[0].resumo, /3 campos sugeridos, 1 para conferir/);
  // Nenhum campo lido entrou na ficha; só o registro do documento.
  assert.equal(t.ficha().requerente.rg, undefined); assert.equal(t.ficha().requerente.nascimento, undefined); assert.equal(t.ficha().requerente.mae, 'Mãe Digitada');
  assert.equal(t.ficha().docs.length, 1); assert.equal(t.st.preenchidos, 0);
  assert.deepEqual(t.st.divergencias.map(l => l.path), ['requerente.rg', 'requerente.nascimento', 'requerente.mae']);
  // Campo vazio vem marcado; campo que diverge do digitado vem desmarcado (igual à aba Documentos).
  assert.deepEqual(t.st.selecaoIA, { 'requerente.rg': true, 'requerente.nascimento': true, 'requerente.mae': false });
});
test('IA-C1: só os campos aceitos entram na ficha; os desmarcados ficam como estavam', async () => {
  const t = tela({ ia: async () => resposta({ rg: 'RG-FICTICIO', nascimento: '1971-05-14', mae: 'Mãe do Documento' }) });
  t.enfileirar(); await t.render().analisar();
  t.st.selecaoIA = { ...t.st.selecaoIA, 'requerente.nascimento': false };
  t.render().aplicarSugestoes();
  assert.equal(t.ficha().requerente.rg, 'RG-FICTICIO');
  assert.equal(t.ficha().requerente.nascimento, undefined);
  assert.equal(t.ficha().requerente.mae, 'Mãe Digitada');
  assert.equal(t.st.preenchidos, 1); assert.deepEqual(t.st.divergencias, []); assert.deepEqual(t.st.selecaoIA, {});
});
test('IA-C1: dispensar as sugestões não altera a ficha', async () => {
  const t = tela({ ia: async () => resposta({ rg: 'RG-FICTICIO' }) });
  t.enfileirar(); await t.render().analisar();
  const antes = structuredClone(t.ficha());
  t.render().dispensarSugestoes();
  assert.deepEqual(t.ficha(), antes); assert.equal(t.st.preenchidos, 0); assert.deepEqual(t.st.divergencias, []);
});
test('IA-C1: data impossível lida pela IA não vem marcada nem é aplicada, mesmo com a seleção forçada', async () => {
  const t = tela({ ia: async () => resposta({ rg: 'RG-FICTICIO', nascimento: '1990-02-31' }) });
  t.enfileirar(); await t.render().analisar();
  assert.equal(t.st.selecaoIA['requerente.nascimento'], false);
  assert.match(t.st.divergencias.find(l => l.path === 'requerente.nascimento').implausivel, /impossível/);
  t.st.selecaoIA = { 'requerente.rg': true, 'requerente.nascimento': true };
  t.render().aplicarSugestoes();
  assert.equal(t.ficha().requerente.nascimento, undefined); assert.equal(t.ficha().requerente.rg, 'RG-FICTICIO'); assert.equal(t.st.preenchidos, 1);
});
test('IA-C1: a resposta passa pela mesma validação da aba Documentos; resposta torta não gera sugestão', async () => {
  const t = tela({ ia: async () => ({ tipo: 'identidade', campos: { nome: 'Requerente Fictício', rg: { numero: 1 } } }) });
  t.enfileirar(); await t.render().analisar();
  assert.equal(t.filaRef.current[0].estado, 'erro'); assert.match(t.filaRef.current[0].erro, /formato inválido/);
  assert.deepEqual(t.st.divergencias, []); assert.equal(t.ficha().docs.length, 0); assert.equal(t.ficha().requerente.rg, undefined);
  // A chamada real pede a validação com as regras do município (quinto argumento), como na aba Documentos.
  assert.deepEqual(t.chamadas[0][4], { regrasObrigatorias: REGRAS });
  assert.deepEqual(t.chamadas[0][2], REGRAS);
  // Regra obrigatória não verificada também é recusada.
  const u = tela({ ia: async () => ({ ...resposta({ rg: 'RG-FICTICIO' }), regras: [] }) });
  u.enfileirar(); await u.render().analisar();
  assert.equal(u.filaRef.current[0].estado, 'erro'); assert.match(u.filaRef.current[0].erro, /não verificou todas as regras/); assert.deepEqual(u.st.divergencias, []);
});
test('IA-C1: sugestões pendentes impedem concluir sem decisão e a tela não promete preenchimento automático', () => {
  assert.match(modal, /disabled=\{processando \|\| pendentesFila > 0 \|\| divergencias\.length > 0\} onClick=\{concluir\}/);
  assert.match(modal, /Preencha os campos escolhidos ou dispense as sugestões da IA para concluir\./);
  assert.match(modal, /<button className="btn btn-primario" disabled=\{processando \|\| !qtdSugestoesIA\} onClick=\{aplicarSugestoes\}>/);
  assert.match(modal, /checked=\{!!selecaoIA\[d\.path\] && !d\.implausivel\} disabled=\{processando \|\| !!d\.implausivel\}/);
  assert.doesNotMatch(modal, /a IA preenche o restante da ficha/);
  assert.doesNotMatch(modal, /A IA lê cada um, preenche a ficha/);
  assert.doesNotMatch(modal, /aplicar\.forEach\(\(l\) => setPath\(novo/);
  assert.doesNotMatch(modal, /Usar o do documento/);
});

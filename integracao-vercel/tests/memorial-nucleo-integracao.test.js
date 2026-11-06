import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';

// Executa os handlers reais do App, extraídos da AST, sem montar React ou
// substituir regras por reimplementações. Todos os cadastros são fictícios.
const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(fonte, { sourceType: 'module', plugins: ['jsx'] });
const funcao = nome => ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === nome);
const componente = funcao('AbaMemorialNucleo');
const salvar = componente.body.body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : []).find(n => n.id.name === 'salvar').init;
const efeitoRemoto = componente.body.body.find(n => n.type === 'ExpressionStatement' && n.expression.callee?.name === 'useEffect').expression.arguments[0];
const avaliar = (no, contexto) => vm.runInNewContext(`(${fonte.slice(no.start, no.end)})`, contexto);

function contextoSalvar({ texto = 'Rascunho local', salvo = 'Base original', atual = salvo, confirmar } = {}) {
  const registro = { id: 'nucleo-ficticio', municipioId: 'municipio-ficticio', codigo: 'NU-TESTE', memorial: { texto: atual, responsavel: 'Responsável fictício', vertices: [{ nome: 'V01' }] } };
  const estados = { textos: [], erros: [], toast: [], salvando: [], confirmacaoPendente: [] };
  const contexto = {
    pode: true, texto, salvo, base: { current: 'Base original' }, emCurso: { current: false },
    tentativaMemorial: { current: null },
    n: registro, usuario: { nome: 'Pessoa de teste' },
    setSalvando: v => estados.salvando.push(v), setErro: v => estados.erros.push(v),
    setConfirmacaoPendente: v => estados.confirmacaoPendente.push(v),
    setTexto: v => { contexto.texto = typeof v === 'function' ? v(contexto.texto) : v; estados.textos.push(contexto.texto); }, setToast: v => estados.toast.push(v),
    mutar: { confirmado: confirmar || (async fn => fn({ nucleos: [registro] })) },
  };
  return { contexto, registro, estados, executar: avaliar(salvar, contexto) };
}

test('memorial: sincronização conserva base e rascunho enquanto houver edição local', () => {
  let texto = 'Rascunho local';
  const contexto = { get texto() { return texto; }, salvo: 'Texto de outra sessão', base: { current: 'Base original' }, tentativaMemorial: { current: null }, setTexto: v => { texto = typeof v === 'function' ? v(texto) : v; } };
  avaliar(efeitoRemoto, contexto)();
  assert.equal(texto, 'Rascunho local');
  assert.equal(contexto.base.current, 'Base original');
  texto = 'Base original';
  avaliar(efeitoRemoto, contexto)();
  assert.equal(texto, 'Texto de outra sessão');
  assert.equal(contexto.base.current, 'Texto de outra sessão');
});

test('memorial: gravação não sobrescreve atualização recebida durante o rascunho', async () => {
  const { executar, registro, estados, contexto } = contextoSalvar({ salvo: 'Texto de outra sessão' });
  const antes = JSON.stringify(registro);
  await executar();
  assert.equal(JSON.stringify(registro), antes);
  assert.match(estados.erros.at(-1), /outra pessoa/);
  assert.equal(estados.toast.length, 0);
  assert.equal(estados.textos.length, 0);
  assert.equal(contexto.base.current, 'Base original');
});

test('memorial: sucesso depende da persistência e falha mantém o rascunho', async () => {
  let confirmar, chamadas = 0;
  const pendente = new Promise(resolve => { confirmar = resolve; });
  const a = contextoSalvar({ confirmar: async fn => { chamadas++; await pendente; fn({ nucleos: [a.registro] }); } });
  const gravacao = a.executar();
  await a.executar();
  assert.equal(chamadas, 1);
  assert.equal(a.estados.toast.length, 0);
  assert.equal(a.contexto.base.current, 'Base original');
  confirmar(); await gravacao;
  assert.equal(a.registro.memorial.texto, 'Rascunho local');
  assert.equal(a.registro.memorial.responsavel, 'Responsável fictício');
  assert.equal(a.registro.memorial.vertices[0].nome, 'V01');
  assert.equal(a.contexto.base.current, 'Rascunho local');
  assert.deepEqual(a.estados.textos, ['Rascunho local']);
  assert.equal(a.contexto.tentativaMemorial.current, null);
  assert.equal(a.estados.confirmacaoPendente.at(-1), false);
  assert.equal(a.estados.toast.length, 1);
  const b = contextoSalvar({ confirmar: async () => { throw new Error('Rede indisponível'); } });
  await b.executar();
  assert.equal(b.contexto.base.current, 'Base original');
  assert.equal(b.estados.textos.length, 0);
  assert.equal(b.estados.toast.length, 0);
  assert.equal(b.estados.erros.at(-1), 'Rede indisponível');
});

test('memorial: PDF e DOCX verificam núcleo/documentos sem exigir exportar clientes', async () => {
  const no = funcao('baixarMemorialNucleo');
  for (const formato of [undefined, 'docx', 'pdf']) {
    const permissoes = [], arquivos = [];
    const baixar = avaliar(no, { exigirAcao: async (r, a) => permissoes.push(`${r}.${a}`), documentoDocx: { baixarDocx: (...args) => arquivos.push(['docx', ...args]) }, documentoPdf: { baixarPdf: (...args) => arquivos.push(['pdf', ...args]) } });
    await baixar('<p>Memorial fictício</p>', 'Título', {}, 'arquivo', formato);
    assert.deepEqual(permissoes, ['nucleos.exportar', 'documentos.exportar']);
    assert.equal(arquivos[0][0], formato || 'docx');
  }
  for (const negado of ['nucleos', 'documentos']) {
    let baixou = false;
    const baixar = avaliar(no, { exigirAcao: async r => { if (r === negado) throw new Error('Sem autorização'); }, documentoDocx: { baixarDocx: () => { baixou = true; } }, documentoPdf: { baixarPdf: () => { baixou = true; } } });
    await assert.rejects(baixar('texto', 'título', {}, 'arquivo', 'pdf'), /autorização/);
    assert.equal(baixou, false);
  }
});

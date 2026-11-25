import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarAnaliseTeorDevolutiva, validarConferenciaDevolutiva, prontoParaReenviarDevolutiva, erroRespostaDevolutivaIA, ERRO_FORMATO_DEVOLUTIVA_IA, MAX_ITENS_DEVOLUTIVA_IA } from '../src/devolutivas-ia-validacao.js';

// Respostas simuladas: nenhum teste chama a IA nem a rede.
const fonte = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const formato = /formato inválido/;
const exigencias = [{ id: 'iv1', categoria: 'areas', descricao: 'Corrigir a área do lote fictício' }, { id: 'iv2', categoria: 'lei', descricao: 'Citar a lei municipal fictícia' }];
const conferencia = (extra = {}) => ({ resumo: 'Tudo conferido', pronto: true, itens: [{ refItemId: 'iv1', status: 'corrigido', observacao: 'ok' }, { refItemId: 'iv2', status: 'corrigido' }], pendencias: [], naoIdentificado: [], ...extra });

test('IA-M3: etapa 1 válida devolve só os campos conhecidos e normaliza categoria desconhecida', () => {
  const r = validarAnaliseTeorDevolutiva({ resumo: '  Resumo fictício ', lixo: { a: 1 }, itens: [
    { categoria: 'areas', descricao: ' Corrigir área ', statusEsperado: 'Área igual ao memorial', id: 'forjado', __proto__: { x: 1 }, extra: [1] },
    { categoria: 'inventada', descricao: 'Outra exigência', statusEsperado: null },
  ], naoIdentificado: ['trecho ilegível', '  '] });
  assert.deepEqual(r, { resumo: 'Resumo fictício', itens: [
    { categoria: 'areas', descricao: 'Corrigir área', statusEsperado: 'Área igual ao memorial' },
    { categoria: 'outro', descricao: 'Outra exigência', statusEsperado: '' },
  ], naoIdentificado: ['trecho ilegível'] });
});
test('IA-M3: etapa 1 aceita devolutiva sem exigências e campos opcionais ausentes', () => {
  assert.deepEqual(validarAnaliseTeorDevolutiva({ itens: [] }), { resumo: '', itens: [], naoIdentificado: [] });
});
test('IA-M3: etapa 1 recusa resposta malformada, campos faltando e tipos errados', () => {
  for (const ruim of [null, undefined, 'texto', 7, [], {}, { itens: null }, { itens: 'a' }, { itens: {} },
    { itens: [null] }, { itens: ['a'] }, { itens: [[]] }, { itens: [{}] }, { itens: [{ descricao: '' }] }, { itens: [{ descricao: '   ' }] },
    { itens: [{ descricao: 5 }] }, { itens: [{ descricao: { texto: 'x' } }] }, { itens: [{ descricao: 'ok', statusEsperado: 3 }] },
    { resumo: 9, itens: [] }, { resumo: ['x'], itens: [] }, { itens: [], naoIdentificado: 'x' }, { itens: [], naoIdentificado: [1] }, { itens: [], naoIdentificado: [{}] },
    { itens: Array.from({ length: MAX_ITENS_DEVOLUTIVA_IA + 1 }, () => ({ descricao: 'x' })) },
  ]) assert.throws(() => validarAnaliseTeorDevolutiva(ruim), formato, JSON.stringify(ruim)?.slice(0, 80));
});
test('IA-M3: textos gigantes são cortados em vez de gravados inteiros', () => {
  const r = validarAnaliseTeorDevolutiva({ resumo: 'r'.repeat(9000), itens: [{ descricao: 'd'.repeat(9000) }] });
  assert.equal(r.resumo.length, 4000); assert.equal(r.itens[0].descricao.length, 4000);
});
test('IA-M3: etapa 2 válida sai na ordem das exigências, sem campos extras', () => {
  const r = validarConferenciaDevolutiva({ ...conferencia(), itens: [{ refItemId: 'iv2', status: 'corrigido', lixo: 1 }, { refItemId: 'iv1', status: 'corrigido', observacao: ' visto ' }], sobra: true }, exigencias);
  assert.deepEqual(r, { resumo: 'Tudo conferido', pronto: true, itens: [{ refItemId: 'iv1', status: 'corrigido', observacao: 'visto' }, { refItemId: 'iv2', status: 'corrigido', observacao: '' }], pendencias: [], naoIdentificado: [] });
});
test('IA-M3: etapa 2 recusa resposta malformada, campos faltando e tipos errados', () => {
  for (const ruim of [null, 'x', [], {}, { itens: [] }, { pendencias: [] }, { itens: 'x', pendencias: [] }, { itens: [null], pendencias: [] }, { itens: ['iv1'], pendencias: [] },
    { itens: [], pendencias: 'nenhuma' }, { itens: [], pendencias: [null] }, { itens: [], pendencias: ['falta x'] }, { itens: [], pendencias: [{}] }, { itens: [], pendencias: [{ descricao: 4 }] },
    { itens: [], pendencias: [{ descricao: 'x', oQueFazer: 1 }] }, { itens: [{ refItemId: 'iv1', status: 'corrigido', observacao: 5 }], pendencias: [] },
    { itens: [], pendencias: [], resumo: {} }, { itens: [], pendencias: [], naoIdentificado: 'x' }, { itens: [], pendencias: [], naoIdentificado: [null] },
  ]) assert.throws(() => validarConferenciaDevolutiva(ruim, exigencias), formato, JSON.stringify(ruim));
});
test('IA-M3: itens extras são ignorados e avisados; não entram na meta', () => {
  const r = validarConferenciaDevolutiva(conferencia({ itens: [...conferencia().itens, { refItemId: 'inventado', status: 'corrigido' }, { status: 'corrigido' }, { refItemId: 7, status: 'corrigido' }] }), exigencias);
  assert.deepEqual(r.itens.map(i => i.refItemId), ['iv1', 'iv2']);
  assert.match(r.naoIdentificado.at(-1), /3 itens que não correspondem/);
  assert.equal(r.pronto, true);
  const um = validarConferenciaDevolutiva(conferencia({ itens: [...conferencia().itens, { refItemId: 'x', status: 'nao_corrigido' }] }), exigencias);
  assert.match(um.naoIdentificado.at(-1), /1 item que não corresponde/);
});
test('IA-M3: pendência com referência desconhecida perde a referência, mas continua pendência', () => {
  const r = validarConferenciaDevolutiva(conferencia({ pronto: false, pendencias: [{ refItemId: 'inventado', descricao: 'Falta a planta', oQueFazer: 'Anexar', extra: 1 }, { refItemId: 'iv1', descricao: 'Falta assinar' }] }), exigencias);
  assert.deepEqual(r.pendencias, [{ refItemId: '', descricao: 'Falta a planta', oQueFazer: 'Anexar' }, { refItemId: 'iv1', descricao: 'Falta assinar', oQueFazer: '' }]);
  assert.equal(r.pronto, false);
});
test('IA-M3: JSON quebrado vira mensagem de formato; falha de serviço passa como veio', () => {
  assert.throws(() => erroRespostaDevolutivaIA(new SyntaxError('Unexpected token')), e => e.message === ERRO_FORMATO_DEVOLUTIVA_IA);
  const rede = new Error('o serviço respondeu com código 503');
  assert.throws(() => erroRespostaDevolutivaIA(rede), e => e === rede);
});
test('IA-M3/IA-M1: a tela só usa respostas da IA de devolutiva depois do validador', () => {
  assert.match(fonte, /return validarAnaliseTeorDevolutiva\(await chamarIA\(\[\.\.\.blocos, \{ type: "text", text: instrucao \}\]\)\.catch\(erroRespostaDevolutivaIA\)\);/);
  assert.match(fonte, /return validarConferenciaDevolutiva\(await chamarIA\(\[\.\.\.blocosOriginais, \.\.\.blocosResposta, \{ type: "text", text: instrucao \}\], 6000\)\.catch\(erroRespostaDevolutivaIA\), itensEtapa1\);/);
  // Nenhuma outra chamada direta devolve a resposta crua.
  assert.equal(fonte.match(/chamarIA\(/g).length, 3);
});

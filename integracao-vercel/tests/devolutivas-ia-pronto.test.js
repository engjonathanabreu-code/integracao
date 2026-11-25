import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarConferenciaDevolutiva, prontoParaReenviarDevolutiva } from '../src/devolutivas-ia-validacao.js';

// Respostas simuladas: nenhum teste chama a IA nem a rede.
const fonte = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const exigencias = [{ id: 'iv1', categoria: 'areas', descricao: 'Corrigir a área do lote fictício' }, { id: 'iv2', categoria: 'lei', descricao: 'Citar a lei municipal fictícia' }];
const conferencia = (extra = {}) => ({ resumo: 'Tudo conferido', pronto: true, itens: [{ refItemId: 'iv1', status: 'corrigido', observacao: 'ok' }, { refItemId: 'iv2', status: 'corrigido' }], pendencias: [], naoIdentificado: [], ...extra });

test('IA-M1: pronto só quando TODAS as exigências vêm como corrigidas', () => {
  assert.equal(validarConferenciaDevolutiva(conferencia(), exigencias).pronto, true);
  for (const status of ['nao_corrigido', 'nao_verificavel']) {
    const r = validarConferenciaDevolutiva(conferencia({ itens: [{ refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv2', status }] }), exigencias);
    assert.equal(r.pronto, false, status);
  }
});
test('IA-M1: lista vazia nunca conta como pronto, mesmo com pronto:true da IA', () => {
  const r = validarConferenciaDevolutiva(conferencia({ itens: [] }), exigencias);
  assert.equal(r.pronto, false);
  assert.deepEqual(r.itens.map(i => i.status), ['nao_verificavel', 'nao_verificavel']);
  assert.match(r.itens[0].observacao, /não devolveu a conferência/);
  // Sem exigências registradas na etapa 1 também não há o que declarar pronto.
  assert.equal(validarConferenciaDevolutiva(conferencia({ itens: [] }), []).pronto, false);
  assert.equal(validarConferenciaDevolutiva(conferencia(), []).pronto, false);
  assert.equal(validarConferenciaDevolutiva(conferencia(), null).pronto, false);
});
test('IA-M1: lista incompleta marca a exigência faltante como não verificável e não fica pronto', () => {
  const r = validarConferenciaDevolutiva(conferencia({ itens: [{ refItemId: 'iv1', status: 'corrigido' }] }), exigencias);
  assert.equal(r.pronto, false);
  assert.deepEqual(r.itens, [{ refItemId: 'iv1', status: 'corrigido', observacao: '' }, { refItemId: 'iv2', status: 'nao_verificavel', observacao: 'A IA não devolveu a conferência deste item.' }]);
});
test('IA-M1: item sem status ou com status desconhecido nunca conta como corrigido', () => {
  for (const status of [undefined, null, '', 'CORRIGIDO', 'ok', true, 1, ['corrigido']]) {
    const r = validarConferenciaDevolutiva(conferencia({ itens: [{ refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv2', status }] }), exigencias);
    assert.equal(r.pronto, false, String(status));
    assert.equal(r.itens[1].status, 'nao_verificavel');
    assert.match(r.itens[1].observacao, /não informou a situação/);
  }
});
test('IA-M1: pronto ausente, falso ou de tipo errado não vira pronto; pendência derruba o pronto', () => {
  for (const pronto of [undefined, null, false, 'true', 1, 'sim']) assert.equal(validarConferenciaDevolutiva(conferencia({ pronto }), exigencias).pronto, false, String(pronto));
  assert.equal(validarConferenciaDevolutiva(conferencia({ pendencias: [{ descricao: 'Falta algo' }] }), exigencias).pronto, false);
});
test('IA-M1: respostas repetidas para a mesma exigência valem a menos favorável', () => {
  const a = validarConferenciaDevolutiva(conferencia({ itens: [{ refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv1', status: 'nao_corrigido', observacao: 'faltou' }, { refItemId: 'iv2', status: 'corrigido' }] }), exigencias);
  assert.equal(a.pronto, false); assert.deepEqual(a.itens[0], { refItemId: 'iv1', status: 'nao_corrigido', observacao: 'faltou' });
  const b = validarConferenciaDevolutiva(conferencia({ itens: [{ refItemId: 'iv1', status: 'nao_corrigido' }, { refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv2', status: 'corrigido' }] }), exigencias);
  assert.equal(b.pronto, false); assert.equal(b.itens[0].status, 'nao_corrigido');
  // Duas respostas "corrigido" para iv1 não cobrem iv2.
  assert.equal(validarConferenciaDevolutiva(conferencia({ itens: [{ refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv1', status: 'corrigido' }] }), exigencias).pronto, false);
});
test('IA-M1: prontoParaReenviarDevolutiva é conservadora também com dados já gravados', () => {
  const ok = { pronto: true, itens: [{ refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv2', status: 'corrigido' }], pendencias: [] };
  assert.equal(prontoParaReenviarDevolutiva(ok), true);
  assert.equal(prontoParaReenviarDevolutiva(ok, exigencias), true);
  assert.equal(prontoParaReenviarDevolutiva({ ...ok, pronto: undefined }, exigencias), true);
  for (const ruim of [null, undefined, 'x', [], {}, { pronto: true }, { pronto: true, itens: [] }, { pronto: true, itens: [], pendencias: [] }, { pronto: true, itens: 'x' },
    { ...ok, pronto: false }, { ...ok, pronto: 'true' }, { ...ok, pendencias: [{ descricao: 'x' }] }, { ...ok, pendencias: 'x' },
    { ...ok, itens: [{ refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv2' }] }, { ...ok, itens: [{ refItemId: 'iv1', status: 'corrigido' }, null] },
    { ...ok, itens: [{ refItemId: 'iv1', status: 'corrigido' }, { refItemId: 'iv2', status: 'nao_verificavel' }] },
  ]) assert.equal(prontoParaReenviarDevolutiva(ruim), false, JSON.stringify(ruim));
  // Conferência que não cobre todas as exigências registradas.
  assert.equal(prontoParaReenviarDevolutiva({ ...ok, itens: [ok.itens[0]] }, exigencias), false);
  assert.equal(prontoParaReenviarDevolutiva({ ...ok, itens: [ok.itens[0], ok.itens[0]] }, exigencias), false);
  assert.equal(prontoParaReenviarDevolutiva({ ...ok, itens: [ok.itens[0], { refItemId: 'outro', status: 'corrigido' }] }, exigencias), false);
  assert.equal(prontoParaReenviarDevolutiva(ok, []), false);
  assert.equal(prontoParaReenviarDevolutiva(ok, 'x'), false);
});
test('IA-M1: a tela decide "pronto" só pela regra única, na conferência e ao reler metas gravadas', () => {
  assert.match(fonte, /const pronto = prontoParaReenviarDevolutiva\(resultado, etapa1\?\.itens \|\| \[\]\);/);
  const resumo = fonte.slice(fonte.indexOf('function resumoEtapa2('), fonte.indexOf('function RelatorioEtapa2('));
  assert.match(resumo, /const pronto = prontoParaReenviarDevolutiva\(etapa2, etapa1 \? etapa1\.itens : null\);/);
  assert.doesNotMatch(resumo, /typeof etapa2\.pronto/);
  // Executa a função real da tela com uma conferência gravada antes da correção (pronto:true e lista vazia).
  const resumoEtapa2 = new Function('prontoParaReenviarDevolutiva', `${resumo}; return resumoEtapa2;`)(prontoParaReenviarDevolutiva);
  assert.equal(resumoEtapa2({ pronto: true, itens: [], pendencias: [] }, { itens: exigencias }).pronto, false);
  assert.equal(resumoEtapa2({ pronto: true, itens: [{ refItemId: 'iv1', status: 'corrigido' }], pendencias: [] }, { itens: exigencias }).pronto, false);
  assert.equal(resumoEtapa2(null, null).pronto, false);
  const ok = resumoEtapa2(conferencia(), { itens: exigencias });
  assert.equal(ok.pronto, true); assert.equal(ok.contagem.corrigido, 2); assert.equal(ok.pendentes, 0);
});

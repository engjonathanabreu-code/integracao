import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ordenarMetasContinuas, secoesPorSetor } from '../src/metas-organizacao.js';

const metas = ordenarMetasContinuas([
  { id: 'j1', setor: 'Jurídico' },
  { id: 't1', setor: 'Topografia', prazo: '2026-09-01' },
  { id: 't2', setor: 'Topografia', prazo: '2026-09-02' },
  { id: 't3', setor: 'Topografia', prazo: '2026-09-03' },
  { id: 'p1', setor: 'Projetos' },
  { id: 's1', setor: '' },
]);

test('grade por setor ganha um cabeçalho por setor, com nome e quantidade', () => {
  const secoes = secoesPorSetor(metas);
  assert.deepEqual(secoes.map(s => [s.setor, s.total, s.continua]), [['Topografia', 3, false], ['Projetos', 1, false], ['Jurídico', 1, false], ['Sem setor', 1, false]]);
  assert.deepEqual(secoes.flatMap(s => s.metas), metas);
});

test('setor cortado pela paginação mantém o total e avisa que é continuação', () => {
  const primeira = secoesPorSetor(metas, 0, 2), segunda = secoesPorSetor(metas, 2, 4), terceira = secoesPorSetor(metas, 4, 6);
  assert.deepEqual(primeira.map(s => [s.setor, s.total, s.continua, s.metas.map(m => m.id)]), [['Topografia', 3, false, ['t1', 't2']]]);
  assert.deepEqual(segunda.map(s => [s.setor, s.total, s.continua, s.metas.map(m => m.id)]), [['Topografia', 3, true, ['t3']], ['Projetos', 1, false, ['p1']]]);
  assert.deepEqual(terceira.map(s => s.setor), ['Jurídico', 'Sem setor']);
  assert.equal([primeira, segunda, terceira].flat().reduce((n, s) => n + s.metas.length, 0), metas.length);
});

test('lista vazia e faixa fora do intervalo não criam cabeçalho; variação de caixa fica no mesmo setor', () => {
  assert.deepEqual(secoesPorSetor(), []);
  assert.deepEqual(secoesPorSetor(metas, 10, 20), []);
  const mistas = ordenarMetasContinuas([{ id: 'a', setor: 'topografia' }, { id: 'b', setor: 'Topografia' }]);
  assert.equal(secoesPorSetor(mistas).length, 1);
  assert.equal(secoesPorSetor(mistas)[0].total, 2);
});

test('a grade só mostra cabeçalho de setor quando a ordem é por setor', () => {
  const grade = readFileSync(new URL('../src/MetasAgrupadas.jsx', import.meta.url), 'utf8');
  assert.match(grade, /ordenar === ordenarMetasContinuas\s*\? secoesPorSetor\(ordenadas, atual \* porPagina, \(atual \+ 1\) \* porPagina\)/);
  assert.match(grade, /className="metas-setor-titulo"/);
  const css = readFileSync(new URL('../src/metas-visual.css', import.meta.url), 'utf8');
  assert.match(css, /\.metas-setor-titulo\{grid-column:1\/-1/);
});

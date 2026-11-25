import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {faixaDaPagina, textoDaFaixa, MORADORES_POR_PAGINA} from '../src/paginacao.js';

test('lista de moradores desenha no máximo 100 linhas por página', () => {
  assert.equal(MORADORES_POR_PAGINA, 100);
  const primeira = faixaDaPagina(1017, 0);
  assert.deepEqual(primeira, {total: 1017, paginas: 11, atual: 0, inicio: 0, fim: 100});
  assert.deepEqual(faixaDaPagina(1017, 10), {total: 1017, paginas: 11, atual: 10, inicio: 1000, fim: 1017});
  assert.deepEqual(faixaDaPagina(520, 5), {total: 520, paginas: 6, atual: 5, inicio: 500, fim: 520});
  const linhas = Array.from({length: 1017}, (_, i) => i);
  const vistas = [];
  for (let p = 0; p < primeira.paginas; p++) { const f = faixaDaPagina(linhas.length, p); assert.ok(f.fim - f.inicio <= 100); vistas.push(...linhas.slice(f.inicio, f.fim)); }
  assert.deepEqual(vistas, linhas);
});

test('página fora do intervalo é ajustada e lista curta ou vazia tem uma página só', () => {
  assert.equal(faixaDaPagina(250, 99).atual, 2);
  assert.equal(faixaDaPagina(250, -3).atual, 0);
  assert.equal(faixaDaPagina(250, NaN).atual, 0);
  assert.deepEqual(faixaDaPagina(100, 0), {total: 100, paginas: 1, atual: 0, inicio: 0, fim: 100});
  assert.deepEqual(faixaDaPagina(0, 4), {total: 0, paginas: 1, atual: 0, inicio: 0, fim: 0});
  assert.equal(faixaDaPagina(10, 0, 0).paginas, 10);
  assert.equal(faixaDaPagina(101, 1, 50).fim, 100);
});

test('texto da faixa informa posição, total e página', () => {
  assert.equal(textoDaFaixa(faixaDaPagina(1017, 1)), '101–200 de 1017 moradores · Página 2 de 11');
  assert.equal(textoDaFaixa(faixaDaPagina(0, 0)), '');
});

test('tabela de moradores pagina depois de filtrar e ordenar, e volta à primeira página ao filtrar', () => {
  const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const tabela = fonte.slice(fonte.indexOf('function TabProcessos('), fonte.indexOf('function TabQuadro('));
  assert.match(tabela, /const faixa = faixaDaPagina\(lista\.length, pagina\);/);
  assert.match(tabela, /ordem\.ordenar\(lista, \{[^}]*\}\)\.slice\(faixa\.inicio, faixa\.fim\)\.map\(/);
  assert.match(tabela, /useEffect\(\(\) => \{ setPagina\(0\); \}, \[busca, etapa, situacao\]\);/);
  assert.match(tabela, /faixa\.paginas > 1 && <nav className="metas-paginacao" aria-label="Páginas de moradores">/);
});

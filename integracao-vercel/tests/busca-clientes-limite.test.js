import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filtrarClientes, termoBuscaSuficiente, limitarResultados, MINIMO_BUSCA_CLIENTES, LOTE_BUSCA_CLIENTES} from '../src/busca-clientes.js';

test('busca de clientes exige pelo menos duas letras ou números', () => {
  assert.equal(MINIMO_BUSCA_CLIENTES, 2);
  for (const curto of ['', ' ', 'j', ' j ', null, undefined]) assert.equal(termoBuscaSuficiente(curto), false);
  for (const ok of ['jo', ' Jo ', 'é1', '01', 'ILH01_001']) assert.equal(termoBuscaSuficiente(ok), true);
});

test('a lista desenha só os 50 primeiros e informa quantos restam', () => {
  assert.equal(LOTE_BUSCA_CLIENTES, 50);
  const base = Array.from({length: 11600}, (_, i) => ({id: String(i), requerente: {nome: `João ${String(i).padStart(5, '0')}`}}));
  const encontrados = filtrarClientes(base, 'jo');
  assert.equal(encontrados.length, 11600);
  const lote = limitarResultados(encontrados);
  assert.equal(lote.visiveis.length, 50);
  assert.equal(lote.total, 11600);
  assert.equal(lote.restantes, 11550);
  assert.deepEqual(lote.visiveis, encontrados.slice(0, 50));
});

test('resultados além do primeiro lote continuam alcançáveis e listas curtas não são cortadas', () => {
  const lista = Array.from({length: 65}, (_, i) => ({id: String(i)}));
  assert.equal(limitarResultados(lista, 100).visiveis.length, 65);
  assert.equal(limitarResultados(lista, 100).restantes, 0);
  assert.equal(limitarResultados(lista, 50).restantes, 15);
  assert.equal(limitarResultados(lista.slice(0, 3)).visiveis.length, 3);
  assert.deepEqual(limitarResultados(), {visiveis: [], total: 0, restantes: 0});
  assert.equal(limitarResultados(lista, 0).visiveis.length, 0);
});

test('componente de busca aplica o mínimo, o lote e oferece Mostrar mais', () => {
  const fonte = readFileSync(new URL('../src/BuscaClientes.jsx', import.meta.url), 'utf8');
  assert.match(fonte, /suficiente \? filtrarClientes\(clientes, busca, municipioId, \{incluirConjuge\}\) : \[\]/);
  assert.match(fonte, /limitarResultados\(encontrados, limite\)/);
  assert.match(fonte, /setLimite\(v => v \+ LOTE_BUSCA_CLIENTES\)/);
  assert.match(fonte, /setBusca\(e\.target\.value\); setClienteAtivo\(null\); setLimite\(LOTE_BUSCA_CLIENTES\)/);
});

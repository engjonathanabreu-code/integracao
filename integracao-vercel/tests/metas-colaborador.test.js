import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { separarMetasColaborador, ordenarMetasEncerradas } from '../src/metas-organizacao.js';

const metas = [
  { id: 'c1', status: 'Concluído', prazo: '2026-10-01' },
  { id: 'a2', status: 'Em andamento', prazo: '2026-12-10' },
  { id: 'x1', status: 'Cancelado', prazo: '2026-11-30' },
  { id: 'a1', status: 'Em andamento', prazo: '2026-11-01' },
  { id: 'p1', status: 'Aguardando aprovação', prazo: '2026-11-20' },
  { id: 'c2', status: 'Concluído', prazo: '2026-11-15' },
  { id: 's1', status: 'Em andamento' },
];

test('tela do colaborador mostra primeiro atrasadas e ativas e separa as encerradas', () => {
  const antes = structuredClone(metas);
  const { abertas, encerradas } = separarMetasColaborador(metas);
  assert.deepEqual(abertas.map(m => m.id), ['a1', 'p1', 'a2', 's1']);
  assert.deepEqual(encerradas.map(m => m.id), ['c2', 'c1', 'x1']);
  assert.equal(abertas.length + encerradas.length, metas.length);
  assert.deepEqual(metas, antes);
  const hoje = '2026-11-25';
  const atrasadas = abertas.filter(m => m.prazo && m.prazo < hoje);
  assert.deepEqual(abertas.slice(0, atrasadas.length), atrasadas);
});

test('encerradas: concluídas antes das canceladas, da mais recente para a mais antiga', () => {
  assert.deepEqual(ordenarMetasEncerradas(metas.filter(m => ['Concluído', 'Cancelado'].includes(m.status))).map(m => m.id), ['c2', 'c1', 'x1']);
  assert.deepEqual(separarMetasColaborador(), { abertas: [], encerradas: [] });
});

test('seção do colaborador pagina as abertas e recolhe concluídas e canceladas', () => {
  const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const trecho = fonte.slice(fonte.indexOf('{tela === "home" && colaborador && ('), fonte.indexOf('{tela === "ativas" && ('));
  assert.match(trecho, /separarMetasColaborador\(metasDe\(colaborador\.id\)\)/);
  assert.match(trecho, /<MetasAgrupadas metas=\{abertas\} ordenar=\{ordenarMetasAtrasadas\}/);
  assert.match(trecho, /<details className="metas-encerradas"><summary>Concluídas e canceladas \(\{encerradas\.length\}\)<\/summary><MetasAgrupadas metas=\{encerradas\}/);
  assert.doesNotMatch(trecho, /<details[^>]* open/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diasDeAtraso, textoAtraso, ordenarMetasAtrasadas } from '../src/metas-organizacao.js';

test('dias de atraso contam dias civis, inclusive em virada de mês, de ano e ano bissexto', () => {
  assert.equal(diasDeAtraso('2026-11-24', '2026-11-25'), 1);
  assert.equal(diasDeAtraso('2026-10-31', '2026-11-25'), 25);
  assert.equal(diasDeAtraso('2026-12-31', '2027-01-01'), 1);
  assert.equal(diasDeAtraso('2028-02-28', '2028-03-01'), 2);
  assert.equal(diasDeAtraso('2026-11-25', '2026-11-25'), 0);
  assert.equal(diasDeAtraso('2026-11-26', '2026-11-25'), 0);
  assert.equal(diasDeAtraso('2026-11-24T23:30:00', '2026-11-25'), 1);
  for (const invalido of ['', null, undefined, 'amanhã']) assert.equal(diasDeAtraso(invalido, '2026-11-25'), 0);
  assert.equal(diasDeAtraso('2026-11-24', ''), 0);
});

test('texto do atraso usa singular e plural e fica vazio sem atraso', () => {
  assert.equal(textoAtraso('2026-11-24', '2026-11-25'), 'Atrasada há 1 dia');
  assert.equal(textoAtraso('2026-11-11', '2026-11-25'), 'Atrasada há 14 dias');
  assert.equal(textoAtraso('2026-11-25', '2026-11-25'), '');
  assert.equal(textoAtraso('', '2026-11-25'), '');
});

test('atrasadas vêm do prazo mais antigo para o mais recente, em qualquer setor, sem alterar a origem', () => {
  const metas = [
    { id: 'c', setor: 'Topografia', prazo: '2026-11-20', titulo: 'B' },
    { id: 'a', setor: 'Jurídico', prazo: '2026-09-01', titulo: 'Z' },
    { id: 'd', setor: 'Topografia', prazo: '2026-11-20', titulo: 'A' },
    { id: 'b', setor: 'Projetos', prazo: '2026-10-15', titulo: 'M' },
    { id: 'e', setor: 'Projetos', titulo: 'Sem prazo' },
  ];
  const antes = structuredClone(metas);
  const ordenadas = ordenarMetasAtrasadas(metas);
  assert.deepEqual(ordenadas.map(m => m.id), ['a', 'b', 'd', 'c', 'e']);
  assert.deepEqual(metas, antes);
  assert.equal(ordenadas[0], metas[1]);
  assert.deepEqual(ordenarMetasAtrasadas(), []);
});

test('tela de Metas usa a regra de atraso: texto no cartão e ordem na seção de atrasadas', () => {
  const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const cartao = fonte.slice(fonte.indexOf('function CartaoMeta('), fonte.indexOf('function PaginaMetas('));
  assert.match(cartao, /textoAtraso\(m\.prazo, diaCivilEvento\(new Date\(\)\)\)/);
  assert.match(fonte, /<MetasAgrupadas metas=\{atrasadas\} ordenar=\{ordenarMetasAtrasadas\}/);
  const grade = readFileSync(new URL('../src/MetasAgrupadas.jsx', import.meta.url), 'utf8');
  assert.match(grade, /ordenar = ordenarMetasContinuas/);
});

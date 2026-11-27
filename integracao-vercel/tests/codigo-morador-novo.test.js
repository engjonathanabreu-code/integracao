import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proximoNumeroLivreMorador, codigoMoradorAoGravar, proximoNumeroMorador, erroCodigoMorador } from '../src/codigo-morador.js';
const montar = prefixo => n => `${prefixo}_${String(n).padStart(3, '0')}`;
const ita = montar('ITA01');
const base = () => [
  { id: 'a', codigo: 'ITA01_001', numeroCliente: 1, remessaId: 'r1' },
  { id: 'b', codigo: 'ITA01_002', numeroCliente: 2, remessaId: 'r1' },
];
test('próximo número livre é o seguinte ao maior da remessa quando o código está livre', () => {
  assert.equal(proximoNumeroLivreMorador(base(), 'r1', ita), 3);
  assert.equal(proximoNumeroLivreMorador([], 'r1', ita), 1);
});
test('pula códigos já usados por outra remessa ou editados à mão', () => {
  const processos = [...base(), { id: 'c', codigo: 'ita01_003', numeroCliente: 1, remessaId: 'r2' }, { id: 'd', codigo: 'ITA01_004', remessaId: 'r3' }];
  assert.equal(proximoNumeroMorador(processos, 'r1'), 3);
  assert.equal(proximoNumeroLivreMorador(processos, 'r1', ita), 5);
});
test('código que continua livre ao gravar é mantido sem alteração', () => {
  const novo = { id: 'n', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1' };
  assert.deepEqual(codigoMoradorAoGravar(novo, base(), ita), { codigo: 'ITA01_003', numeroCliente: 3, mudou: false });
  // Regravar o mesmo morador (clique repetido, mesma operação) não renumera.
  assert.equal(codigoMoradorAoGravar(novo, [...base(), novo], ita).mudou, false);
  assert.equal(codigoMoradorAoGravar(novo, [...base(), { ...novo }], ita).mudou, false);
});
test('dois cadastros abertos com o mesmo código: o segundo a gravar recebe o próximo livre', () => {
  const processos = base();
  const primeiro = { id: 'n1', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1' };
  const segundo = { id: 'n2', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1' };
  for (const novo of [primeiro, segundo]) {
    const r = codigoMoradorAoGravar(novo, processos, ita);
    processos.push({ ...novo, codigo: r.codigo, numeroCliente: r.numeroCliente });
  }
  assert.deepEqual(processos.map(p => p.codigo), ['ITA01_001', 'ITA01_002', 'ITA01_003', 'ITA01_004']);
  assert.deepEqual(processos.map(p => p.numeroCliente), [1, 2, 3, 4]);
  assert.equal(new Set(processos.map(p => p.codigo)).size, processos.length);
  for (const p of processos) assert.equal(erroCodigoMorador(p.codigo, processos, p), '');
  assert.equal(segundo.codigo, 'ITA01_003', 'a função não altera o rascunho recebido');
});
test('morador que chegou pela sincronização enquanto o formulário estava aberto também é respeitado', () => {
  const novo = { id: 'n', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1' };
  const depois = [...base(), { id: 'remoto', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1' }, { id: 'remoto2', codigo: 'ITA01_004', numeroCliente: 4, remessaId: 'r1' }];
  assert.deepEqual(codigoMoradorAoGravar(novo, depois, ita), { codigo: 'ITA01_005', numeroCliente: 5, mudou: true });
});
test('código vazio é refeito; números grandes continuam exatos', () => {
  assert.deepEqual(codigoMoradorAoGravar({ id: 'n', codigo: '', remessaId: 'r1' }, base(), ita), { codigo: 'ITA01_003', numeroCliente: 3, mudou: true });
  const grande = [{ id: 'g', codigo: 'ITA01_9007199254740993', numeroCliente: '9007199254740993', remessaId: 'r1' }];
  assert.equal(proximoNumeroLivreMorador(grande, 'r1', ita), '9007199254740994');
});
test('telas de cadastro usam o número livre e refazem o código ao gravar', () => {
  const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(fonte, /function proximoNumeroCliente\(db, remessaId\) \{ return proximoNumeroLivreMorador\(/);
  const inicio = fonte.indexOf('const salvarMorador = (municipio) =>');
  const salvar = fonte.slice(inicio, fonte.indexOf('const adicionarUnidade', inicio));
  assert.match(salvar, /codigoMoradorAoGravar\(np, /);
  assert.match(salvar, /mutar\(\(d\) => \{ if \(d\.processos\.some\(\(p\) => p\.id === np\.id\)\) return d; recodificar\(d\); d\.processos\.push\(np\);/);
});

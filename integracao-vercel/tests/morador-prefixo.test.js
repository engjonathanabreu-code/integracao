import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const context = vm.createContext({
  remessaDe: (db, id) => db.remessas.find(r => r.id === id),
  municipioDe: (db, id) => db.municipios.find(m => m.id === id),
  pad2: n => String(n).padStart(2, '0'), pad3: n => String(n).padStart(3, '0'),
  proximoNumeroCliente: () => 212, uid: () => 'unidade',
  processoVazio: (municipioId, remessaId, codigo) => ({ municipioId, remessaId, codigo, requerente: {}, endereco: {}, enderecoImovel: {} }),
});
for (const name of ['codigoCliente', 'montarMorador']) {
  const start = source.indexOf(`function ${name}(`);
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
}
const db = { municipios: [{ id: 'm', nome: 'Itaberaba', uf: 'BA', prefixo: 'ITA' }], remessas: [{ id: 'r', municipioId: 'm', numero: 1 }] };
test('prefixo do município é usado mesmo se houver tentativa de substituir no morador', () => {
  const p = context.montarMorador(db, 'm', { remessaId: 'r', prefixoCodigo: 'ERRADO01', nome: ' Morador ', telefone: '', cpf: '123', qtdUnidades: 2 });
  assert.equal(p.codigo, 'ITA01_212');
  assert.equal(p.numeroCliente, 212);
  assert.equal(p.unidades.length, 2);
  assert.equal(p.requerente.nome, 'Morador');
});
test('cadastros sem prefixo personalizado mantêm o comportamento anterior', () => {
  assert.equal(context.codigoCliente(db, 'r', 212), 'ITA01_212');
  db.municipios[0].prefixo = 'ITA';
  assert.equal(context.codigoCliente(db, 'r', 7), 'ITA01_007');
});
test('novo cadastro não altera município, remessa nem registros existentes', () => {
  const antes = JSON.stringify(db);
  context.montarMorador(db, 'm', { remessaId: 'r', prefixoCodigo: 'NOVO01', nome: 'Morador', telefone: '', cpf: '123', qtdUnidades: 1 });
  assert.equal(JSON.stringify(db), antes);
});

test('editar prefixo do município afeta somente os próximos códigos', () => {
  const p = context.montarMorador(db, 'm', { remessaId: 'r', nome: 'Morador', telefone: '', cpf: '123', qtdUnidades: 1 });
  db.municipios[0].prefixo = 'ITB';
  assert.equal(context.codigoCliente(db, 'r', 213), 'ITB01_213');
  assert.equal(p.codigo, 'ITA01_212');
});

test('município sem prefixo não gera novo morador com MUN', () => {
  const semPrefixo = { ...db, municipios: [{ id: 'm', nome: 'Itaberaba', uf: 'BA' }] };
  assert.throws(() => context.montarMorador(semPrefixo, 'm', { remessaId: 'r' }), /prefixo do município/);
});

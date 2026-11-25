import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problemaData, problemaSugestao, marcarPlausibilidade, selecaoInicialSugestoes, sugestoesSelecionadas } from '../src/documentos-ia-plausibilidade.js';
import { destinoDocumento } from '../src/documentos-pessoas.js';
import { cpfValido } from '../src/requisitos-moradores.js';

const fonte = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const HOJE = '2026-11-25';
// CPFs e CNPJ de exemplo, gerados só para teste (não pertencem a ninguém do sistema).
const CPF_OK = '529.982.247-25', CNPJ_OK = '11.222.333/0001-81';

test('IA-C2: CPF sugerido é conferido pelos dígitos verificadores', () => {
  assert.equal(problemaSugestao('requerente.cpf', CPF_OK, HOJE), '');
  assert.equal(problemaSugestao('conjuge.cpf', '52998224725', HOJE), '');
  for (const ruim of ['529.982.247-26', '529.982.247-35', '111.111.111-11', '000.000.000-00', '123.456.789-00', '529.982.247', '5299822472500', '', null, undefined, 'sem número'])
    assert.match(problemaSugestao('requerente.cpf', ruim, HOJE), /CPF inválido/, String(ruim));
  assert.equal(problemaSugestao('corequerentes.0.pessoa.cnpj', CNPJ_OK, HOJE), '');
  assert.match(problemaSugestao('corequerentes.0.pessoa.cnpj', '11.222.333/0001-82', HOJE), /CNPJ inválido/);
});
test('IA-C2: data impossível, fora de formato, antiga demais ou futura é reprovada', () => {
  for (const ok of ['1971-05-14', '2024-02-29', '2000-02-29', '1900-01-01', HOJE]) assert.equal(problemaData(ok, HOJE), '', ok);
  for (const impossivel of ['1990-02-30', '1990-02-31', '2023-02-29', '1900-02-29', '1990-04-31', '1990-13-01', '1990-00-10', '1990-01-00', '1990-01-32'])
    assert.match(problemaData(impossivel, HOJE), /Data impossível: esse dia não existe/, impossivel);
  for (const futura of ['2026-11-26', '2027-01-01', '9999-12-31']) assert.equal(problemaData(futura, HOJE), 'Data no futuro.', futura);
  for (const antiga of ['1899-12-31', '0001-01-01', '1000-06-15']) assert.match(problemaData(antiga, HOJE), /anterior a 1900/, antiga);
  for (const torta of ['', null, undefined, '14/05/1971', '1971-5-14', '19710514', '1971-05-14T00:00:00Z', 'ontem', 19710514, {}]) assert.equal(problemaData(torta, HOJE), 'Data em formato inválido.', String(torta));
  // Sem "hoje" informado usa a data local corrente: ontem passa, um ano à frente não.
  const d = new Date(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  assert.equal(problemaData(iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))), '');
  assert.equal(problemaData(iso(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()))), 'Data no futuro.');
});
test('IA-C2: só CPF, CNPJ, nascimento e data da união passam pelo teste; os demais campos ficam como estão', () => {
  assert.match(problemaSugestao('requerente.nascimento', '1990-02-31', HOJE), /impossível/);
  assert.match(problemaSugestao('ocupantes.2.pessoa.nascimento', '2030-01-01', HOJE), /futuro/);
  assert.match(problemaSugestao('requerente.dataUniao', '2030-01-01', HOJE), /futuro/);
  for (const path of ['requerente.nome', 'requerente.rg', 'endereco.cep', 'imovel.area', 'requerente.renda', '', null]) assert.equal(problemaSugestao(path, '2030-99-99', HOJE), '');
});
test('IA-C2: linhas reprovadas ganham o motivo, nunca vêm marcadas e não podem ser aplicadas', () => {
  const linhas = [
    { path: 'requerente.cpf', sugerido: '529.982.247-26', diverge: false },
    { path: 'requerente.nascimento', sugerido: '1990-02-31', diverge: false },
    { path: 'requerente.rg', sugerido: 'RG-FICTICIO', diverge: false },
    { path: 'requerente.mae', sugerido: 'Mãe Fictícia', diverge: true },
    { path: 'conjuge.cpf', sugerido: CPF_OK, diverge: false },
  ];
  const marcadas = marcarPlausibilidade(linhas, HOJE);
  assert.deepEqual(marcadas.map(l => !!l.implausivel), [true, true, false, false, false]);
  assert.equal(marcadas[2], linhas[2]); // linha aprovada não é copiada nem alterada
  assert.equal(linhas[0].implausivel, undefined); // entrada não é mutada
  const sel = selecaoInicialSugestoes(marcadas);
  assert.deepEqual(sel, { 'requerente.cpf': false, 'requerente.nascimento': false, 'requerente.rg': true, 'requerente.mae': false, 'conjuge.cpf': true });
  assert.deepEqual(selecaoInicialSugestoes(marcadas, l => l.path !== 'conjuge.cpf')['conjuge.cpf'], false);
  // Mesmo que a seleção seja forçada, a linha implausível não é aplicada.
  const forcada = Object.fromEntries(marcadas.map(l => [l.path, true]));
  assert.deepEqual(sugestoesSelecionadas(marcadas, forcada).map(l => l.path), ['requerente.rg', 'requerente.mae', 'conjuge.cpf']);
  assert.deepEqual(sugestoesSelecionadas(marcadas, sel).map(l => l.path), ['requerente.rg', 'conjuge.cpf']);
  assert.deepEqual(sugestoesSelecionadas(null, null), []); assert.deepEqual(marcarPlausibilidade(null), []); assert.deepEqual(selecaoInicialSugestoes(undefined), {});
});
test('IA-C2: montarLinhas real da tela marca CPF inválido e data impossível lidos pela IA', () => {
  const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
  const so = v => String(v ?? '').replace(/\D/g, '');
  const deps = { marcarPlausibilidade, destinoDocumento, preenchido: v => String(v ?? '').trim() !== '', getPath, normalizar: v => String(v).toLowerCase(), so,
    MAPA_IA: { nome: { rot: 'Nome', campo: 'nome' }, cpf: { rot: 'CPF', campo: 'cpf' }, nascimento: { rot: 'Nascimento', campo: 'nascimento' }, dataUniao: { rot: 'Data da união', campo: 'dataUniao' } } };
  const montarLinhas = new Function(...Object.keys(deps), fonte.slice(fonte.indexOf('function montarLinhas('), fonte.indexOf('/* ---------------- gerador de PRF')) + ';return montarLinhas;')(...Object.values(deps));
  const cadastro = { requerente: { nome: 'Requerente Fictício' }, conjuge: {}, endereco: {}, docs: [] };
  const linhas = montarLinhas({ pessoa: 'requerente', campos: { nome: 'Requerente Fictício', cpf: '529.982.247-26', nascimento: '1990-02-31', dataUniao: '2015-06-20' } }, cadastro, 'requerente');
  const por = Object.fromEntries(linhas.map(l => [l.path, l]));
  assert.match(por['requerente.cpf'].implausivel, /CPF inválido/);
  assert.match(por['requerente.nascimento'].implausivel, /impossível/);
  assert.equal(por['requerente.dataUniao'].implausivel, undefined);
  assert.equal(cpfValido(por['requerente.cpf'].sugerido), false);
});
test('IA-C2: a aba Documentos pinta de vermelho, bloqueia a caixa e não aplica a sugestão reprovada', () => {
  assert.match(fonte, /const sel = selecaoInicialSugestoes\(linhas, \(l\) => podeSecao\(l\.path\) && !pessoaEscolhida && !!destino\);/);
  assert.match(fonte, /style=\{l\.implausivel \? \{ background: "var\(--danger-bg\)" \} : l\.diverge \?/);
  assert.match(fonte, /checked=\{!!selecao\[l\.path\] && !l\.implausivel\} disabled=\{!permitido \|\| !!l\.implausivel\}/);
  assert.match(fonte, /\{l\.implausivel && <div role="alert" style=\{\{ fontSize: 12\.5, color: "var\(--danger\)"/);
  assert.match(fonte, /aplicarIA\(sugestoesSelecionadas\(resultado\.linhas, selecao\)\);/);
});

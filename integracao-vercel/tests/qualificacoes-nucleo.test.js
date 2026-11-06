import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { preenchido, ehPJ, temConjuge, normalizar, cpfValido, cnpjValido, so, COM_CONJUGE } from '../src/requisitos-moradores.js';
import { cpfDispensado } from '../src/pessoa-menor.js';
import { carregarTodasQualificacoes, prepararQualificacoesCopia, resolverQualificacaoCadastro, textoLimpoQualificacao } from '../src/qualificacoes-nucleo.js';

test('consolidado reutiliza gerador real com PF, PJ e cônjuge não beneficiário', () => {
  const src = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const ctx = { preenchido, ehPJ, temConjuge, normalizar, cpfValido, cnpjValido, so, COM_CONJUGE, cpfDispensado, fmtCPF: x => x, fmtCNPJ: x => x, fmtCEP: x => x, codigosUnidades: () => ['TESTE_0001'] };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function gerarQualificacao('), src.indexOf('const MODOS_QUALIFICACAO')) + ';this.gerar=gerarQualificacao;', ctx);
  const pessoa = nome => ({ nome, cpf: '52998224725', estadoCivil: 'Casado(a)', nacionalidade: 'Brasileira', profissao: 'Analista', rg: '123', mae: 'Mãe fictícia', regimeBens: 'Comunhão parcial de bens' });
  const base = { requerente: pessoa('Titular fictício'), conjuge: pessoa('Cônjuge fictício'), corequerentes: [], endereco: { logradouro: 'Rua de Teste', numero: '1', bairro: 'Centro', municipio: 'Teste', uf: 'SC', cep: '89140000' } };
  for (const p of [base, { ...base, conjuge: { ...base.conjuge, beneficiario: 'nao' } }, { ...base, requerente: { ...base.requerente, tipoPessoa: 'juridica', cnpj: '29212382000107', representante: 'Representante fictício' } }]) {
    const antes = JSON.stringify(p);
    const individual = ctx.gerar(p, 'completa');
    const consolidada = resolverQualificacaoCadastro(p, ctx.gerar);
    assert.equal(consolidada.texto, individual.texto);
    if (p.conjuge.beneficiario === 'nao' || p.requerente.tipoPessoa === 'juridica') assert.doesNotMatch(consolidada.texto, /Cônjuge fictício/);
    assert.equal(JSON.stringify(p), antes);
  }
});

test('consolidado usa a mesma escolha entre texto individual salvo e gerado', () => {
  const gerar = p => ({ texto: `Nome: ${p.requerente.nome}.`, faltas: ['RG'] });
  const p = { id: 'p1', requerente: { nome: 'Pessoa Fictícia' } };
  assert.equal(resolverQualificacaoCadastro(p, gerar).texto, 'Nome: Pessoa Fictícia.');
  const editado = { ...p, qualificacao: { textos: { completa: 'Texto revisto individualmente.' }, origem: { completa: 'editada' }, faltas: { completa: [] }, desatualizada: true } };
  assert.deepEqual(resolverQualificacaoCadastro(editado, gerar), { texto: 'Texto revisto individualmente.', faltas: [], origem: 'editada', desatualizada: true });
  const migrado = { ...p, qualificacao: { textos: { completa: 'Texto do Integrado.' }, origem: { completa: 'migrada' } } };
  assert.equal(resolverQualificacaoCadastro(migrado, gerar).texto, 'Texto do Integrado.');
});

test('mudanças cadastrais são refletidas pela fonte compartilhada sem cadastro paralelo', () => {
  const p = { id: 'p', requerente: { nome: 'Antes' } };
  const gerar = x => ({ texto: x.requerente.nome, faltas: [] });
  assert.equal(resolverQualificacaoCadastro(p, gerar).texto, 'Antes');
  p.requerente.nome = 'Depois';
  assert.equal(resolverQualificacaoCadastro(p, gerar).texto, 'Depois');
  assert.equal(p.qualificacao, undefined);
});

test('cópia em conjunto mantém código, nome e separação sem HTML ativo', () => {
  const ps = [{ id: 'a', codigo: 'TESTE-1', requerente: { nome: 'Pessoa A' } }, { id: 'b', codigo: 'TESTE-2', requerente: { nome: 'Pessoa B' } }];
  const texto = prepararQualificacoesCopia(ps, p => ({ texto: `<p><strong>${p.requerente.nome}</strong><br>Qualificação</p><script>roubar()</script>` }));
  assert.doesNotMatch(texto, /<[^>]*>|roubar/);
  assert.match(texto, /TESTE-1 — Pessoa A\nPessoa A\nQualificação/);
  assert.match(texto, /\n\nTESTE-2/);
  assert.equal(textoLimpoQualificacao('Nome &amp; Cia'), 'Nome & Cia');
});

test('copiar todos percorre páginas além da visível e preserva o escopo recebido', async () => {
  const moradores = Array.from({ length: 235 }, (_, i) => ({ id: `p-${i}` }));
  const chamadas = [];
  const loader = async q => { chamadas.push(q); return { items: moradores.slice(q.offset, q.offset + q.limit), total: moradores.length }; };
  const todos = await carregarTodasQualificacoes(loader, { nucleoId: 'n-ficticio', busca: 'teste' });
  assert.equal(todos.length, 235);
  assert.deepEqual(chamadas.map(x => x.offset), [0, 100, 200]);
  assert.ok(chamadas.every(x => x.nucleoId === 'n-ficticio' && x.busca === 'teste'));
});

test('não copia lote incompleto, repetido ou alterado durante a paginação', async () => {
  await assert.rejects(carregarTodasQualificacoes(async () => ({ items: [{ id: '1' }], total: 50 }), {}), /incompleta/);
  let i = 0;
  await assert.rejects(carregarTodasQualificacoes(async () => ({ items: [{ id: '1' }, { id: '2' }], total: ++i === 1 ? 4 : 5 }), {}, { limite: 2 }), /mudou/);
  await assert.rejects(carregarTodasQualificacoes(async () => ({ items: [{ id: '1' }, { id: '1' }], total: 2 }), {}), /repetidos/);
  await assert.rejects(carregarTodasQualificacoes(async () => ({ items: [], total: 50001 }), {}), /muitos/);
});

test('falha de rede impede resultado parcial de qualificações', async () => {
  let chamadas = 0;
  await assert.rejects(carregarTodasQualificacoes(async () => { if (++chamadas === 2) throw new Error('Rede indisponível'); return { items: [{ id: 'p1' }], total: 2 }; }, {}, { limite: 1 }), /Rede indisponível/);
});

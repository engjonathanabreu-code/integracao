import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { conferirNovoMorador } from '../src/novo-morador.js';
import { codigoMoradorAoGravar } from '../src/codigo-morador.js';

// CPFs de teste matematicamente válidos, sem relação com pessoas reais.
const CPF_A = '529.982.247-25', CPF_B = '111.444.777-35';
const existentes = () => [
  { id: 'a', codigo: 'ITA01_001', remessaId: 'r1', requerente: { nome: 'José da Silva', cpf: CPF_A } },
  { id: 'b', codigo: 'ITA01_002', remessaId: 'r2', requerente: { nome: 'Maria Souza', cpf: CPF_B } },
];
const entrada = (mud = {}) => ({ remessaId: 'r1', prefixoMunicipio: 'ITA', codigoGerado: 'ITA01_003', nome: 'Pessoa Nova', cpf: CPF_B, confirmaDup: false, ...mud });

test('cadastro completo e sem repetição pode continuar', () => {
  const r = conferirNovoMorador(entrada(), existentes());
  assert.deepEqual(r.erros, []);
  assert.equal(r.cpfOk, true); assert.ok(!r.cpfDup); assert.ok(!r.nomeDup); assert.equal(r.codigoDuplicado, false);
});
test('campos obrigatórios: remessa, prefixo, nome e CPF', () => {
  assert.deepEqual(conferirNovoMorador(entrada({ remessaId: '', prefixoMunicipio: '', codigoGerado: '—', nome: 'Jo', cpf: '' }), existentes()).erros,
    ['Escolha a remessa', 'Cadastre o prefixo em Editar município antes de adicionar um morador', 'Informe o nome do requerente', 'Informe o CPF, ele é obrigatório']);
  assert.deepEqual(conferirNovoMorador(entrada({ cpf: '529.982.247-26' }), existentes()).erros, ['CPF inválido, confira os dígitos']);
});
test('CPF repetido na mesma remessa exige confirmação; em outra remessa não bloqueia', () => {
  const repetido = conferirNovoMorador(entrada({ cpf: '52998224725' }), existentes());
  assert.equal(repetido.cpfDup.id, 'a');
  assert.deepEqual(repetido.erros, ['Confirme o cadastro com CPF repetido']);
  assert.deepEqual(conferirNovoMorador(entrada({ cpf: CPF_A, confirmaDup: true }), existentes()).erros, []);
  const outraRemessa = conferirNovoMorador(entrada({ cpf: CPF_B }), existentes());
  assert.ok(!outraRemessa.cpfDup); assert.deepEqual(outraRemessa.erros, []);
});
test('nome repetido na remessa só avisa (sem acento e caixa), e o aviso de CPF tem prioridade', () => {
  const r = conferirNovoMorador(entrada({ nome: '  JOSE  DA SILVA ' }), existentes());
  assert.equal(r.nomeDup.id, 'a'); assert.deepEqual(r.erros, []);
  const ambos = conferirNovoMorador(entrada({ nome: 'José da Silva', cpf: CPF_A }), existentes());
  assert.equal(ambos.cpfDup.id, 'a'); assert.equal(ambos.nomeDup, false);
});
test('código repetido bloqueia, inclusive quando o outro morador está arquivado', () => {
  const r = conferirNovoMorador(entrada({ codigoGerado: 'ita01_002' }), existentes());
  assert.equal(r.codigoDuplicado, true);
  assert.deepEqual(r.erros, ['Este código já existe. Confira o prefixo no cadastro do município.']);
  const arquivado = [...existentes(), { id: 'z', codigo: 'ITA01_003', remessaId: 'r9', requerente: { nome: 'Arquivado', cpf: '' } }];
  assert.equal(conferirNovoMorador(entrada(), existentes(), arquivado).codigoDuplicado, true);
  assert.match(conferirNovoMorador(entrada({ codigoGerado: 'ÇÃO01_003' }), existentes()).erros[0], /caracteres não aceitos/);
});

// Função real de gravação do novo morador, recortada do App.jsx.
const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const inicio = fonte.indexOf('  const salvarMorador = (municipio) =>');
const trecho = fonte.slice(inicio, fonte.indexOf('  const adicionarUnidade', inicio));
function cenario({ noRender = existentes(), naGravacao = noRender, nucleos = [] } = {}) {
  const db = { processos: noRender, nucleos };
  const estado = { processos: naGravacao.map(p => ({ ...p })), nucleos: nucleos.map(n => ({ ...n })) };
  const registros = [], avisos = [], rotas = [];
  let fechou = 0;
  const contexto = vm.createContext({
    db, codigoMoradorAoGravar,
    codigoCliente: (_db, _remessa, n) => `ITA01_${String(n).padStart(3, '0')}`,
    nucleoDe: (base, id) => base.nucleos.find(n => n.id === id), remessaDe: () => ({ id: 'r1' }), nomeRemessa: () => 'Remessa 01',
    mutar: (fn, acao, log) => { fn(estado); registros.push({ acao, log }); },
    fechar: () => { fechou++; }, ir: r => rotas.push(r), setToast: t => avisos.push(t),
  });
  vm.runInContext(`${trecho};this.salvar=salvarMorador({id:'m'});`, contexto);
  return { salvar: contexto.salvar, estado, registros, avisos, rotas, fechou: () => fechou };
}
const novo = (mud = {}) => ({ id: 'n1', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1', nucleoId: '', requerente: { nome: 'Pessoa Nova', cpf: CPF_B }, ...mud });

test('salvar novo morador grava uma vez, registra a operação e abre a ficha', () => {
  assert.ok(inicio > 0);
  const c = cenario(), np = novo();
  c.salvar(np, { idOperacao: 'op1' });
  assert.equal(c.estado.processos.length, 3); assert.equal(c.estado.processos[2].codigo, 'ITA01_003');
  assert.equal(c.registros[0].acao, 'Morador cadastrado'); assert.equal(c.registros[0].log.id, 'op1'); assert.equal(c.registros[0].log.processoId, 'n1');
  assert.match(c.registros[0].log.detalhe, /^ITA01_003 em Remessa 01, sem núcleo/);
  assert.deepEqual(JSON.parse(JSON.stringify(c.rotas)), [{ pag: 'processo', id: 'n1' }]); assert.equal(c.fechou(), 1);
  assert.match(c.avisos[0], /^ITA01_003 cadastrado\./);
  c.salvar(np, { idOperacao: 'op1' });
  assert.equal(c.estado.processos.length, 3, 'a repetição não cria um segundo morador');
});
test('código ocupado depois que o formulário abriu: grava com o próximo livre e avisa', () => {
  const ocupados = [...existentes(), { id: 'x', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1', requerente: { nome: 'Outro', cpf: '' } }];
  const c = cenario({ noRender: ocupados }), np = novo();
  c.salvar(np, {});
  const gravado = c.estado.processos.at(-1);
  assert.equal(gravado.codigo, 'ITA01_004'); assert.equal(gravado.numeroCliente, 4);
  assert.match(c.registros[0].log.detalhe, /^ITA01_004 /);
  assert.match(c.avisos[0], /^O código ITA01_003 já estava em uso; o morador recebeu ITA01_004\. ITA01_004 cadastrado/);
});
test('dois cadastros na mesma remessa de envio: a gravação confere o estado mais recente', () => {
  // A tela ainda não mostra o primeiro cadastro, mas ele já está na fila quando o segundo grava.
  const naFila = [...existentes(), { id: 'n0', codigo: 'ITA01_003', numeroCliente: 3, remessaId: 'r1', requerente: { nome: 'Primeiro', cpf: '' } }];
  const c = cenario({ noRender: existentes(), naGravacao: naFila });
  c.salvar(novo(), {});
  const codigos = c.estado.processos.map(p => p.codigo);
  assert.deepEqual(codigos, ['ITA01_001', 'ITA01_002', 'ITA01_003', 'ITA01_004']);
  assert.equal(new Set(codigos).size, codigos.length);
});
test('núcleo sem remessa é vinculado à remessa do morador', () => {
  const c = cenario({ nucleos: [{ id: 'nu', codigo: 'NUI01', remessaId: '' }] });
  c.salvar(novo({ nucleoId: 'nu' }), {});
  assert.equal(c.estado.nucleos[0].remessaId, 'r1');
  assert.match(c.registros[0].log.detalhe, /NUI01 vinculado à Remessa 01/);
});

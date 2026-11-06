import test from 'node:test';
import assert from 'node:assert/strict';
import { criarApiObservacoesDocumentos } from '../src/observacoes-documentos-api.js';

const conteudo = { version: 1, blocks: [{ id: 'linha1', type: 'check', checked: true, runs: [{ text: 'Conferir documentos', bold: true }] }] };
const registro = { id: '51ab225b-11a0-432e-8028-7c267c32fb8b', versao: 3, conteudo };
test('contrato RPC envia identidade do morador, versão e conteúdo exatos', async () => {
  const chamadas = [];
  const api = criarApiObservacoesDocumentos(async (path, options) => { chamadas.push({ path, ...options, body: JSON.parse(options.body) }); return registro; });
  const row = await api.salvar('morador1', { id: registro.id, versao: 2, conteudo });
  assert.equal(row, registro);
  assert.deepEqual(chamadas[0], { path: 'rpc/integracao_documentos_observacoes_operar', method: 'POST', body: { p_acao: 'salvar', p_processo_id: 'morador1', p_dados: { id: registro.id, versao: 2, conteudo } } });
});
test('falha de rede não retorna sucesso e retry mantém o mesmo identificador', async () => {
  const enviados = []; let falhar = true;
  const api = criarApiObservacoesDocumentos(async (_, options) => { enviados.push(JSON.parse(options.body)); if (falhar) throw Error('Falha de rede'); return registro; });
  const dados = { id: registro.id, versao: 0, conteudo };
  await assert.rejects(api.salvar('morador1', dados), /Falha de rede/);
  falhar = false; await api.salvar('morador1', dados);
  assert.deepEqual(enviados[0], enviados[1]); assert.deepEqual(dados.conteudo, conteudo);
});
test('resposta incompleta não confirma persistência', async () => {
  for (const resposta of [null, {}, [], { id: registro.id }, { ...registro, id: 'outro' }]) {
    const api = criarApiObservacoesDocumentos(async () => resposta);
    await assert.rejects(api.salvar('morador1', { id: registro.id, versao: 2, conteudo }), /confirmou/);
  }
});
test('listagem envia paginação e filtro de excluídas explicitamente', async () => {
  let dados;
  const api = criarApiObservacoesDocumentos(async (_, options) => { dados = JSON.parse(options.body); return { itens: [registro], total: 45 }; });
  assert.equal((await api.listar('morador1', { inicio: 20, limite: 20, excluidas: true })).total, 45);
  assert.deepEqual(dados.p_dados, { inicio: 20, limite: 20, excluidas: true });
});
test('exclusão e restauração enviam versão para impedir sobrescrita concorrente', async () => {
  const chamadas = [], api = criarApiObservacoesDocumentos(async (_, options) => { chamadas.push(JSON.parse(options.body)); return registro; });
  await api.excluir('morador1', { id: registro.id, versao: 2 }); await api.restaurar('morador1', { id: registro.id, versao: 3 });
  assert.deepEqual(chamadas.map(c => [c.p_acao, c.p_dados.versao]), [['excluir', 2], ['restaurar', 3]]);
});
test('conteúdo inválido não chega ao transporte', async () => {
  let chamou = false;
  const api = criarApiObservacoesDocumentos(async () => { chamou = true; return registro; });
  await assert.rejects(api.salvar('morador1', { id: registro.id, versao: 0, conteudo: { ...conteudo, html: '<script>1</script>' } }));
  assert.equal(chamou, false);
});

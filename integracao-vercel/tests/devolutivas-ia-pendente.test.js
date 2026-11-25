import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { marcarAnalisePendenteDevolutiva, analisePendenteDevolutiva, AVISO_ANALISE_PENDENTE } from '../src/devolutivas-ia-validacao.js';

// A IA é sempre simulada: nenhum teste chama a IA nem a rede.
const fonte = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('IA-M2: marca análise pendente preservando a análise anterior e sem guardar texto sem limite', () => {
  const m = marcarAnalisePendenteDevolutiva({ etapa1: { resumo: 'anterior' }, etapa2: null }, new Error('o serviço respondeu com código 503'), '2026-11-25T12:00:00.000Z');
  assert.deepEqual(m, { etapa1: { resumo: 'anterior' }, etapa2: null, pendente: { desde: '2026-11-25T12:00:00.000Z', motivo: 'o serviço respondeu com código 503' } });
  assert.deepEqual(marcarAnalisePendenteDevolutiva(null, null, 'x'), { pendente: { desde: 'x', motivo: 'serviço de IA indisponível' } });
  assert.deepEqual(marcarAnalisePendenteDevolutiva('lixo', new Error('  '), 'x'), { pendente: { desde: 'x', motivo: 'serviço de IA indisponível' } });
  assert.equal(marcarAnalisePendenteDevolutiva(null, new Error('e'.repeat(900)), 'x').pendente.motivo.length, 300);
});
test('IA-M2: leitura da marca tolera metas antigas e dados tortos', () => {
  for (const d of [null, undefined, {}, { analiseIA: null }, { analiseIA: {} }, { analiseIA: { pendente: null } }, { analiseIA: { pendente: true } }, { analiseIA: { pendente: 'sim' } }, { analiseIA: { pendente: [] } }]) assert.equal(analisePendenteDevolutiva(d), null);
  assert.deepEqual(analisePendenteDevolutiva({ analiseIA: { pendente: { desde: 5, motivo: {} } } }), { desde: '', motivo: '' });
  assert.deepEqual(analisePendenteDevolutiva({ analiseIA: marcarAnalisePendenteDevolutiva(null, new Error('fora do ar'), 'd') }), { desde: 'd', motivo: 'fora do ar' });
});

// Executa o salvar real do modal de Análise de Devolutivas com dependências mínimas.
function modalAnalise({ ia, meta = null, etapa1 = null, arquivos = [], texto = '' }) {
  const inicio = fonte.indexOf('  const salvar = async () => {\n    if (!podeSalvar) return;');
  const corpo = fonte.slice(inicio, fonte.indexOf('\n  return (', inicio));
  const guardados = new Map(), envios = [], estado = { erro: '', etapa1 };
  const db = { metas: meta ? [structuredClone(meta)] : [], nucleos: [{ id: 'n1' }] };
  let n = 0;
  const d = {
    podeSalvar: true, setSalvando() {}, setErro: v => { estado.erro = v; }, etapa1, setEtapa1: v => { estado.etapa1 = v; }, etapa2: null,
    analisarTeorDevolutivaIA: ia, arquivosEtapa1: arquivos, arquivosEtapa2: [], carregarOriginais: async () => [], textoLivre: texto,
    uid: p => `${p}-${++n}`, lerBase64: async () => 'QQ==', PREFIXO_ARQ_DEV: 'integracao-devolutiva-v1-', usuario: { id: 'u1', nome: 'Técnica fictícia' },
    armazenamento: { set: async (k, v) => { guardados.set(k, v); } }, nucleoDe: () => ({ id: 'n1' }), db, nucleoId: 'n1', meta, chegada: '2026-11-20', prazo: '2026-12-20',
    marcarAnalisePendenteDevolutiva, AVISO_ANALISE_PENDENTE, nova: !meta, rotuloNucleo: () => 'Núcleo fictício', dataBR: v => v, semanaISO: () => '2026-11-23', META_STATUS: ['Em andamento'],
    // A fila de sincronização existente é o único caminho de gravação: o teste só registra o que foi pedido a ela.
    envio: { executar: async (fn, acao, dados, mensagem, aoConfirmar) => { envios.push({ acao, mensagem }); fn(db); aoConfirmar?.(); } },
    registrarHistoricoMeta: (_d, m, acao, textoHistorico) => { (m.historico ||= []).push({ acao, texto: textoHistorico }); },
    resumoEtapa2: () => ({ pronto: false, pendentes: 0, contagem: {} }), onFechar() { estado.fechou = true; },
  };
  const salvar = new Function(...Object.keys(d), `${corpo}; return salvar;`)(...Object.values(d));
  return { salvar, db, guardados, envios, estado };
}
const pdf = () => ({ name: 'devolutiva-ficticia.pdf', type: 'application/pdf', size: 1234 });

test('IA-M2: IA fora do ar ao cadastrar devolutiva salva a meta e os anexos e marca análise pendente', async () => {
  let chamadas = 0;
  const t = modalAnalise({ ia: async () => { chamadas++; throw new Error('o serviço respondeu com código 503'); }, arquivos: [pdf()], texto: 'Texto fictício' });
  await t.salvar();
  assert.equal(chamadas, 1);
  assert.equal(t.estado.erro, '');
  assert.equal(t.envios.length, 1); // passou uma única vez pelo salvamento existente
  assert.equal(t.db.metas.length, 1);
  const m = t.db.metas[0];
  assert.equal(m.arquivos.length, 1); assert.equal(m.arquivos[0].nome, 'devolutiva-ficticia.pdf');
  assert.equal(t.guardados.size, 1); assert.ok(t.guardados.has(m.arquivos[0].chave));
  assert.equal(m.devolutiva.textoOriginal, 'Texto fictício');
  assert.equal(m.devolutiva.analiseIA.etapa1, null);
  assert.equal(analisePendenteDevolutiva(m.devolutiva).motivo, 'o serviço respondeu com código 503');
  assert.match(t.envios[0].mensagem, /ficou pendente/);
  assert.doesNotMatch(t.envios[0].mensagem, /relatório da IA/);
  assert.match(m.historico[0].texto, /Análise de IA pendente/);
  assert.equal(t.estado.fechou, true);
});
test('IA-M2: resposta inválida da IA também não cancela o salvamento nem grava a resposta', async () => {
  const t = modalAnalise({ ia: async () => { throw new Error('A IA retornou uma análise em formato inválido. Nada foi gravado na meta; tente novamente.'); }, arquivos: [pdf()] });
  await t.salvar();
  assert.equal(t.db.metas[0].devolutiva.analiseIA.etapa1, null);
  assert.match(analisePendenteDevolutiva(t.db.metas[0].devolutiva).motivo, /formato inválido/);
  assert.equal(t.db.metas[0].arquivos.length, 1);
});
test('IA-M2: em meta existente a falha preserva a análise anterior, junta o anexo e marca pendente', async () => {
  const anterior = { geradoEm: 'antes', resumo: 'Resumo anterior', itens: [{ id: 'iv1', categoria: 'areas', descricao: 'Exigência fictícia' }], naoIdentificado: [], arquivosAnalisados: [] };
  const meta = { id: 'mt1', titulo: 'Devolutiva fictícia', arquivos: [{ id: 'a0', nome: 'antigo.pdf', chave: 'k0' }], devolutiva: { origem: 'Cartório', analiseIA: { etapa1: anterior, etapa2: null } } };
  const t = modalAnalise({ ia: async () => { throw new Error('Falha de conexão'); }, meta, arquivos: [pdf()] });
  await t.salvar();
  const q = t.db.metas[0];
  assert.deepEqual(q.arquivos.map(a => a.nome), ['antigo.pdf', 'devolutiva-ficticia.pdf']);
  assert.deepEqual(q.devolutiva.analiseIA.etapa1, anterior);
  assert.equal(q.devolutiva.origem, 'Cartório');
  assert.equal(analisePendenteDevolutiva(q.devolutiva).motivo, 'Falha de conexão');
  assert.match(t.envios[0].mensagem, /ficou pendente/);
});
test('IA-M2: com a IA respondendo, salva com o relatório e sem marca de pendente (e limpa marca antiga)', async () => {
  const meta = { id: 'mt1', titulo: 'Devolutiva fictícia', arquivos: [], devolutiva: { analiseIA: marcarAnalisePendenteDevolutiva(null, new Error('antes')) } };
  const t = modalAnalise({ ia: async () => ({ resumo: 'Resumo fictício', itens: [{ categoria: 'areas', descricao: 'Exigência', statusEsperado: '' }], naoIdentificado: [] }), meta, arquivos: [pdf()] });
  await t.salvar();
  const q = t.db.metas[0];
  assert.equal(analisePendenteDevolutiva(q.devolutiva), null);
  assert.equal(q.devolutiva.analiseIA.etapa1.resumo, 'Resumo fictício');
  assert.equal(t.envios[0].mensagem, 'Relatório da IA atualizado.');
});
test('IA-M2: falha ao guardar o arquivo continua cancelando (nada é salvo pela metade)', async () => {
  const t = modalAnalise({ ia: async () => { throw new Error('IA fora do ar'); }, arquivos: [pdf()] });
  t.guardados.set = () => { throw new Error('sem espaço'); };
  await t.salvar();
  assert.equal(t.envios.length, 0); assert.equal(t.db.metas.length, 0);
  assert.match(t.estado.erro, /Não foi possível salvar: sem espaço/);
});
test('IA-M2: formulário da meta isola a falha da IA do erro de arquivos e usa o salvamento existente', () => {
  const inicio = fonte.indexOf('    let novaAnalise = null, falhaIA = null;');
  assert.ok(inicio > 0);
  const trecho = fonte.slice(inicio, fonte.indexOf('      await confirmarCriacao();', inicio));
  // A chamada da IA tem o próprio try/catch, antes de gravar os anexos.
  assert.match(trecho, /try \{\n\s+const resultado = await analisarTeorDevolutivaIA\(arquivosDev, f\.observacoes\);[\s\S]+?\} catch \(e\) \{ falhaIA = e; \}\n\s+\}\n\s+for \(const arquivo of f\.devolutiva \? arquivosDev : \[\]\)/);
  assert.match(trecho, /falhaIA \? \{analiseIA:marcarAnalisePendenteDevolutiva\(\(registroDev \|\| meta\)\?\.devolutiva\?\.analiseIA, falhaIA\)\}/);
  assert.match(trecho, /avisoAnalisePendente\.current = falhaIA \? AVISO_ANALISE_PENDENTE : "";/);
  // Mesmo caminho de gravação de antes: a fila existente, com o mesmo id de operação.
  assert.match(trecho, /criarConfirmacaoMeta\(\(\) => \(AMBIENTE\.DEMO \? mutar : mutar\.confirmado\)/);
  assert.match(trecho, /"Meta criada", \{ id: idOperacaoMeta\.current/);
  assert.match(fonte, /Gravação confirmada\."\)\) \+ avisoAnalisePendente\.current\);/);
  assert.match(fonte, /\{analisePendenteDevolutiva\(m\.devolutiva\) && <p className="msg-erro" role="status"/);
});

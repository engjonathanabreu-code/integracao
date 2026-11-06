import test from 'node:test';
import assert from 'node:assert/strict';
import { criarBancoTermosTeste, autenticarTermoTeste, operarTermoTeste, idsTermos as i, uuidTermoTeste as id, sqlTermos } from './termos-banco-fixture.js';
import { preencherTermoMunicipal, podeGerarTermosMunicipais } from '../src/termos-municipais.js';

const novoModelo = (pedido = 501, municipioId = i.municipioA) => ({ pedidoId: id(pedido), municipioId, titulo: 'Termo fictício de teste', variante: 'Social teste', corpo: '{{requerente.nome}} / {{requerente.documento}} / {{unidade.codigo}} / {{unidade.area}} / {{municipio.nome}}\n\n{{qualificacao}}', obrigatorios: ['requerente.nome', 'unidade.area', 'qualificacao'] });
const contexto = modeloVersaoId => ({ processoId: i.processoA, unidadeId: i.unidadeA, modeloVersaoId });
const capturaNegocio = async db => {
  await db.exec('reset role');
  const r = {};
  for (const t of ['fin_receb_clientes', 'fin_receb_municipios', 'processos_kanban', 'integracao_moradores', 'integracao_nucleos', 'integracao_complementos']) r[t] = (await db.query(`select to_jsonb(t) dado from ${t} t order by to_jsonb(t)::text`)).rows;
  return JSON.stringify(r);
};

test('termos reais em PGlite: escopo, CAS, snapshots, idempotência e acesso direto', async t => {
  const db = await criarBancoTermosTeste({ aplicar: false });
  try {
    const antes = await capturaNegocio(db); await db.exec(sqlTermos);
    assert.equal(await capturaNegocio(db), antes, 'DDL não altera registros de negócio');
    await autenticarTermoTeste(db, i.admin);
    const payload = novoModelo();
    const modelo = await operarTermoTeste(db, 'salvar_modelo', payload);
    assert.equal(modelo.versao, 1);

    await t.test('identidade financeira não seleciona implicitamente outro alias de cadastro', async () => {
      await assert.rejects(db.query('select integracao_documentos_privado.morador($1)', [i.clienteA]), /cadastro vinculado/);
      await db.exec('reset role');
      await db.query("insert into integracao_moradores select colecao,'alias-inconsistente',dados,criado_por,referencia_tabela,referencia_id,updated_at from integracao_moradores where registro_id=$1", [i.processoA]);
      await autenticarTermoTeste(db, i.admin);
      await assert.rejects(db.query('select integracao_documentos_privado.morador($1)', [i.processoA]), /mais de um cadastro/);
      await db.exec('reset role');
      await db.exec("delete from integracao_moradores where registro_id='alias-inconsistente'");
      await autenticarTermoTeste(db, i.admin);
    });

    await t.test('salvar modelo é idempotente e não aceita reutilizar pedido para outro conteúdo', async () => {
      assert.deepEqual(await operarTermoTeste(db, 'salvar_modelo', payload), modelo);
      await assert.rejects(operarTermoTeste(db, 'salvar_modelo', { ...payload, corpo: 'Outro texto' }), /outra gravação/);
      assert.equal((await db.query('select count(*)::int n from integracao_termos_modelos')).rows[0].n, 1);
    });
    await t.test('Projetos gera com identidade canônica e unidade exata, antes da topografia', async () => {
      await autenticarTermoTeste(db);
      const preparo = await operarTermoTeste(db, 'preparar', contexto(modelo.id));
      assert.equal(preparo.dados['requerente.nome'], 'Morador Canônico A');
      assert.equal(preparo.dados['requerente.documento'], '52998224725');
      assert.equal(preparo.dados['unidade.area'], '123,0450');
      assert.equal(preparo.dados['unidade.codigo'], 'TESTE-A');
      assert.equal(preparo.dados.qualificacao, 'Qualificação fictícia salva.');
      await assert.rejects(operarTermoTeste(db, 'preparar', { ...contexto(modelo.id), unidadeId: i.unidadeB }), /Unidade/);
    });
    let emissao, texto;
    await t.test('snapshot canônico persistido uma vez e reaberto por outra sessão autorizada', async () => {
      const preparo = await operarTermoTeste(db, 'preparar', contexto(modelo.id));
      texto = preencherTermoMunicipal(preparo.modelo, preparo.dados).texto;
      const dados = { ...contexto(modelo.id), pedidoId: id(601), textoEsperado: texto, texto: 'FORJADO', titulo: 'FORJADO', autor: i.admin };
      emissao = await operarTermoTeste(db, 'emitir', dados);
      assert.equal(emissao.texto, texto); assert.equal(emissao.titulo, payload.titulo);
      assert.match(emissao.por, /Projetos/);
      assert.deepEqual(await operarTermoTeste(db, 'emitir', dados), emissao);
      await assert.rejects(operarTermoTeste(db, 'emitir', { ...dados, textoEsperado: 'Outro conteúdo' }), /outra emissão/);
      await autenticarTermoTeste(db, i.admin);
      assert.equal((await operarTermoTeste(db, 'listar_emissoes', { processoId: i.processoA }))[0].texto, texto);
    });
    await t.test('edições simultâneas do mesmo modelo aceitam somente uma versão com CAS', async () => {
      const base = { ...payload, id: modelo.modeloId, versaoBase: 1, corpo: `${payload.corpo}\nNova versão de teste` };
      const rs = await Promise.allSettled([operarTermoTeste(db, 'salvar_modelo', { ...base, pedidoId: id(502) }), operarTermoTeste(db, 'salvar_modelo', { ...base, pedidoId: id(503) })]);
      assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
      assert.match(rs.find(r => r.status === 'rejected').reason.message, /outra pessoa/);
      assert.equal((await operarTermoTeste(db, 'listar_modelos', { municipioId: i.municipioA }))[0].versao, 2);
      assert.equal((await operarTermoTeste(db, 'listar_emissoes', { processoId: i.processoA }))[0].texto, texto);
    });
    await t.test('modelos de municípios distintos não se confundem e não há fallback', async () => {
      const b = await operarTermoTeste(db, 'salvar_modelo', novoModelo(510, i.municipioB));
      await assert.rejects(operarTermoTeste(db, 'preparar', contexto(b.id)), /este município/);
      await assert.rejects(operarTermoTeste(db, 'salvar_modelo', { ...novoModelo(511, i.municipioB), id: modelo.modeloId, versaoBase: 2 }), /município.*trocado/);
    });
    await t.test('RLS de origem bloqueia outro município e perfil sem permissão', async () => {
      await autenticarTermoTeste(db, i.externo);
      await assert.rejects(operarTermoTeste(db, 'preparar', contexto(modelo.id)), /sem acesso/);
      await assert.rejects(operarTermoTeste(db, 'listar_modelos', { municipioId: i.municipioA }), /sem acesso/);
      assert.equal((await db.query('select count(*)::int n from integracao_termos_emissoes')).rows[0].n, 0);
      await autenticarTermoTeste(db, i.financeiro);
      await assert.rejects(operarTermoTeste(db, 'preparar', contexto(modelo.id)), /Sem permissão/);
      await assert.rejects(operarTermoTeste(db, 'salvar_modelo', novoModelo(520)), /Sem permissão/);
      await autenticarTermoTeste(db, i.inativo);
      await assert.rejects(operarTermoTeste(db, 'listar_emissoes', { processoId: i.processoA }), /ativo/);
    });
    await t.test('acesso direto não permite conteúdo forjado nem alterar/remover snapshots', async () => {
      await autenticarTermoTeste(db);
      await assert.rejects(db.query('insert into integracao_termos_emissoes(pedido_id,processo_id,unidade_id,modelo_versao_id,texto_esperado,texto,titulo,autor) values($1,$2,$3,$4,$5,$6,$7,$8)', [id(610), i.processoA, i.unidadeA, modelo.id, 'FORJADO', 'FORJADO', 'FORJADO', i.admin]), /mudou/);
      const r = (await db.query('insert into integracao_termos_emissoes(pedido_id,processo_id,unidade_id,modelo_versao_id,texto_esperado,texto,titulo,autor,versao,emitido_em) values($1,$2,$3,$4,$5,$6,$7,$8,999,$9) returning *', [id(611), i.processoA, i.unidadeA, modelo.id, texto, 'FORJADO', 'FORJADO', i.admin, '2000-01-01'])).rows[0];
      assert.equal(r.autor, i.projetos); assert.equal(r.versao, 1); assert.equal(r.texto, texto); assert.equal(r.titulo, payload.titulo); assert.ok(String(r.emitido_em).includes('2026') || new Date(r.emitido_em).getTime() > Date.parse('2025-01-01'));
      await assert.rejects(db.exec("update integracao_termos_emissoes set texto='mudou'"), /permission denied/);
      await assert.rejects(db.exec('delete from integracao_termos_emissoes'), /permission denied/);
      await assert.rejects(db.exec("update integracao_termos_modelos set corpo='mudou'"), /permission denied/);
      await db.exec('reset role');
      await assert.rejects(db.exec("update integracao_termos_emissoes set texto='mudou'"), /imutáveis/);
    });
    await t.test('mudança cadastral após prévia gera conflito e dados ausentes bloqueiam emissão', async () => {
      await db.query('update fin_receb_clientes set nome=$1 where id=$2', ['Novo nome fictício', i.clienteA]);
      await autenticarTermoTeste(db);
      await assert.rejects(operarTermoTeste(db, 'emitir', { ...contexto(modelo.id), pedidoId: id(620), textoEsperado: texto }), /mudou/);
      await db.exec('reset role');
      await db.query("update integracao_moradores set dados=jsonb_set(dados,'{qualificacao,textos,completa}','\"\"') where registro_id=$1", [i.processoA]);
      await autenticarTermoTeste(db);
      const prep = await operarTermoTeste(db, 'preparar', contexto(modelo.id));
      assert.ok(preencherTermoMunicipal(prep.modelo, prep.dados).faltas.includes('qualificacao'));
      await assert.rejects(operarTermoTeste(db, 'emitir', { ...contexto(modelo.id), pedidoId: id(621), textoEsperado: preencherTermoMunicipal(prep.modelo, prep.dados).texto }), /obrigatório/);
    });
  } finally { await db.close(); }
});

test('qualificações consultam núcleo com aliases, origem canônica, paginação e RLS', async () => {
  const db = await criarBancoTermosTeste();
  try {
    await autenticarTermoTeste(db);
    const carregar = async (nucleo, busca = '', ids = null, inicio = 0, limite = 30) => (await db.query('select integracao_qualificacoes_nucleo($1,$2,$3,$4,$5) resultado', [nucleo, busca, ids, inicio, limite])).rows[0].resultado;
    let r = await carregar(i.nucleoA); assert.equal(r.total, 1); assert.equal(r.items[0].id, i.processoA); assert.equal(r.items[0].requerente.nome, 'Morador Canônico A');
    assert.equal((await carregar('nucleo_a', 'canônico')).total, 1);
    assert.equal((await carregar('nucleo_a', '', [i.processoB])).total, 0);
    assert.equal((await carregar('nucleo_a', '', null, 1, 1)).items.length, 0);
    await assert.rejects(carregar('nucleo_b'), /sem acesso/);
    await db.exec('reset role');
    for (let j = 0; j < 65; j++) {
      await db.query('insert into integracao_moradores(colecao,registro_id,dados,criado_por,referencia_tabela,referencia_id) values($1,$2,$3,$4,$5,$6)', ['processos', `proprio-${j}`, { nucleoId: 'nucleo_a', municipioId: i.municipioA, codigo: `P-${String(j).padStart(3, '0')}`, requerente: { nome: `Pessoa ${j}` } }, i.admin, 'processos_kanban', i.nucleoA]);
    }
    await autenticarTermoTeste(db);
    const all = [];
    for (let offset = 0; offset < 66; offset += 30) { r = await carregar('nucleo_a', '', null, offset, 30); assert.equal(r.total, 66); all.push(...r.items); }
    assert.equal(new Set(all.map(x => x.id)).size, 66);
    await autenticarTermoTeste(db, i.inativo); await assert.rejects(carregar('nucleo_a'), /ativo/);
    await db.exec('reset role;set role anon'); await assert.rejects(carregar('nucleo_a'), /permission denied/);
  } finally { await db.close(); }
});

test('perfis da interface e do banco concordam, sem ampliar gestão de modelos', async () => {
  const db = await criarBancoTermosTeste();
  try {
    for (const tipo of ['Administrador', 'Diretor Técnico', 'Diretor de Projetos', 'Projetos', 'Topografia', 'Comercial', 'Atendimentos', 'Jurídico', 'Pós-protocolo', 'Financeiro', 'Marketing', 'Consulta']) {
      await db.exec('reset role'); await db.query('update profiles set tipo=$1,setor=$1 where id=$2', [tipo, i.projetos]); await autenticarTermoTeste(db);
      const r = (await db.query('select integracao_documentos_privado.emitir_termos() emitir,integracao_documentos_privado.gerir_modelos() gerir')).rows[0];
      assert.equal(r.emitir, podeGerarTermosMunicipais({ tipoERP: tipo, ativo: true }), tipo);
      assert.equal(r.gerir, tipo === 'Administrador' || tipo.startsWith('Diretor '), tipo);
    }
  } finally { await db.close(); }
});

test('financeiro sem complemento é leitura válida; não presume núcleo, unidade ou UF', async () => {
  const db = await criarBancoTermosTeste();
  try {
    await db.query('insert into fin_receb_clientes(id,municipio_id,codigo,nome,ativo) values($1,$2,$3,$4,true)', [id(350), i.municipioA, 'SEM-COMPLEMENTO', 'Pessoa sem complemento']);
    await autenticarTermoTeste(db, i.admin);
    const m = await operarTermoTeste(db, 'salvar_modelo', novoModelo(550));
    await autenticarTermoTeste(db);
    const p = (await db.query('select integracao_documentos_privado.morador($1) p', [id(350)])).rows[0].p;
    assert.equal(p.requerente.nome, 'Pessoa sem complemento'); assert.equal(p.requerente.cpf, '');
    assert.equal(p.nucleoId, undefined); assert.equal(p.unidades, undefined);
    await assert.rejects(operarTermoTeste(db, 'preparar', { processoId: id(350), unidadeId: 'inventada', modeloVersaoId: m.id }), /Vincule/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from integracao_moradores where referencia_id=$1', [id(350)])).rows[0].n, 0);
    await db.query('update processos_kanban set estado=null where id=$1', [i.nucleoA]);
    // A produção permite leitura do kanban para perfis ativos; liberar este item
    // na fixture garante que a ausência de UF chegue à validação, não à RLS.
    await db.exec(`alter policy ler on processos_kanban using(id='${i.nucleoA}'::uuid or exists(select 1 from fin_receb_municipios m where m.nome=municipio and m.uf=estado))`);
    await autenticarTermoTeste(db);
    await assert.rejects(operarTermoTeste(db, 'preparar', contexto(m.id)), /UF/);
  } finally { await db.close(); }
});

test('emissão e referência termo_gerado são atômicas, preservam histórico e obedecem ao guard vigente', async t => {
  for (const origem of ['integracao_moradores', 'integracao_complementos']) await t.test(origem, async () => {
    const db = await criarBancoTermosTeste();
    try {
      const anterior = { id: 'documento-antigo', tipo: 'memorial', texto: 'Conteúdo anterior intocado', versao: 7 };
      await db.query("update integracao_moradores set dados=jsonb_set(dados,'{documentosGerados}',$1::jsonb) where registro_id=$2", [JSON.stringify([anterior]), i.processoA]);
      if (origem === 'integracao_complementos') {
        await db.exec('insert into integracao_complementos select * from integracao_moradores;delete from integracao_moradores');
      }
      const antes = (await db.query(`select dados from ${origem} where registro_id=$1`, [i.processoA])).rows[0].dados;
      await autenticarTermoTeste(db, i.admin);
      const modelo = await operarTermoTeste(db, 'salvar_modelo', novoModelo(570));
      await autenticarTermoTeste(db);
      const prep = await operarTermoTeste(db, 'preparar', contexto(modelo.id));
      const pedido = { ...contexto(modelo.id), pedidoId: id(670), textoEsperado: preencherTermoMunicipal(prep.modelo, prep.dados).texto };
      await db.query("select set_config('test.deny_update','true',false)");
      await assert.rejects(operarTermoTeste(db, 'emitir', pedido), /contrato/);
      assert.equal((await db.query('select count(*)::int n from integracao_termos_emissoes')).rows[0].n, 0, 'snapshot revertido quando o contrato nega o append');
      assert.deepEqual((await db.query(`select dados from ${origem} where registro_id=$1`, [i.processoA])).rows[0].dados, antes);
      await db.query("select set_config('test.deny_update','false',false)");
      const emissao = await operarTermoTeste(db, 'emitir', pedido);
      assert.deepEqual(await operarTermoTeste(db, 'emitir', pedido), emissao);
      const depois = (await db.query(`select dados from ${origem} where registro_id=$1`, [i.processoA])).rows[0].dados;
      assert.equal(depois.documentosGerados.length, 2, 'retentativa não duplica a referência');
      assert.deepEqual(depois.documentosGerados[0], anterior);
      assert.equal(depois.documentosGerados[1].emissaoId, emissao.id);
      assert.equal(depois.documentosGerados[1].tipo, 'termo_compromisso');
      assert.equal(depois.documentosGerados[1].modeloVersaoId, modelo.id);
      assert.deepEqual({ ...depois, documentosGerados: antes.documentosGerados }, antes, 'nenhum outro campo, etapa ou aprovação foi alterado');
      // Histórico malformado exige diagnóstico, sem converter nem sobrescrever.
      await db.query(`update ${origem} set dados=jsonb_set(dados,'{documentosGerados}','{}') where registro_id=$1`, [i.processoA]);
      await assert.rejects(operarTermoTeste(db, 'emitir', { ...pedido, pedidoId: id(671) }), /histórico/);
      assert.equal((await db.query('select count(*)::int n from integracao_termos_emissoes')).rows[0].n, 1);
      assert.equal((await operarTermoTeste(db, 'listar_emissoes', { processoId: i.processoA }))[0].texto, emissao.texto);
    } finally { await db.close(); }
  });
});

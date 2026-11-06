import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarBancoObservacoes, idObservacoes as id, loginObservacoes as login, PERFIS_OBSERVACOES as u, rpcObservacoes as rpc } from './helpers/observacoes-db.mjs';
const ler = caminho => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const snapshot = JSON.parse(ler('./fixtures/projetos-permissoes-producao-20261106.json'));
const quote = nome => `"${nome.replaceAll('"', '""')}"`;

test('três módulos SQL coexistem com RLS e guard real de etapas sem tocar os cadastros ao salvar observações', async () => {
  const db = await criarBancoObservacoes({ aplicarModulo: false });
  try {
    await db.exec(`create table integracao_nucleos(like integracao_moradores including all);
      alter table integracao_nucleos enable row level security;
      grant select,update(dados,updated_at) on integracao_nucleos to authenticated;
      grant update(dados,updated_at) on integracao_moradores to authenticated;
      create schema storage;create table storage.objects(bucket_id text,name text);`);
    // Completa os tipos reais exigidos pelas outras funções, sem usar moradores reais.
    for (const tabela of ['fin_receb_clientes', 'processos_kanban', 'integracao_nucleos']) {
      const presentes = new Set((await db.query('select column_name from information_schema.columns where table_schema=$1 and table_name=$2', ['public', tabela])).rows.map(r => r.column_name));
      for (const c of snapshot.columns.filter(c => c.table === tabela && !presentes.has(c.column))) await db.exec(`alter table public.${quote(tabela)} add column ${quote(c.column)} ${c.type}`);
    }
    for (const p of snapshot.policies.filter(p => p.tablename === 'integracao_nucleos')) await db.exec(`create policy ${quote(p.policyname)} on integracao_nucleos as ${p.permissive} for ${p.cmd} to authenticated${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''}`);
    const contratos = ler('../supabase/migrations/20261014113728_atribuicoes_contrato_especifico.sql');
    const contratado = contratos.match(/create function integracao_atribuicoes_privado\.contratado\(\)[\s\S]*?\$\$;/)?.[0];
    assert.ok(contratado, 'Usar implementação versionada do guard de contrato');
    await db.exec(contratado);
    await db.exec(snapshot.guards.find(f => f.proname === 'proteger_mutacao').definition);
    await db.exec(`create trigger contrato before insert or update or delete on integracao_moradores for each row execute function integracao_atribuicoes_privado.proteger_mutacao('clientes');
      create trigger contrato before insert or update or delete on integracao_nucleos for each row execute function integracao_atribuicoes_privado.proteger_mutacao('nucleos');
      create trigger contrato before insert or update or delete on integracao_complementos for each row execute function integracao_atribuicoes_privado.proteger_mutacao('clientes');`);
    await db.query(`insert into integracao_atribuicoes_privado.contratos select id,md5(row(id,tipo,setor,ativo,updated_at)::text),$1 from profiles where id=$2`, [JSON.stringify({ clientes: { editar: true }, nucleos: { editar: true } }), u.projeto]);
    await db.exec(ler('../supabase/operacoes/oficios.sql').split('do $$declare')[0].replace(/^begin;\s*/, ''));
    await db.exec(snapshot.privateFunctions.find(f => f.name === 'pode_editar_oficios').definition);
    const assinatura = async () => (await db.query(`select jsonb_build_object(
      'moradores',(select jsonb_agg(to_jsonb(m) order by registro_id) from integracao_moradores m),
      'clientes',(select jsonb_agg(to_jsonb(c) order by id) from fin_receb_clientes c),
      'profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),
      'revisoes',(select jsonb_agg(to_jsonb(r) order by modulo) from integracao_revisoes r)) estado`)).rows[0].estado;
    const antes = await assinatura();
    for (const arquivo of ['projetos-geometria-codigos.sql', 'termos-municipais-20261106.sql', 'documentos-observacoes-20261106.sql']) await db.exec(ler(`../supabase/operacoes/${arquivo}`));
    assert.deepEqual(await assinatura(), antes, 'Instalação aditiva não altera registros anteriores');
    await login(db, u.projeto);
    // Prova que o guard real foi instalado e executa: editar cadastro não libera fluxo.
    await assert.rejects(db.query(`update integracao_moradores set dados=jsonb_set(dados,'{etapa}','1') where registro_id='compartilhado'`), /Fluxo setorial preservado/);
    const conteudo = { version: 1, blocks: [{ id: 'item', type: 'check', checked: false, runs: [{ text: 'Conferir documento', bold: true }] }] };
    const criada = await rpc(db, 'salvar', 'compartilhado', { id: id(900), versao: 0, conteudo });
    assert.equal(criada.versao, 1);
    conteudo.blocks[0].checked = true;
    const editada = await rpc(db, 'salvar', 'compartilhado', { id: id(900), versao: 1, conteudo });
    assert.equal(editada.versao, 2);
    assert.equal((await rpc(db, 'listar', 'compartilhado')).itens[0].conteudo.blocks[0].checked, true);
    assert.deepEqual((await db.query(`select integracao_termos_operar('listar_emissoes',$1) resultado`, [JSON.stringify({ processoId: 'compartilhado' })])).rows[0].resultado, []);
    await db.exec('reset role');
    const depois = await assinatura();
    assert.equal(depois.revisoes[0].versao, antes.revisoes[0].versao + 2);
    delete antes.revisoes; delete depois.revisoes;
    assert.deepEqual(depois, antes, 'Observações mantêm a base geral, identidade, etapas e financeiro');
    await login(db, u.outro);
    await assert.rejects(rpc(db, 'salvar', 'compartilhado', { id: id(900), versao: 2, conteudo }), e => e.code === '42501');
    await assert.rejects(rpc(db, 'listar', 'privado'), e => e.code === '42501');
    await login(db, u.inativo);
    await assert.rejects(rpc(db, 'listar', 'compartilhado'), e => e.code === '42501');
  } finally { await db.close(); }
});

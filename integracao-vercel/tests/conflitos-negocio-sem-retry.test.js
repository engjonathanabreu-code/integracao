// Migration 20261125135233_conflitos_negocio_sem_retry.sql e sua reversão.
//
// A migration é tudo-ou-nada e exige as seis funções no mesmo banco. Cada função nasce de
// um módulo com esquema próprio, então o teste monta um banco PGlite por módulo exatamente
// como os testes de cada módulo já fazem (mesmos arquivos de supabase/ e tests/fixtures) e
// copia para ele, via pg_get_functiondef, as definições das funções dos outros módulos.
// Assim a migration roda sem adaptação e cada função é exercitada no banco em que funciona.
//
// Único ajuste de ambiente: check_function_bodies=off na sessão, porque as funções copiadas
// declaram variáveis com tipos de tabelas que só existem no módulo de origem. Em produção
// todas as tabelas existem; a migration não tem modo de teste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { prepararContrato, como } from './atribuicoes-contrato.fixture.js';
import { criarBancoObservacoes, loginObservacoes, rpcObservacoes, PERFIS_OBSERVACOES } from './helpers/observacoes-db.mjs';
import { erroObservacao } from '../src/observacoes-documentos.js';
import { erroConcorrencia } from '../src/concorrencia.js';
import { rejeicaoDefinitiva } from '../src/atualizacao-rascunho.js';
import { buscarREST } from '../src/transporte-rest.js';

const ler = caminho => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const MIGRATION = ler('../supabase/migrations/20261125135233_conflitos_negocio_sem_retry.sql');
const REVERSAO = ler('../supabase/operacoes/conflitos-negocio-sem-retry-reversao.sql');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// md5(prosrc) e quantidade do literal '40001' de cada função, como a migration espera.
const ALVOS = [
  ['integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid)', '53fb35c55a6a560b8ddea6db37ada23c', 1],
  ['integracao_documental_alternar(boolean,bigint)', 'af3673f98553b7dbf42c8ebb0fa54e3f', 1],
  ['integracao_documentos_observacoes_operar(text,text,jsonb)', '617587e13ef73d5360c54ed3f6e8bee2', 2],
  ['integracao_documentos_observacoes_privado.proteger()', '2ac1ffcbab6a9242daf7121d943b3479', 1],
  ['integracao_mailing_salvar(text,bigint,jsonb)', 'f82f3e6070e9252a5e283efd3d1c9b15', 3],
  ['reorder_plan_steps(uuid,uuid[],uuid[])', '0411647835ba76f881c5da2f5e99bcf1', 1]
].map(([assinatura, md5, literais]) => ({ assinatura, md5, literais }));
const contar = (texto, trecho) => texto.split(trecho).length - 1;

const AUTH = `create role anon;create role authenticated;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`;
const entrar = (db, n) => db.exec(`reset role;set request.jwt.claim.sub='${id(n)}';set role authenticated;`);
const sair = db => db.exec('reset role;reset request.jwt.claim.sub;');
const comoUsuario = async (db, n, fn) => { await entrar(db, n); try { return await fn(); } finally { await sair(db); } };

// ---- Um banco por módulo, com os mesmos arquivos que os testes do módulo carregam ----

async function bancoAtribuicoes() {
  // tests/atribuicoes-contrato.fixture.js: fixture da etapa 1 + migration 20261014113728.
  const { db } = await prepararContrato();
  const matriz = { schema_version: 1, atribuicoes: [], fluxo_moradores: { 'topografia.avancar': 'permitir' } };
  const salvar = requisicao => como(db, 4, 'select public.integracao_atribuicoes_salvar($1,$2,$3,$4,$5)', [id(2), 0, JSON.stringify(matriz), 'Revisão sintética', id(requisicao)]);
  await salvar(901); // a revisão passa a 1; uma nova requisição com revisão 0 é conflito
  return { db, conflitos: [['integracao_atribuicoes_salvar', () => salvar(902), 'Conflito de revisao; recarregue o rascunho']] };
}

async function bancoDocumental() {
  // Mesmo preparo de tests/documental-guaratuba.test.js.
  const db = new PGlite(), cidade = 'b62f14cb-b2ee-55df-aa2f-3154b6fe7d1d';
  await db.exec(`${AUTH}create role service_role bypassrls;
    create table profiles(id uuid primary key,tipo text,ativo boolean);insert into profiles values('${id(1)}','Administrador',true);
    create function is_erp_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and tipo='Administrador' and ativo)$$;
    create table fin_receb_municipios(id uuid primary key,nome text);insert into fin_receb_municipios values('${cidade}','Guaratuba');
    create table fin_receb_clientes(id uuid primary key,municipio_id uuid,nome text,cpf_cnpj text,codigo text,ativo boolean);
    create table integracao_crm_conversas(id uuid,card_id uuid,instalacao text,conta_id bigint,conversa_id bigint,identidade_confirmada boolean);
    create table integracao_crm_cards(id uuid,cliente_id uuid);
    create table integracao_moradores(colecao text,registro_id text,referencia_id uuid,dados jsonb,updated_at timestamptz);
    create table integracao_configuracoes(colecao text,registro_id text,dados jsonb);
    grant all on fin_receb_clientes,integracao_crm_conversas,integracao_crm_cards,integracao_moradores,integracao_configuracoes to service_role;`);
  await db.exec(ler('../supabase/migrations/20261014170000_documental_guaratuba.sql'));
  await db.exec(ler('../supabase/migrations/20261014173000_documental_pastas_seguras.sql'));
  const alternar = () => comoUsuario(db, 1, () => db.query('select public.integracao_documental_alternar(false,999)'));
  return { db, conflitos: [['integracao_documental_alternar', alternar, 'O fluxo foi alterado em outra sessão. Atualize antes de tentar novamente.']] };
}

async function bancoObservacoes() {
  // tests/helpers/observacoes-db.mjs: supabase/operacoes/documentos-observacoes-20261106.sql.
  const db = await criarBancoObservacoes(), autor = PERFIS_OBSERVACOES.projeto;
  const conteudo = texto => ({ version: 1, blocks: [{ id: 'texto', type: 'paragraph', runs: [{ text: texto }] }] });
  const logado = async fn => { await loginObservacoes(db, autor); try { return await fn(); } finally { await db.exec('reset role'); } };
  await logado(() => rpcObservacoes(db, 'salvar', 'compartilhado', { id: id(200), versao: 0, conteudo: conteudo('Original') }));
  const mensagem = 'Conflito de versão. A observação foi alterada em outra sessão';
  return { db, conflitos: [
    ['integracao_documentos_observacoes_operar', () => logado(() => rpcObservacoes(db, 'salvar', 'compartilhado', { id: id(200), versao: 5, conteudo: conteudo('Versão antiga') })), mensagem],
    // Gatilho: gravação direta na tabela sem avançar a versão.
    ['integracao_documentos_observacoes_privado.proteger', () => logado(() => db.query('update public.integracao_documentos_observacoes set conteudo=$1 where id=$2', [JSON.stringify(conteudo('Sem versão')), id(200)])), mensagem]
  ] };
}

async function bancoMailing() {
  // Mesmo preparo de tests/mailing-server.test.js.
  const db = new PGlite(), caixa = 'erp_' + id(2);
  await db.exec(`${AUTH}create table profiles(id uuid primary key,ativo boolean,tipo text,setor text);
    insert into profiles values('${id(2)}',true,'Comercial','Comercial'),('${id(3)}',true,'Comercial','Comercial');grant select on profiles to authenticated;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
  await db.exec(ler('../supabase/migrations/20261008121000_mailing.sql'));
  const salvar = (versao, dados) => comoUsuario(db, 2, async () => (await db.query('select public.integracao_mailing_salvar($1,$2,$3::jsonb) r', [caixa, versao, JSON.stringify(dados)])).rows[0].r);
  const inicial = await comoUsuario(db, 2, async () => (await db.query('select public.integracao_mailing_ler($1) r', [caixa])).rows[0].r);
  const rascunho = { id: crypto.randomUUID(), owner: id(2), from: caixa, to: [], cc: [], bcc: [], attachments: [], subject: 'Assunto', body: 'Primeira versão' };
  const salva = await salvar(inicial.version, { ...inicial.data, drafts: [rascunho] }); // rascunho passa à revisão 1
  const envio = { ...rascunho, owner: id(2), thread: crypto.randomUUID(), mailbox: caixa, copy: 'outgoing', to: ['erp_' + id(3)], status: 'sent', date: new Date().toISOString(), flags: { [caixa]: { read: true } } };
  return { db, conflitos: [
    ['integracao_mailing_salvar (versão da caixa)', () => salvar(inicial.version, { ...inicial.data, drafts: [rascunho] }), 'Esta caixa foi atualizada. Atualize-a antes de salvar; seu rascunho foi preservado.'],
    ['integracao_mailing_salvar (revisão do rascunho)', () => salvar(salva.version, { ...salva.data, drafts: [{ ...rascunho, body: 'Versão antiga modificada' }] }), 'O rascunho mudou em outra tela. Sua versão foi preservada neste navegador.'],
    ['integracao_mailing_salvar (envio de rascunho antigo)', () => salvar(salva.version, { ...salva.data, drafts: [], messages: [envio] }), 'O rascunho mudou em outra tela. Confira antes de enviar.']
  ] };
}

async function bancoPlanos() {
  // reorder_plan_steps: captura de tests/fixtures/acoes-concorrencia-producao.sql mais o
  // trecho da migration 20260930135438 que a altera (o mesmo caminho de
  // tests/editores-conciliados.test.js, sem o restante do CRM de que ela não depende).
  const db = new PGlite();
  await db.exec(`${AUTH}create table planos_trabalho(id uuid primary key);create table etapas_plano(id uuid primary key,plano_id uuid,ordem integer);
    create function can_manage_core() returns boolean language sql as $$select auth.uid()='${id(1)}'::uuid$$;
    grant select,update on planos_trabalho,etapas_plano to authenticated;
    insert into planos_trabalho values('${id(91)}');insert into etapas_plano values('${id(92)}','${id(91)}',0),('${id(93)}','${id(91)}',1);`);
  await db.exec(ler('./fixtures/acoes-concorrencia-producao.sql').match(/CREATE OR REPLACE FUNCTION public\.reorder_plan_steps[\s\S]*?\$function\$;/)[0]);
  const patch = ler('../supabase/migrations/20260930135438_acoes_repetidas_concorrencia.sql'), fim = 'EXECUTE atualizado;';
  const inicio = patch.indexOf(" SELECT pg_get_functiondef('public.reorder_plan_steps");
  assert.ok(inicio > 0 && patch.indexOf(fim) > inicio, 'trecho de reorder_plan_steps da migration 20260930135438');
  await db.exec(`do $patch$ declare original text; atualizado text; begin ${patch.slice(inicio, patch.indexOf(fim) + fim.length)} end $patch$;`);
  const reordenar = () => comoUsuario(db, 1, () => db.query('select public.reorder_plan_steps($1,$2,$3)', [id(91), [id(93), id(92)], [id(93), id(92)]]));
  return { db, conflitos: [['reorder_plan_steps', reordenar, 'As etapas foram alteradas. Reabra o plano e tente novamente.']] };
}

// ---- Apoio comum ----

const retrato = async db => (await db.query(`select p.oid::int oid,p.oid::regprocedure::text assinatura,p.prosrc,md5(p.prosrc) md5,p.proacl::text proacl,p.prosecdef,p.proconfig,
    p.proowner::regrole::text dono,p.provolatile,p.proleakproof,p.proparallel,p.prorettype::regtype::text retorno,l.lanname
  from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=any($1::regprocedure[]::oid[]) order by 2`, [ALVOS.map(a => a.assinatura)])).rows;
const semCorpo = linhas => linhas.map(({ prosrc, md5, ...resto }) => resto);

// Executa o arquivo como um cliente SQL faria: se falhar, encerra a transação aberta.
async function executarArquivo(db, sql) {
  await db.exec('reset role');
  try { await db.exec(sql); } catch (e) { await db.exec('rollback'); throw e; }
  assert.equal((await db.query('show lock_timeout')).rows[0].lock_timeout, '0', 'lock_timeout não vaza da transação');
}

async function recusa(conflitos, codigo) {
  for (const [rotulo, tentar, mensagem] of conflitos) {
    await assert.rejects(tentar, e => {
      assert.equal(e.code, codigo, `${rotulo}: SQLSTATE`);
      assert.equal(e.message, mensagem, `${rotulo}: mensagem`);
      return true;
    }, rotulo);
  }
}

test('conflitos de negócio sem retry: migration tudo-ou-nada e reversão nas seis funções', async t => {
  const modulos = {};
  for (const [nome, criar] of Object.entries({ atribuicoes: bancoAtribuicoes, documental: bancoDocumental, observacoes: bancoObservacoes, mailing: bancoMailing, planos: bancoPlanos })) modulos[nome] = await criar();
  try {
    // Definições nativas de cada módulo, lidas do catálogo depois de carregar os arquivos do repositório.
    const definicoes = new Map();
    for (const { db } of Object.values(modulos)) {
      await db.exec('reset role');
      for (const alvo of ALVOS) {
        const linha = (await db.query('select pg_get_functiondef(f) definicao,md5(prosrc) md5,prosrc from (select to_regprocedure($1) f) x join pg_proc p on p.oid=x.f', [alvo.assinatura])).rows[0];
        if (!linha) continue;
        assert.equal(definicoes.has(alvo.assinatura), false, `${alvo.assinatura} definida em um único módulo`);
        definicoes.set(alvo.assinatura, linha);
      }
    }

    await t.test('as definições do repositório têm o corpo e os literais que a migration espera', () => {
      for (const alvo of ALVOS) {
        const linha = definicoes.get(alvo.assinatura);
        assert.ok(linha, `${alvo.assinatura} carregada pelos arquivos do repositório`);
        assert.equal(linha.md5, alvo.md5, `${alvo.assinatura}: md5(prosrc)`);
        assert.equal(contar(linha.definicao, "'40001'"), alvo.literais, `${alvo.assinatura}: literais`);
        assert.equal(contar(linha.definicao, 'PT409'), 0);
        assert.ok(MIGRATION.includes(`${alvo.md5}', ${alvo.literais})`) && REVERSAO.includes(`${alvo.md5}', ${alvo.literais})`), `${alvo.assinatura} nos dois arquivos`);
      }
      assert.equal(contar(MIGRATION, 'begin;'), 1); assert.equal(contar(MIGRATION, 'commit;'), 1);
      assert.match(MIGRATION, /set local lock_timeout = '5s';/); assert.match(REVERSAO, /set local lock_timeout = '5s';/);
      assert.match(REVERSAO, /^-- Reversão de supabase\/migrations\/20261125135233_conflitos_negocio_sem_retry\.sql\./);
      // Só catálogo de funções: nada de dados, permissões, dono ou regex.
      for (const sql of [MIGRATION, REVERSAO]) assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(grant|revoke|alter|drop|insert|update|delete|truncate|regexp_replace|security definer|owner)\b/i);
    });

    // Completa cada banco com as funções dos outros módulos (só a definição).
    for (const { db } of Object.values(modulos)) {
      await db.exec('set check_function_bodies=off;create schema if not exists integracao_documentos_observacoes_privado;');
      for (const alvo of ALVOS) if (!(await db.query('select to_regprocedure($1) f', [alvo.assinatura])).rows[0].f) await db.exec(definicoes.get(alvo.assinatura).definicao);
    }

    for (const [nome, { db, conflitos }] of Object.entries(modulos)) {
      await t.test(`${nome}: instala, recusa com PT409 e a mesma mensagem, não reaplica e reverte byte a byte`, async () => {
        const antes = await retrato(db);
        assert.deepEqual(antes.map(l => l.md5).sort(), ALVOS.map(a => a.md5).sort());
        await recusa(conflitos, '40001');

        await executarArquivo(db, MIGRATION);
        const depois = await retrato(db);
        for (const [i, linha] of depois.entries()) {
          assert.equal(linha.prosrc, antes[i].prosrc.replaceAll("'40001'", "'PT409'"), `${linha.assinatura}: só o literal muda`);
          assert.equal(contar(linha.prosrc, '40001'), 0);
          assert.equal(contar(linha.prosrc, "'PT409'"), ALVOS.find(a => linha.assinatura.endsWith(a.assinatura)).literais);
        }
        assert.deepEqual(semCorpo(depois), semCorpo(antes), 'oid, ACL, dono, security definer, search_path e demais atributos conservados');
        await recusa(conflitos, 'PT409');

        await assert.rejects(executarArquivo(db, MIGRATION), /já está corrigida \(PT409\); nada foi alterado/);
        assert.deepEqual(await retrato(db), depois, 'reaplicar não altera nada');

        await executarArquivo(db, REVERSAO);
        assert.deepEqual(await retrato(db), antes, 'reversão restaura corpo e atributos idênticos');
        await recusa(conflitos, '40001');
        await assert.rejects(executarArquivo(db, REVERSAO), /já está no corpo original \(40001\); nada foi alterado/);
        assert.deepEqual(await retrato(db), antes);
      });
    }

    await t.test('ACL, security definer e search_path reais de cada função passaram pela conferência', async () => {
      // No banco de origem cada função tem os atributos do seu arquivo; confirma que não eram valores vazios.
      const origem = { atribuicoes: [0], documental: [1], observacoes: [2, 3], mailing: [4] };
      for (const [nome, indices] of Object.entries(origem)) {
        const linhas = await retrato(modulos[nome].db);
        for (const i of indices) {
          const linha = linhas.find(l => l.assinatura.endsWith(ALVOS[i].assinatura));
          assert.deepEqual(linha.proconfig, ['search_path=""'], linha.assinatura);
          assert.doesNotMatch(linha.proacl, /(^\{|,)=X\//, `${linha.assinatura}: sem execução para PUBLIC`);
          assert.equal(/authenticated=X/.test(linha.proacl), !linha.assinatura.includes('proteger'), linha.assinatura);
        }
      }
      const definer = Object.fromEntries((await retrato(modulos.mailing.db)).map(l => [l.assinatura, l.prosecdef]));
      assert.equal(definer['integracao_mailing_salvar(text,bigint,jsonb)'], true);
      const gatilho = (await modulos.observacoes.db.query(`select count(*)::int n from pg_trigger where tgfoid='integracao_documentos_observacoes_privado.proteger()'::regprocedure`)).rows[0].n;
      assert.ok(gatilho >= 1, 'gatilho continua ligado à função');
    });

    await t.test('função divergente ou ausente aborta sem alterar nenhuma outra', async () => {
      const db = modulos.planos.db, original = await retrato(db);
      const instalar = definicao => db.exec(definicao);
      const comComentario = (definicao, texto) => { const fim = definicao.lastIndexOf('$function$'); return `${definicao.slice(0, fim)}\n-- ${texto}\n${definicao.slice(fim)}`; };
      for (const alvo of ALVOS) {
        const { definicao } = definicoes.get(alvo.assinatura);
        // Corpo com um comentário a mais: mesmo comportamento, md5 diferente.
        await instalar(comComentario(definicao, 'alterada depois da captura'));
        const divergente = await retrato(db);
        assert.notDeepEqual(divergente, original);
        await assert.rejects(executarArquivo(db, MIGRATION), e => e.message.includes(alvo.assinatura) && /corpo diferente do esperado/.test(e.message) && /[Nn]ada foi alterado/.test(e.message));
        assert.deepEqual(await retrato(db), divergente, `${alvo.assinatura} divergente: nenhuma função alterada`);
        await instalar(definicao);
        assert.deepEqual(await retrato(db), original);
      }

      // Ausente (a última da lista: as cinco anteriores já teriam sido conferidas).
      await db.exec('drop function public.reorder_plan_steps(uuid,uuid[],uuid[])');
      const semUma = await db.query(`select md5(string_agg(prosrc,'|' order by oid)) h from pg_proc where proname like 'integracao_%' or proname='proteger'`);
      await assert.rejects(executarArquivo(db, MIGRATION), /reorder_plan_steps\(uuid,uuid\[\],uuid\[\]\) não encontrada; nada foi alterado/);
      assert.deepEqual(await db.query(`select md5(string_agg(prosrc,'|' order by oid)) h from pg_proc where proname like 'integracao_%' or proname='proteger'`).then(r => r.rows), semUma.rows);
      await instalar(definicoes.get(ALVOS[5].assinatura).definicao);

      // Reversão: só age sobre o que a migration deixou.
      await executarArquivo(db, MIGRATION);
      const corrigido = await retrato(db);
      for (const alvo of ALVOS) {
        const atual = (await db.query('select pg_get_functiondef(to_regprocedure($1)) d', [alvo.assinatura])).rows[0].d;
        await instalar(comComentario(atual, 'alterada depois da migration'));
        const divergente = await retrato(db);
        assert.notDeepEqual(divergente, corrigido);
        await assert.rejects(executarArquivo(db, REVERSAO), e => e.message.includes(alvo.assinatura) && /não está como a migration deixou/.test(e.message));
        assert.deepEqual(await retrato(db), divergente, `${alvo.assinatura} divergente: reversão não altera nada`);
        await instalar(atual);
        assert.deepEqual(await retrato(db), corrigido);
      }
      await executarArquivo(db, REVERSAO);
      assert.deepEqual(semCorpo(await retrato(db)).map(({ oid, ...l }) => l), semCorpo(original).map(({ oid, ...l }) => l));
      assert.deepEqual((await retrato(db)).map(l => l.md5).sort(), ALVOS.map(a => a.md5).sort());
    });
  } finally {
    for (const { db } of Object.values(modulos)) await db.close();
  }
});

test('cliente: HTTP 409 com PT409 dessas funções chega às telas como conflito, com a mensagem do servidor', async () => {
  const mensagens = [
    'Conflito de revisao; recarregue o rascunho',
    'O fluxo foi alterado em outra sessão. Atualize antes de tentar novamente.',
    'Conflito de versão. A observação foi alterada em outra sessão',
    'Conflito de versão. Confira a observação atual',
    'Esta caixa foi atualizada. Atualize-a antes de salvar; seu rascunho foi preservado.',
    'O rascunho mudou em outra tela. Sua versão foi preservada neste navegador.',
    'O rascunho mudou em outra tela. Confira antes de enviar.'
  ];
  const fetchOriginal = globalThis.fetch;
  let chamadas = 0;
  try {
    for (const message of mensagens) {
      // O que o PostgREST devolve para um raise com errcode PT409.
      globalThis.fetch = async () => { chamadas++; return new Response(JSON.stringify({ code: 'PT409', message, details: null, hint: null }), { status: 409, headers: { 'Content-Type': 'application/json' } }); };
      const antes = chamadas;
      const erro = await buscarREST('https://exemplo.test/rest/v1/rpc/funcao', { method: 'POST', body: '{}' }).then(() => null, e => e);
      assert.equal(chamadas - antes, 1, 'gravação recusada não é repetida pelo transporte');
      // Mailing, Documental e Atribuições mostram error.message; nada depende de 40001.
      assert.deepEqual([erro.status, erro.code, erro.message], [409, 'PT409', message]);
      assert.equal(erroConcorrencia(erro), true);
      assert.equal(rejeicaoDefinitiva(erro), true);
    }
  } finally { globalThis.fetch = fetchOriginal; }
  // Observações de documentos troca a mensagem do servidor pelo aviso de conflito da tela.
  for (const message of mensagens.slice(2, 4)) assert.match(erroObservacao(Object.assign(new Error(message), { status: 409, code: 'PT409' })), /alterada em outra sessão\. Seu texto foi mantido/);
});

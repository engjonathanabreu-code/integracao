import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {podeVerNotificacao, notificacoesUsuario} from '../src/notificacoes-usuario.js';

const ler = caminho => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const arquivoMigration = readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(n => n.endsWith('_monitor_lacos_repeticao.sql'));
const migration = ler(`../supabase/migrations/${arquivoMigration}`);
const reversao = ler('../supabase/operacoes/monitor-lacos-repeticao-reversao.sql');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trecho = (sql, padrao) => { const m = sql.match(padrao); assert.ok(m, `trecho não encontrado: ${padrao}`); return m[0]; };

// Tabela, função de visibilidade, gatilho de leitura e políticas vêm dos arquivos reais do
// repositório; só o que pertence ao ERP (profiles, auth, is_erp_admin) é montado aqui.
const base = ler('../supabase/migrations/20260914142328_persistencia_completa_integracao.sql');
const rls = ler('../supabase/migrations/20261124120000_rls_desempenho_sincronizacao.sql');
const tempoReal = ler('../supabase/operacoes/tempo-real.sql');
const notificacoesReais = [
  trecho(base, /CREATE TABLE public\.integracao_notificacoes \([\s\S]*?\n\);/),
  'ALTER TABLE public.integracao_notificacoes ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON public.integracao_notificacoes FROM PUBLIC,anon,authenticated;',
  trecho(base, /CREATE FUNCTION public\.integracao_notificacao_visivel[\s\S]*?\n\$\$;/),
  'GRANT EXECUTE ON FUNCTION public.integracao_notificacao_visivel(jsonb,uuid) TO authenticated;',
  'GRANT SELECT,INSERT ON public.integracao_notificacoes TO authenticated;',
  trecho(base, /GRANT UPDATE\(dados,updated_at\) ON public\.integracao_notificacoes TO authenticated;/),
  trecho(base, /CREATE POLICY marcar ON public\.integracao_notificacoes[^;]*;/),
  trecho(base, /CREATE POLICY ler ON public\.integracao_notificacoes[^;]*;/),
  trecho(base, /CREATE FUNCTION public\.integracao_validar_leitura\(\)[\s\S]*?END \$\$;/),
  trecho(base, /CREATE TRIGGER confirmar_leitura BEFORE UPDATE ON public\.integracao_notificacoes[^;]*;/),
  trecho(rls, /alter policy ler on public\.integracao_notificacoes[\s\S]*?;/),
  // Gatilho de tempo real que existe em produção nesta tabela, com a função real do repositório.
  'create schema integracao_crm_privado;',
  trecho(tempoReal, /create table public\.integracao_revisoes[^;]*;/),
  trecho(tempoReal, /create function integracao_crm_privado\.sinalizar_revisao\(\)[\s\S]*?end \$\$;/),
  "insert into public.integracao_revisoes(modulo) values('auxiliar');",
  "create trigger integracao_revisao after insert or update or delete on public.integracao_notificacoes for each statement execute function integracao_crm_privado.sinalizar_revisao('auxiliar');",
].join('\n');

// pg_cron não existe no PGlite. Este schema imita só o que a migration e a função usam;
// cron.schedule falha em nome repetido, o que prova que a migration desagenda antes.
const cronFalso = `create schema cron;
 create table cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text);
 create table cron.job_run_details(runid bigserial primary key, jobid bigint, end_time timestamptz);
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
 create function cron.unschedule(bigint) returns boolean language sql as $$delete from cron.job where jobid=$1 returning true$$;`;

async function montar({cron = false} = {}) {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated, anon;
   create table public.profiles(id uuid primary key references auth.users(id), nome text, tipo text, ativo boolean);
   grant select on public.profiles to authenticated;
   create function public.is_erp_admin() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;
   insert into auth.users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
   insert into public.profiles values
    ('${id(1)}','A','Administrador',false),('${id(2)}','B','Diretor Técnico',true),('${id(3)}','C','Administrador',true),
    ('${id(4)}','D','Administrador',true),('${id(5)}','E','Topografia',true),('${id(6)}','F','Diretor de Projetos',false);`);
  await db.exec(notificacoesReais);
  if (cron) await db.exec(cronFalso);
  await db.exec(migration);
  // Contadores controlados pelo teste: substitui só a função interna de leitura.
  await db.exec(`create table public.teste_contadores(r bigint, c bigint); insert into public.teste_contadores values(1000,50000);
   create or replace function integracao_monitor_privado.ler_contadores(out xact_rollback bigint, out xact_commit bigint)
   language sql stable set search_path='' as $$select r,c from public.teste_contadores$$;`);
  const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const contar = async tabela => (await um(`select count(*)::int n from ${tabela}`)).n;
  // O relógio não é simulado: o teste envelhece as linhas já gravadas.
  const envelhecer = minutos => db.query(`update integracao_monitor_privado.amostras set instante=instante-make_interval(mins=>$1);`, [minutos])
    .then(() => db.query(`update integracao_monitor_privado.alertas set instante=instante-make_interval(mins=>$1)`, [minutos]));
  const verificar = async () => (await um('select integracao_monitor_privado.verificar() v')).v;
  const passo = async (desfeitas, confirmadas, minutos = 2) => {
    await envelhecer(minutos);
    await db.query('update public.teste_contadores set r=r+$1,c=c+$2', [desfeitas, confirmadas]);
    return verificar();
  };
  const login = async n => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']); await db.exec(n ? 'set role authenticated' : 'set role anon'); };
  const sair = () => db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  return {db, um, contar, envelhecer, verificar, passo, login, sair};
}
const NORMAL = [40, 3000], LACO = [20400, 150];
// A taxa usa o tempo real decorrido (2 min + milissegundos do teste): compara com folga.
const perto = (valor, esperado) => assert.ok(Math.abs(valor - esperado) <= esperado * 0.001 + 0.1, `${valor} ≈ ${esperado}`);
const alertas = b => b.contar('integracao_monitor_privado.alertas');
const notificacoes = b => b.contar('public.integracao_notificacoes');

test('monitor: tráfego normal não alerta; só a segunda verificação seguida acima do limite alerta; silêncio de 60 min', async () => {
  const b = await montar();
  try {
    const primeira = await b.verificar();
    assert.equal(primeira.executado, true); assert.equal(primeira.desfeitas_por_minuto, null);
    for (let i = 0; i < 6; i++) { const r = await b.passo(...NORMAL); assert.equal(r.acima_do_limite, false); perto(r.desfeitas_por_minuto, 20); }
    // Muitas desfeitas, mas menos que as confirmadas: não é laço.
    assert.equal((await b.passo(5000, 9000)).acima_do_limite, false);
    // Mais desfeitas que confirmadas, mas abaixo do limite por minuto.
    assert.equal((await b.passo(1100, 100)).acima_do_limite, false);
    // Exatamente no limite (600/min) não passa.
    assert.equal((await b.passo(1200, 100)).acima_do_limite, false);
    // Pico isolado: uma verificação acima e a seguinte normal.
    const pico = await b.passo(...LACO);
    assert.equal(pico.acima_do_limite, true); assert.equal(pico.alerta_id, null);
    assert.equal((await b.passo(...NORMAL)).acima_do_limite, false);
    assert.equal(await alertas(b), 0); assert.equal(await notificacoes(b), 0);

    // Laço: primeira verificação acima não alerta; a segunda alerta.
    assert.equal((await b.passo(...LACO)).alerta_id, null);
    assert.equal(await alertas(b), 0);
    const segunda = await b.passo(...LACO);
    assert.ok(segunda.alerta_id); assert.equal(segunda.notificado, true); perto(segunda.desfeitas_por_minuto, 10200);
    assert.equal(await alertas(b), 1); assert.equal(await notificacoes(b), 1);
    const alerta = await b.um('select tipo,detalhes,notificado from integracao_monitor_privado.alertas');
    assert.equal(alerta.tipo, 'laco_repeticao'); assert.equal(alerta.notificado, true);
    assert.equal(alerta.detalhes.desfeitas_na_janela, 20400); assert.equal(alerta.detalhes.confirmadas_na_janela, 150);
    assert.equal(alerta.detalhes.limite_desfeitas_minuto, 600); assert.deepEqual(alerta.detalhes.sessoes_suspeitas, []);

    // O laço continua: nada novo por 58 minutos; aos 60 alerta de novo, uma vez.
    for (let i = 0; i < 29; i++) { const r = await b.passo(...LACO); assert.equal(r.silenciado, true); assert.equal(r.alerta_id, null); }
    assert.equal(await alertas(b), 1); assert.equal(await notificacoes(b), 1);
    assert.ok((await b.passo(...LACO)).alerta_id);
    assert.equal(await alertas(b), 2); assert.equal(await notificacoes(b), 2);
  } finally { await b.db.close(); }
});

test('monitor: reinício dos contadores, execução pulada, limites ajustáveis e desligamento', async () => {
  const b = await montar();
  try {
    await b.verificar();
    await b.passo(...NORMAL);
    assert.equal((await b.passo(...LACO)).acima_do_limite, true);
    // Banco reiniciou: contadores voltam a valores pequenos. Não avalia nem alerta.
    await b.envelhecer(2); await b.db.exec('update public.teste_contadores set r=30000,c=10');
    const reinicio = await b.verificar();
    assert.equal(reinicio.contadores_reiniciados, true); assert.equal(reinicio.acima_do_limite, false); assert.equal(reinicio.alerta_id, null);
    assert.equal(await alertas(b), 0);
    // Depois do reinício a contagem recomeça: precisa de duas seguidas de novo.
    assert.equal((await b.passo(...LACO)).alerta_id, null);
    assert.ok((await b.passo(...LACO)).alerta_id);
    assert.equal(await alertas(b), 1);

    // Execução pulada (4 min entre verificações): a taxa usa o tempo real decorrido.
    await b.db.exec('delete from integracao_monitor_privado.alertas');
    assert.equal((await b.passo(...NORMAL)).acima_do_limite, false);
    const pulada = await b.passo(20400, 150, 4);
    perto(pulada.desfeitas_por_minuto, 5100); assert.equal(pulada.acima_do_limite, true);
    // Monitor parado por muito tempo: sem amostra de referência recente, não avalia.
    const parado = await b.passo(900000, 10, 30);
    assert.equal(parado.desfeitas_por_minuto, null); assert.equal(parado.acima_do_limite, false);
    assert.equal(await alertas(b), 0);

    // Limite ajustado por UPDATE, sem reescrever a função.
    await b.db.exec('update integracao_monitor_privado.configuracao set limite_desfeitas_minuto=100000');
    for (let i = 0; i < 3; i++) assert.equal((await b.passo(...LACO)).acima_do_limite, false);
    await b.db.exec('update integracao_monitor_privado.configuracao set limite_desfeitas_minuto=10, silencio_minutos=1');
    await b.passo(100, 5); assert.ok((await b.passo(100, 5)).alerta_id);
    await assert.rejects(b.db.exec('insert into integracao_monitor_privado.configuracao(id) values(false)'));
    assert.equal(await b.contar('integracao_monitor_privado.configuracao'), 1);

    // Desligado: não grava amostra nem alerta.
    await b.db.exec('update integracao_monitor_privado.configuracao set ativo=false');
    const antes = await b.contar('integracao_monitor_privado.amostras');
    assert.equal((await b.passo(...LACO)).executado, false);
    assert.equal(await b.contar('integracao_monitor_privado.amostras'), antes);
    // Sem a linha de configuração a função volta aos padrões em vez de falhar.
    await b.db.exec('delete from integracao_monitor_privado.configuracao');
    assert.equal((await b.passo(...NORMAL)).executado, true);
  } finally { await b.db.close(); }
});

test('monitor: notificação no formato da tela, assinada por administrador ativo e visível só à diretoria', async () => {
  const b = await montar();
  try {
    await b.verificar(); await b.passo(...LACO); const r = await b.passo(...LACO);
    assert.equal(r.notificado, true);
    const linha = await b.um('select * from public.integracao_notificacoes');
    const d = linha.dados;
    assert.equal(linha.colecao, 'notificacoes'); assert.equal(linha.registro_id, d.id);
    assert.match(d.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Administrador ativo de menor id: o 1 está inativo, o 2 é diretor, o 3 é o escolhido.
    assert.equal(linha.criado_por, id(3));
    assert.equal(linha.referencia_tabela, null); assert.equal(linha.referencia_id, null);
    assert.deepEqual(Object.keys(d).sort(), ['data', 'id', 'lidaPor', 'rota', 'setores', 'texto', 'titulo', 'usuarios']);
    assert.equal(d.titulo, 'Banco: possível laço de repetição');
    assert.match(d.texto, /cerca de \d+ transações por minuto/); perto(Number(d.texto.match(/cerca de (\d+)/)[1]), 10200); assert.match(d.texto, /suporte técnico/);
    // Mesmo formato de new Date().toISOString() usado por novaNotificacao().
    assert.match(d.data, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.equal(new Date(d.data).toISOString(), d.data);
    assert.ok(Math.abs(Date.now() - Date.parse(d.data)) < 60000);
    assert.deepEqual(d.rota, {pag: 'home'}); assert.deepEqual(d.setores, ['diretoria']);
    assert.deepEqual(d.usuarios, []); assert.deepEqual(d.lidaPor, []);
    assert.equal((await b.um('select detalhes from integracao_monitor_privado.alertas')).detalhes.notificacao_id, d.id);
    // O gatilho de tempo real da tabela disparou (as telas abertas releem as notificações).
    assert.equal((await b.um("select versao::int v from public.integracao_revisoes where modulo='auxiliar'")).v, 1);

    // Regra do cliente (src/notificacoes-usuario.js).
    assert.equal(podeVerNotificacao(d, {id: 'erp_' + id(2), setor: 'diretoria'}), true);
    assert.equal(podeVerNotificacao(d, {id: 'erp_' + id(5), setor: 'topografia'}), false);
    const tela = {usuarios: [{id: 'erp_' + id(2)}], notificacoes: [{...d, id: 'antiga', data: '2026-01-01T00:00:00.000Z'}, d]};
    assert.equal(notificacoesUsuario(tela, {id: 'erp_' + id(2), setor: 'diretoria'})[0].id, d.id);

    // Política de leitura real do repositório.
    const visiveis = async n => { await b.login(n); const q = await b.contar('public.integracao_notificacoes'); await b.sair(); return q; };
    assert.equal(await visiveis(2), 1, 'Diretor Técnico ativo vê pelo setor diretoria');
    assert.equal(await visiveis(3), 1, 'administrador que assina vê');
    assert.equal(await visiveis(4), 1, 'outro administrador vê');
    assert.equal(await visiveis(5), 0, 'Topografia não vê');
    assert.equal(await visiveis(6), 0, 'diretor inativo não vê');
    assert.equal(await visiveis(1), 0, 'administrador inativo não vê');
    await b.login(0); await assert.rejects(b.db.query('select * from public.integracao_notificacoes'), /permission denied/); await b.sair();
    // A diretoria consegue marcar como lida pelo gatilho real de leitura.
    await b.login(2);
    await b.db.query(`update public.integracao_notificacoes set dados=jsonb_set(dados,'{lidaPor}',$1::jsonb)`, [JSON.stringify(['erp_' + id(2)])]);
    await assert.rejects(b.db.query(`update public.integracao_notificacoes set dados=jsonb_set(dados,'{titulo}','"x"')`), /Somente a própria confirmação/);
    await b.sair();
    assert.deepEqual((await b.um('select dados from public.integracao_notificacoes')).dados.lidaPor, ['erp_' + id(2)]);
  } finally { await b.db.close(); }
});

test('monitor: sem administrador ativo ou com falha ao notificar, o alerta é registrado e a verificação segue', async () => {
  const b = await montar();
  try {
    await b.db.exec("update public.profiles set ativo=false where tipo='Administrador'");
    await b.verificar(); await b.passo(...LACO);
    const semAdmin = await b.passo(...LACO);
    assert.ok(semAdmin.alerta_id); assert.equal(semAdmin.notificado, false);
    let alerta = await b.um('select notificado,detalhes from integracao_monitor_privado.alertas');
    assert.equal(alerta.notificado, false); assert.match(alerta.detalhes.erro_notificacao, /nenhum Administrador ativo/);
    assert.equal(await notificacoes(b), 0);

    // Falha real ao inserir a notificação (gatilho que recusa) e ao listar sessões.
    await b.db.exec(`delete from integracao_monitor_privado.alertas; update public.profiles set ativo=true where id='${id(4)}';
     create function public.teste_recusar() returns trigger language plpgsql as $$begin raise exception 'recusa de teste'; end$$;
     create trigger teste_recusar before insert on public.integracao_notificacoes for each row execute function public.teste_recusar();
     create or replace function integracao_monitor_privado.sessoes_suspeitas(antiga_minutos integer, recente_segundos integer) returns jsonb
      language plpgsql stable set search_path='' as $$begin raise exception 'sem permissão de teste'; end$$;`);
    const amostras = await b.contar('integracao_monitor_privado.amostras');
    const falha = await b.passo(...LACO);
    assert.ok(falha.alerta_id); assert.equal(falha.notificado, false);
    alerta = await b.um('select notificado,detalhes from integracao_monitor_privado.alertas');
    assert.equal(alerta.notificado, false);
    assert.match(alerta.detalhes.erro_notificacao, /recusa de teste/); assert.match(alerta.detalhes.erro_sessoes, /sem permissão de teste/);
    assert.equal('notificacao_id' in alerta.detalhes, false);
    assert.equal(await notificacoes(b), 0);
    assert.equal(await b.contar('integracao_monitor_privado.amostras'), amostras + 1);

    // Sessões suspeitas entram no detalhe do alerta, com a consulta já cortada pela função.
    await b.db.exec(`delete from integracao_monitor_privado.alertas; drop trigger teste_recusar on public.integracao_notificacoes;
     create or replace function integracao_monitor_privado.sessoes_suspeitas(antiga_minutos integer, recente_segundos integer) returns jsonb
      language sql stable set search_path='' as $$select jsonb_build_array(jsonb_build_object('pid',123,'antiga',antiga_minutos,'recente',recente_segundos))$$;`);
    assert.equal((await b.passo(...LACO)).notificado, true);
    alerta = await b.um('select notificado,detalhes from integracao_monitor_privado.alertas');
    assert.deepEqual(alerta.detalhes.sessoes_suspeitas, [{pid: 123, antiga: 10, recente: 5}]);
    assert.equal((await b.um('select criado_por from public.integracao_notificacoes')).criado_por, id(4));
  } finally { await b.db.close(); }
});

test('monitor: funções internas reais leem as estatísticas do banco sem expor dados', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role authenticated; create role anon;');
    await db.exec(migration);
    const c = (await db.query('select * from integracao_monitor_privado.ler_contadores()')).rows;
    assert.equal(c.length, 1); assert.deepEqual(Object.keys(c[0]), ['xact_rollback', 'xact_commit']);
    assert.deepEqual((await db.query('select integracao_monitor_privado.sessoes_suspeitas(10,5) s')).rows[0].s, []);
    const corpo = (await db.query("select prosrc from pg_proc where oid='integracao_monitor_privado.sessoes_suspeitas(integer,integer)'::regprocedure")).rows[0].prosrc;
    assert.match(corpo, /usename = 'authenticator'/); assert.match(corpo, /state = 'active'/); assert.match(corpo, /, 120\)/); assert.match(corpo, /limit 10/);
    // A leitura de contadores em produção é só pg_stat_database: sem parâmetro nem modo de teste.
    const leitura = (await db.query("select prosrc,pronargs::int n from pg_proc where oid='integracao_monitor_privado.ler_contadores()'::regprocedure")).rows[0];
    assert.match(leitura.prosrc, /pg_catalog\.pg_stat_database/); assert.equal(leitura.n, 0);
    // A função principal não tem comando capaz de encerrar sessões.
    const verificar = (await db.query("select prosrc,prosecdef,proconfig from pg_proc where oid='integracao_monitor_privado.verificar()'::regprocedure")).rows[0];
    assert.doesNotMatch(migration, /pg_terminate_backend|pg_cancel_backend/i);
    assert.equal(verificar.prosecdef, true); assert.ok(verificar.proconfig.includes('search_path=""'));
    // Sem pg_cron e sem as tabelas do app, a verificação roda (limpeza do cron é ignorada).
    assert.equal((await db.query('select integracao_monitor_privado.verificar() v')).rows[0].v.executado, true);
  } finally { await db.close(); }
});

test('monitor: anon e authenticated não executam nem leem; RLS ligado sem políticas', async () => {
  const b = await montar();
  try {
    await b.verificar();
    for (const papel of ['anon', 'authenticated']) {
      const p = await b.um(`select has_schema_privilege($1,'integracao_monitor_privado','usage') s,
        has_function_privilege($1,'integracao_monitor_privado.verificar()','execute') v,
        has_function_privilege($1,'integracao_monitor_privado.ler_contadores()','execute') l,
        has_function_privilege($1,'integracao_monitor_privado.sessoes_suspeitas(integer,integer)','execute') ss,
        has_table_privilege($1,'integracao_monitor_privado.amostras','select,insert,update,delete') a,
        has_table_privilege($1,'integracao_monitor_privado.alertas','select,insert,update,delete') x,
        has_table_privilege($1,'integracao_monitor_privado.configuracao','select,insert,update,delete') c`, [papel]);
      assert.deepEqual(p, {s: false, v: false, l: false, ss: false, a: false, x: false, c: false}, papel);
      await b.db.exec(`set role ${papel}`);
      await assert.rejects(b.db.query('select integracao_monitor_privado.verificar()'), /permission denied/);
      for (const t of ['amostras', 'alertas', 'configuracao']) await assert.rejects(b.db.query(`select * from integracao_monitor_privado.${t}`), /permission denied/);
      await assert.rejects(b.db.query('update integracao_monitor_privado.configuracao set ativo=false'), /permission denied/);
      await b.db.exec('reset role');
    }
    const tabelas = (await b.db.query(`select c.relname,c.relrowsecurity,(select count(*)::int from pg_policy p where p.polrelid=c.oid) politicas
      from pg_class c where c.relnamespace='integracao_monitor_privado'::regnamespace and c.relkind='r' order by 1`)).rows;
    assert.deepEqual(tabelas, ['alertas', 'amostras', 'configuracao'].map(relname => ({relname, relrowsecurity: true, politicas: 0})));
    // Mesmo com grant indevido de uso e leitura, o RLS sem políticas não devolve linhas.
    await b.db.exec('grant usage on schema integracao_monitor_privado to authenticated; grant select on integracao_monitor_privado.amostras to authenticated; set role authenticated');
    assert.equal((await b.db.query('select * from integracao_monitor_privado.amostras')).rows.length, 0);
    await b.db.exec('reset role');
  } finally { await b.db.close(); }
});

test('monitor: retenção de amostras, alertas e do histórico do próprio job', async () => {
  const b = await montar({cron: true});
  try {
    const job = (await b.um("select jobid from cron.job where jobname='integracao-monitor-lacos'")).jobid;
    await b.db.query(`insert into cron.job(jobname,schedule,command) values('outro-job','0 3 * * *','select 1')`);
    const outro = (await b.um("select jobid from cron.job where jobname='outro-job'")).jobid;
    await b.db.query(`insert into cron.job_run_details(jobid,end_time) values
      ($1,now()-interval '4 days'),($1,now()-interval '2 days'),($2,now()-interval '30 days')`, [job, outro]);
    await b.db.exec(`insert into integracao_monitor_privado.amostras(instante,xact_rollback,xact_commit) values
      (now()-interval '8 days',1,1),(now()-interval '6 days',2,2);
     insert into integracao_monitor_privado.alertas(instante,tipo) values(now()-interval '91 days','laco_repeticao'),(now()-interval '89 days','laco_repeticao');`);
    await b.verificar();
    assert.deepEqual((await b.db.query('select xact_rollback::int r from integracao_monitor_privado.amostras order by instante')).rows.map(x => x.r), [2, 1000]);
    assert.equal(await alertas(b), 1);
    assert.ok((await b.um('select min(instante) m from integracao_monitor_privado.alertas')).m > new Date(Date.now() - 90 * 864e5));
    const execucoes = (await b.db.query('select jobid::int j from cron.job_run_details order by runid')).rows.map(x => x.j);
    assert.deepEqual(execucoes, [Number(job), Number(outro)], 'só a execução antiga deste job é apagada');
  } finally { await b.db.close(); }
});

test('monitor: agendamento idempotente, reaplicação preserva dados e a reversão limpa tudo sem apagar notificações', async () => {
  const b = await montar({cron: true});
  try {
    const jobs = () => b.db.query('select jobname,schedule,command from cron.job order by jobname').then(r => r.rows);
    const esperado = {jobname: 'integracao-monitor-lacos', schedule: '*/2 * * * *', command: 'select integracao_monitor_privado.verificar()'};
    assert.deepEqual(await jobs(), [esperado]);
    // O comando agendado é executável como está.
    await b.db.exec(esperado.command);
    await b.passo(...LACO); await b.passo(...LACO);
    assert.equal(await alertas(b), 1); assert.equal(await notificacoes(b), 1);

    // Reaplicar: um único job, limites ajustados, amostras e alertas preservados.
    await b.db.exec("update integracao_monitor_privado.configuracao set limite_desfeitas_minuto=900; insert into cron.job(jobname,schedule,command) values('outro-job','0 3 * * *','select 1')");
    const amostras = await b.contar('integracao_monitor_privado.amostras');
    await b.db.exec(migration);
    assert.deepEqual(await jobs(), [esperado, {jobname: 'outro-job', schedule: '0 3 * * *', command: 'select 1'}]);
    assert.equal((await b.um('select limite_desfeitas_minuto l from integracao_monitor_privado.configuracao')).l, 900);
    assert.equal(await b.contar('integracao_monitor_privado.amostras'), amostras); assert.equal(await alertas(b), 1);
    // A reaplicação devolve a função real de leitura (a do teste não sobrevive).
    assert.match((await b.um("select prosrc from pg_proc where oid='integracao_monitor_privado.ler_contadores()'::regprocedure")).prosrc, /pg_stat_database/);
    assert.equal((await b.um("select has_function_privilege('authenticated','integracao_monitor_privado.verificar()','execute') p")).p, false);

    // Reversão.
    assert.match(reversao, new RegExp(arquivoMigration.replace('.', '\\.')));
    assert.doesNotMatch(reversao.replace(/^--.*$/gm, ''), /cascade|integracao_notificacoes|delete\s+from|truncate/i);
    await b.db.exec(reversao);
    assert.deepEqual((await jobs()).map(j => j.jobname), ['outro-job']);
    assert.equal((await b.um("select to_regnamespace('integracao_monitor_privado') is null vazio")).vazio, true);
    assert.equal((await b.um("select count(*)::int n from pg_proc where pronamespace::regnamespace::text='integracao_monitor_privado'")).n, 0);
    assert.equal(await notificacoes(b), 1, 'notificações já criadas ficam');
    assert.equal(await b.contar('public.profiles'), 6);
    // Reversão repetida não falha; migration volta a instalar do zero.
    await b.db.exec(reversao);
    await b.db.exec(migration);
    assert.deepEqual((await jobs()).map(j => j.jobname), ['integracao-monitor-lacos', 'outro-job']);
    assert.equal(await b.contar('integracao_monitor_privado.amostras'), 0);
  } finally { await b.db.close(); }
});

test('monitor: sem pg_cron a migration instala tudo e não agenda; a reversão também funciona', async () => {
  const b = await montar();
  try {
    assert.equal((await b.um("select to_regnamespace('cron') is null sem")).sem, true);
    assert.equal((await b.verificar()).executado, true);
    await b.db.exec(reversao);
    assert.equal((await b.um("select to_regnamespace('integracao_monitor_privado') is null vazio")).vazio, true);
  } finally { await b.db.close(); }
});

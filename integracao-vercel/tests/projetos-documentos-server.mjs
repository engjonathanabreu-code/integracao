// Harness local descartável. Não importa configuração, segredos ou clientes remotos.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { criarBancoTermosTeste, autenticarTermoTeste, operarTermoTeste, idsTermos as ids, uuidTermoTeste as uuid } from './termos-banco-fixture.js';
import { instalarPersistenciaProjetos, gravarProjetos } from './projetos-documentos-persistencia.js';

const db = await criarBancoTermosTeste();
const perfis = { Projetos: ids.projetos, Administrador: ids.admin, Financeiro: ids.financeiro, Externo: ids.externo, Inativo: ids.inativo, Topografia: uuid(6), Consulta: uuid(7), 'Outro Projetos': uuid(8) };
await db.exec(`create table auth.users(id uuid primary key);
create schema integracao_crm_privado;
create table integracao_revisoes(modulo text primary key,versao bigint not null default 0);
insert into integracao_revisoes values('clientes',0);
create function integracao_crm_privado.sinalizar_revisao() returns trigger language plpgsql security definer set search_path='' as $$begin update public.integracao_revisoes set versao=versao+1 where modulo=tg_argv[0];return null;end$$;
revoke all on function integracao_crm_privado.sinalizar_revisao() from public,anon,authenticated;
grant select on integracao_revisoes to authenticated;`);
// A fixture de termos não usa diretamente este schema; a de observações já
// concede USAGE como na aplicação. A combinação precisa do mesmo pré-requisito.
await db.exec('grant usage on schema integracao_atribuicoes_privado to authenticated');
for (const [perfil, id] of Object.entries(perfis)) {
  if (['Topografia', 'Consulta', 'Outro Projetos'].includes(perfil)) {
    const tipo = perfil === 'Outro Projetos' ? 'Projetos' : perfil;
    await db.query('insert into profiles values($1,$2,$3,$3,true)', [id, `${perfil} fictício QA`, tipo]);
    await db.query('insert into test_scope values($1,$2)', [id, ids.municipioA]);
  }
}
await db.exec('insert into auth.users select id from profiles');
await db.exec(readFileSync(new URL('../supabase/operacoes/documentos-observacoes-20261106.sql', import.meta.url), 'utf8'));
// Somente dados fictícios deste processo local. Etapa permanece anterior à Topografia.
await autenticarTermoTeste(db, ids.admin);
await db.exec('reset role');
await db.exec(`update processos_kanban set etapa_atual='Mobilização',prioridade='Normal';
update integracao_nucleos set registro_id=referencia_id::text,dados=dados || '{"etapa":0,"nome":"Núcleo fictício QA"}'::jsonb;
update integracao_moradores m set dados=jsonb_set(m.dados,'{nucleoId}',to_jsonb(n.registro_id)) from integracao_nucleos n where m.dados->>'municipioId'=n.dados->>'municipioId';`);
await db.query(`update integracao_moradores set dados=jsonb_set(dados,'{unidades}',(dados->'unidades') || $1::jsonb) where registro_id=$2`, [JSON.stringify([{ id: 'unidade-a-2', area: '222,0100', loteQuadra: 'Q2 L7', endereco: 'Rua Teste 2' }]), ids.processoA]);
await autenticarTermoTeste(db, ids.admin);
for (const [n, municipioId] of [[901, ids.municipioA], [902, ids.municipioB]]) {
  await operarTermoTeste(db, 'salvar_modelo', { pedidoId: uuid(n), municipioId, titulo: 'Modelo fictício QA — sem validade', variante: n === 901 ? 'Social QA' : 'Geral QA', corpo: `DOCUMENTO FICTÍCIO PARA TESTE LOCAL\nMunicípio ${n === 901 ? 'A' : 'B'}: {{municipio.nome}}\nRequerente: {{requerente.nome}}\nUnidade: {{unidade.codigo}} — {{unidade.area}}\n\n{{qualificacao}}`, obrigatorios: ['requerente.nome', 'unidade.area', 'qualificacao'] });
}
await db.exec('reset role');
await instalarPersistenciaProjetos(db);

const tabelasBase = ['profiles','fin_receb_municipios','fin_receb_clientes','processos_kanban','integracao_moradores','integracao_nucleos','integracao_complementos','integracao_auditoria','integracao_revisoes'];
async function base(perfil) {
  await autenticarTermoTeste(db, perfis[perfil]);
  const resultado = {};
  for (const tabela of tabelasBase) resultado[tabela] = (await db.query(`select * from public.${tabela}`)).rows;
  resultado.fin_receb_remessas = [];
  return { perfil, actor: resultado.profiles[0], base: resultado, ids, persistencia: 'PGlite no processo local; conserva dados entre páginas e sessões até encerrar o servidor' };
}
async function rpc(nome, p) {
  if (nome === 'integracao_gravar') return gravarProjetos(db, p.operacoes, p.pedido);
  if (nome === 'integracao_oficio_reservar_numero') return (await db.query('select public.integracao_oficio_reservar_numero($1,$2,$3) resultado', [p.p_pedido,p.p_ano,p.p_inicial ?? null])).rows[0].resultado;
  if (nome === 'integracao_documentos_observacoes_operar') return (await db.query('select public.integracao_documentos_observacoes_operar($1,$2,$3::jsonb) resultado', [p.p_acao, p.p_processo_id, JSON.stringify(p.p_dados || {})])).rows[0].resultado;
  if (nome === 'integracao_termos_operar') return operarTermoTeste(db, p.p_acao, p.p_dados || {});
  if (nome === 'integracao_qualificacoes_nucleo') return (await db.query('select public.integracao_qualificacoes_nucleo($1,$2,$3::text[],$4,$5) resultado', [p.p_nucleo, p.p_busca || '', p.p_ids ?? null, p.p_inicio ?? 0, p.p_limite ?? 30])).rows[0].resultado;
  throw Object.assign(Error('RPC não disponível no harness isolado'), { code: '42501' });
}
let fila = Promise.resolve();
const servidor = http.createServer((req, res) => {
  const origem = req.headers.origin;
  if (origem && !/^http:\/\/(127\.0\.0\.1|localhost):4178$/.test(origem)) { res.writeHead(403); res.end(); return; }
  res.setHeader('Access-Control-Allow-Origin', origem || 'http://127.0.0.1:4178');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-qa-perfil');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let texto = '';
  req.on('data', chunk => { texto += chunk; if (texto.length > 12 * 1_048_576) req.destroy(); });
  req.on('end', () => {
    const trabalho = fila.then(async () => {
      const url = new URL(req.url, 'http://127.0.0.1:4179');
      const perfil = req.headers['x-qa-perfil'] || url.searchParams.get('perfil') || 'Projetos';
      if (!Object.hasOwn(perfis, perfil)) throw Object.assign(Error('Perfil de teste inválido'), { code: '42501' });
      if (url.pathname === '/qa/status') return { isolado: true, banco: 'PGlite', perfis: Object.keys(perfis), ids };
      if (url.pathname === '/qa/base' && req.method === 'GET') return base(perfil);
      if (url.pathname.startsWith('/qa/rpc/') && req.method === 'POST') {
        await autenticarTermoTeste(db, perfis[perfil]);
        return rpc(url.pathname.slice('/qa/rpc/'.length), JSON.parse(texto || '{}'));
      }
      throw Object.assign(Error('Rota local não encontrada'), { code: '404' });
    });
    fila = trabalho.catch(() => {});
    trabalho.then(valor => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(valor)); }, erro => { res.writeHead(erro.code === '42501' ? 403 : erro.code === '404' ? 404 : 409, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ message: erro.message, code: erro.code || 'QA_ERROR' })); });
  });
});
if (process.argv.includes('--selftest')) {
  try {
    console.log('BASE', (await base('Projetos')).actor.tipo);
    console.log('OBS', JSON.stringify(await rpc('integracao_documentos_observacoes_operar', { p_acao: 'listar', p_processo_id: ids.processoA })));
    console.log('QUALIFICACOES', JSON.stringify(await rpc('integracao_qualificacoes_nucleo', { p_nucleo: ids.nucleoA })));
    console.log('TERMOS', JSON.stringify(await rpc('integracao_termos_operar', { p_acao: 'listar_modelos', p_dados: { municipioId: ids.municipioA } })));
    const salvo = await rpc('integracao_documentos_observacoes_operar', { p_acao: 'salvar', p_processo_id: ids.processoA, p_dados: { id: uuid(990), versao: 0, conteudo: { version: 1, blocks: [{ id: 'linha1', type: 'check', checked: true, runs: [{ text: 'Observação fictícia de verificação', bold: true }] }] } } });
    console.log('OBS_SALVA', salvo.id, salvo.versao);
    await base('Administrador');
    console.log('SEGUNDA_SESSAO', JSON.stringify(await rpc('integracao_documentos_observacoes_operar', { p_acao: 'listar', p_processo_id: ids.processoA })));
    await db.close();
  } catch (e) { console.error(e.message, e.code); await db.close(); process.exitCode = 1; }
} else servidor.listen(4179, '127.0.0.1', () => console.log('QA isolado pronto: http://127.0.0.1:4178/tests/projetos-documentos.html — backend PGlite 127.0.0.1:4179'));
process.on('SIGINT', () => servidor.close(() => db.close().then(() => process.exit(0))));

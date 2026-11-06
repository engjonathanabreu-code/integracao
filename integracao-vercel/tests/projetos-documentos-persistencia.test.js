import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarBancoTermosTeste, autenticarTermoTeste as login, idsTermos as ids, uuidTermoTeste as uuid } from './termos-banco-fixture.js';
import { instalarPersistenciaProjetos, gravarProjetos } from './projetos-documentos-persistencia.js';
import { fixture, blank } from './fixture.js';
import { projetar, prepararEdicao } from '../src/dados-compartilhados.js';

test('harness usa RPC PostgreSQL real: geometrias/memorial/unidade reabrem em outra sessão, com CAS e RLS', async t => {
  const db = await criarBancoTermosTeste();
  try {
    await db.exec(`create schema integracao_crm_privado;create table integracao_revisoes(modulo text primary key,versao bigint default 0);insert into integracao_revisoes values('clientes',0);
      create function integracao_crm_privado.sinalizar_revisao() returns trigger language plpgsql security definer set search_path='' as $$begin update public.integracao_revisoes set versao=versao+1 where modulo=tg_argv[0];return null;end$$;
      grant usage on schema integracao_atribuicoes_privado to authenticated;
      insert into profiles values('${uuid(6)}','Topografia QA','Topografia','Topografia',true),('${uuid(7)}','Consulta QA','Consulta','Consulta',true);
      insert into test_scope values('${uuid(6)}','${ids.municipioA}'),('${uuid(7)}','${ids.municipioA}');
      update integracao_nucleos set dados=dados||'{"etapa":0}'::jsonb;`);
    await db.query(`update integracao_moradores set dados=jsonb_set(dados,'{unidades}',dados->'unidades'||$1::jsonb) where registro_id=$2`, [JSON.stringify([{id:'unidade-a-2',area:'91,0000',loteQuadra:'Q9 L9'}]),ids.processoA]);
    await instalarPersistenciaProjetos(db);
    const ler = async (tabela, registro) => (await db.query(`select dados from ${tabela} where registro_id=$1`, [registro])).rows[0]?.dados;
    const editar = (tabela, registro, anterior, depois, pedido) => gravarProjetos(db, [{table:tabela,key:{colecao:tabela==='integracao_nucleos'?'nucleos':'processos',registro_id:registro},expected:{dados:anterior},changes:{dados:depois}}], pedido);
    const geojson = JSON.parse(readFileSync(new URL('./fixtures/projetos-nucleo.geojson',import.meta.url),'utf8'));
    await login(db,ids.projetos);
    await t.test('mapa e memorial são gravados antes da Topografia e relidos por outra identidade', async () => {
      const antes=await ler('integracao_nucleos','nucleo_a');
      await editar('integracao_nucleos','nucleo_a',antes,{...antes,geo:{geojson},memorial:{texto:'Memorial fictício persistido',responsavel:'Responsável QA'}});
      await login(db,uuid(6));
      const depois=await ler('integracao_nucleos','nucleo_a');
      assert.deepEqual(depois.geo.geojson,geojson);assert.equal(depois.memorial.texto,'Memorial fictício persistido');assert.equal(depois.etapa,0);
      await login(db,ids.projetos);
    });
    await t.test('planejamento real do App altera só a unidade escolhida e reabre em dispositivo vazio', async () => {
      const base = Object.fromEntries(Object.keys(fixture()).map(k=>[k,[]]));
      for(const tabela of ['profiles','fin_receb_municipios','fin_receb_clientes','processos_kanban','integracao_moradores','integracao_nucleos','integracao_complementos','integracao_auditoria'])base[tabela]=(await db.query(`select * from ${tabela}`)).rows;
      const state=projetar(base,blank()),next=structuredClone(state.db),actor=next.usuarios[0];
      const p=next.processos.find(p=>p.id===ids.processoA);assert.ok(p,'Identidade do cadastro preservada');
      const intacta=structuredClone(p.unidades[1]);p.unidades[0].area='125,0050';p.unidades[0].loteQuadra='Q2 L4';
      next.auditoria=[{id:uuid(801),usuarioId:actor.id,acao:'Unidade editada QA'}];
      const ops=prepararEdicao(state.db,next,state,actor);await gravarProjetos(db,ops,uuid(802));
      await login(db,ids.admin);
      for(const tabela of ['profiles','fin_receb_clientes','integracao_moradores','integracao_nucleos','integracao_auditoria'])base[tabela]=(await db.query(`select * from ${tabela}`)).rows;
      const reaberto=projetar(base,blank()).db.processos.find(p=>p.id===ids.processoA);
      assert.equal(reaberto.unidades[0].area,'125,0050');assert.equal(reaberto.unidades[0].loteQuadra,'Q2 L4');assert.deepEqual(reaberto.unidades[1],intacta);
      assert.equal(reaberto.codigo,'TESTE-A');assert.equal(reaberto.etapa,0);
      await login(db,ids.projetos);
    });
    await t.test('idempotência e conflito real mantêm o texto já persistido', async () => {
      const antes=await ler('integracao_nucleos','nucleo_a'),depois={...antes,memorial:{texto:'Edição primeira'}};
      await editar('integracao_nucleos','nucleo_a',antes,depois,uuid(810));
      await editar('integracao_nucleos','nucleo_a',antes,depois,uuid(810));
      await assert.rejects(editar('integracao_nucleos','nucleo_a',antes,{...antes,memorial:{texto:'Edição concorrente'}},uuid(811)),e=>e.code==='PT409');
      assert.equal((await ler('integracao_nucleos','nucleo_a')).memorial.texto,'Edição primeira');
    });
    await t.test('API nega Consulta, outro município, sessão inativa, geometria inválida e avanço de etapa', async () => {
      const antes=await ler('integracao_nucleos','nucleo_a');
      await login(db,uuid(7));await assert.rejects(editar('integracao_nucleos','nucleo_a',antes,{...antes,memorial:{texto:'Proibido'}}),/permissão/);
      await login(db,ids.externo);assert.equal(await ler('integracao_nucleos','nucleo_a'),undefined);await assert.rejects(editar('integracao_nucleos','nucleo_a',antes,{...antes,memorial:{texto:'Proibido'}}),/permissão/);
      await login(db,ids.inativo);await assert.rejects(editar('integracao_nucleos','nucleo_a',antes,{...antes,memorial:{texto:'Proibido'}}),/Sessão/);
      await login(db,ids.projetos);await assert.rejects(editar('integracao_nucleos','nucleo_a',antes,{...antes,geo:{geojson:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-49,-27]}}]}}}),/Polygon/);
      await assert.rejects(editar('integracao_nucleos','nucleo_a',antes,{...antes,etapa:1}),/Fluxo setorial/);
      assert.deepEqual(await ler('integracao_nucleos','nucleo_a'),antes);
    });
  } finally { await db.close(); }
});

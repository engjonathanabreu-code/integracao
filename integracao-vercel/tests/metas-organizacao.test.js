import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparMetas, agruparOrdens, corSetor } from '../src/metas-organizacao.js';
import { podeUsarAgentes } from '../src/permissoes.js';
import { prazosDoCalendario } from '../src/calendario-prazos.js';
import { projetar, complementos } from '../src/dados-compartilhados.js';
import { fixture, id } from './fixture.js';
import { catalogoDevolutivas } from '../src/devolutivas-catalogo.js';

test('espelhamento conserva originais, reúne vínculos e aceita visão restrita do técnico', () => {
  const original={id:'orig',devolutiva:{analiseIA:{etapa1:{resumo:'Corrigir área'}}},arquivos:[{chave:'arquivo-original'}]};
  const vinculada={id:'meta',devolutiva:{registroId:'orig',analiseIA:structuredClone(original.devolutiva.analiseIA)}};
  const antes=structuredClone([original,vinculada]);
  const catalogo=catalogoDevolutivas([vinculada,original]);
  assert.equal(catalogo.length,1);assert.equal(catalogo[0].meta,original);assert.equal(catalogo[0].vinculadas.length,2);
  assert.equal(catalogoDevolutivas([vinculada])[0].meta,vinculada);
  assert.deepEqual([original,vinculada],antes);
});

test('metas aparecem por setor e cada responsável, sem modificar a origem', () => {
  const metas = [{id:'a',setor:'Topografia',responsaveis:['2','1','1'],prazo:'2026-09-30'}, {id:'b',setor:'Jurídico',responsaveis:[]}, {id:'c',setor:'Topografia',responsaveis:['1'],prazo:'2026-09-27'}];
  const antes = structuredClone(metas);
  const grupos = agruparMetas(metas,[{id:'1',nome:'Ana'},{id:'2',nome:'Zeca'}]);
  assert.deepEqual(grupos.map(g=>g.nome),['Jurídico','Topografia']);
  assert.equal(grupos[0].pessoas[0].nome,'Sem responsável');
  assert.deepEqual(grupos[1].pessoas[0].metas.map(m=>m.id),['c','a']);
  assert.deepEqual(grupos[1].pessoas[1].metas.map(m=>m.id),['a']);
  assert.deepEqual(metas,antes);
});
test('ordens agrupam município/UF e ordenam nome numericamente', () => {
  const g=agruparOrdens([{id:'1',municipio:'Z',nome:'OS 1'}, {id:'2',municipio:'Água',estado:'SC',nome:'OS 10'}, {id:'3',municipio:'água',estado:'SC',nome:'OS 2'}]);
  assert.equal(g.length,2);assert.deepEqual(g[0].ordens.map(o=>o.id),['3','2']);
});
test('a cor editada persiste no complemento sem substituir a coluna canônica', () => {
  const base=fixture();const state=projetar(base,{});const after=structuredClone(state.db);
  after.setoresMeta[0].cor='#123456';
  const writes=complementos(state.db,after,state,{id:id(1)});
  const op=writes.find(w=>w.key?.colecao==='setoresMeta');
  const row=op && {...op.key,...op.changes};
  assert.ok(row);assert.equal(row.dados.cor,'#123456');
  base.integracao_complementos.push(row);
  assert.equal(projetar(base,{}).db.setoresMeta[0].cor,'#123456');
});
test('calendário usa cor por setor e remove concluídas sem alterar prazo', () => {
  const metas=[{id:'1',titulo:'Teste',setor:'Projeto',status:'Em andamento',semana_inicio:'2026-09-20',prazo:'2026-09-24'}, {id:'2',setor:'Projeto',status:'Concluído',prazo:'2026-09-24'}];
  const db={metas,setoresMeta:[{nome:'Projeto',cor:'#123456'}]};
  const itens=prazosDoCalendario(db,{hoje:'2026-09-26'});
  assert.equal(itens.length,1);assert.equal(itens[0].cor,'#123456');assert.equal(itens[0].fim,'2026-09-26');assert.equal(metas[0].prazo,'2026-09-24');
  assert.notEqual(corSetor('Projeto'),corSetor('Topografia'));
});
test('agentes recusam inativo e função local forjada sobre perfil ERP', () => {
  assert.equal(podeUsarAgentes({tipoERP:'Diretor de Projetos',ativo:true}),true);
  assert.equal(podeUsarAgentes({tipoERP:'Topografia',funcao:'Diretor',setor:'diretoria'}),false);
  assert.equal(podeUsarAgentes({tipoERP:'Administrador',ativo:false}),false);
  assert.equal(podeUsarAgentes({funcao:'Analista',setor:'diretoria'}),false);
  assert.equal(podeUsarAgentes({funcao:'Diretor',ativo:true}),true);
});
import { setoresUnicos } from '../src/metas-organizacao.js';

test('setores repetidos aparecem uma vez sem remover IDs ou metas de origem', () => {
 const setores=[{id:'a',nome:'Topografia',ativo:false},{id:'b',nome:'Topografia',ativo:true},{id:'c',nome:'Projetos',ativo:true},{id:'d',nome:'Projetos',ativo:true}];
 const metas=[{id:'m1',setor_id:'a'},{id:'m2',setor_id:'b'},{id:'m3',setor_id:'d'}];
 const antes=JSON.stringify({setores,metas});
 assert.deepEqual(setoresUnicos(setores).map(s=>s.id),['b','c']);
 assert.equal(JSON.stringify({setores,metas}),antes);
 assert.equal(setoresUnicos([]).length,0);
});

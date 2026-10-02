import test from 'node:test';
import assert from 'node:assert/strict';
import {ETAPAS_PROCESSO,etapaProcesso,etapaDoAndamento} from '../src/processo-etapas.js';
test('andamento usa a mesma etapa do Kanban pelo identificador compartilhado',()=>{
 for(const etapaProcessoAtual of [...ETAPAS_PROCESSO,'Etapa importada']){
  const n={id:'local',externo:{kanbanId:'canonical'},etapa:0,etapaProcesso:etapaProcessoAtual};
  assert.equal(etapaDoAndamento([n],'canonical'),etapaProcesso(n));
  assert.equal(etapaDoAndamento([n],'canonical'),etapaProcessoAtual);
 }
});
test('troca de núcleo não conserva a etapa do núcleo anterior',()=>{
 const ns=[{id:'a',etapaProcesso:'Topografia'},{id:'b',etapaProcesso:'Protocolo'}];
 assert.equal(etapaDoAndamento(ns,'a'),'Topografia');
 assert.equal(etapaDoAndamento(ns,'b'),'Protocolo');
 assert.equal(etapaDoAndamento(ns,''),'');
 assert.equal(etapaDoAndamento(ns,'ausente'),'');
});
test('núcleo legado mantém a regra de etapa já usada pelo Kanban',()=>{
 const n={id:'legado',etapa:1};
 assert.equal(etapaDoAndamento([n],n.id),'Topografia');
});
test('status do andamento começa na etapa atual e permite escolher outra etapa',async()=>{
 const {opcoesStatusAndamento,ETAPAS_PREFEITURA}=await import('../src/processos-protocolados.js');
 const opcoes=opcoesStatusAndamento('Protocolo');
 assert.equal(opcoes[0],'Protocolo');
 for(const etapa of [...ETAPAS_PROCESSO,...ETAPAS_PREFEITURA])assert.ok(opcoes.includes(etapa),etapa);
 assert.equal(new Set(opcoes).size,opcoes.length);
 assert.equal(opcoesStatusAndamento('Etapa importada')[0],'Etapa importada');
 assert.deepEqual(opcoesStatusAndamento(''),opcoesStatusAndamento(undefined));
});

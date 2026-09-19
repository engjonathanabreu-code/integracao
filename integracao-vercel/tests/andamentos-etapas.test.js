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

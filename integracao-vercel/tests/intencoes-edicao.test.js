import test from 'node:test';import assert from 'node:assert/strict';
import {extrairIntencao,aplicarIntencao,recursosIntencao} from '../src/intencoes-edicao.js';
test('intenção altera somente seus campos e preserva alterações independentes',()=>{
 const a={metas:[{id:'m',titulo:'base',nota:'base'}]},b={metas:[{id:'m',titulo:'local',nota:'base'}]};
 const e=extrairIntencao(a,b),r=aplicarIntencao({metas:[{id:'m',titulo:'base',nota:'remota'},{id:'outro'}]},e);
 assert.equal(r.conflitos.length,0);assert.equal(r.dados.metas.find(x=>x.id==='m').nota,'remota');assert.equal(r.dados.metas.length,2);assert.deepEqual(recursosIntencao(e),['["metas","m"]']);
});
test('registro canônico ausente exige revisão e não vira nova criação',()=>{
 const a={metas:[{id:'m',titulo:'base'}]},b={metas:[{id:'m',titulo:'local'}]},r=aplicarIntencao({metas:[]},extrairIntencao(a,b));assert.equal(r.conflitos.length,1);
});
test('escolha seletiva preserva valor remoto e não altera outro campo',()=>{
 const a={metas:[{id:'m',titulo:'base',valor:100}]},b={metas:[{id:'m',titulo:'local',valor:200}]},remote={metas:[{id:'m',titulo:'remoto',valor:100}]};
 const e=extrairIntencao(a,b),r=aplicarIntencao(remote,e,{escolhas:{'["metas","m","titulo"]':'remoto'}});assert.equal(r.conflitos.length,0);assert.equal(r.dados.metas[0].titulo,'remoto');assert.equal(r.dados.metas[0].valor,200);
});
test('aliases mantêm o texto livre que coincide com um ID',()=>{const e=extrairIntencao({metas:[]},{metas:[{id:'local',titulo:'local'}]});const r=aplicarIntencao({metas:[]},e,{aliases:{local:'canonico'}});assert.deepEqual(r.dados.metas,[{id:'canonico',titulo:'local'}]);});

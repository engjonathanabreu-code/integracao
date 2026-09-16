import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularMemorialNucleo, salvarMemorialNucleo } from '../memoriais/memorialNucleo.js';
const vertices=[{nome:'V1',e:0,n:0},{nome:'V2',e:10,n:0},{nome:'V3',e:10,n:10},{nome:'V4',e:0,n:10}];
const dados=()=>({...calcularMemorialNucleo(vertices,{meridiano:'51°'}),nome:'Rua A'});
test('núcleo calcula área, perímetro e memorial pelos mesmos cálculos dos lotes',()=>{
 const d=dados();assert.equal(d.area,100);assert.equal(d.perimetro,40);assert.match(d.texto,/V1/);
});
test('salvar núcleo preserva vias e dados próprios e alimenta texto do PRF',()=>{
 const db={nucleos:[{id:'n',extra:1,memorial:{texto:'legado',vias:[{id:'v',nome:'Rua antiga',extra:2}],outro:3}}]};
 const antes=structuredClone(db.nucleos[0].memorial);salvarMemorialNucleo(db,'n',antes,dados(),null,'Técnico');
 assert.equal(db.nucleos[0].extra,1);assert.equal(db.nucleos[0].memorial.outro,3);assert.equal(db.nucleos[0].memorial.vias[0].extra,2);assert.match(db.nucleos[0].memorial.texto,/V1/);
});
test('vias ficam independentes e salvamento não sobrescreve outra revisão',()=>{
 const db={nucleos:[{id:'n',memorial:{texto:'núcleo'}}]};
 salvarMemorialNucleo(db,'n',null,dados(),'a','Técnico');
 salvarMemorialNucleo(db,'n',null,{...dados(),nome:'Rua B'},'b','Técnico');
 const antes=structuredClone(db.nucleos[0].memorial.vias[0]);db.nucleos[0].memorial.vias[0].texto='Revisão';
 assert.throws(()=>salvarMemorialNucleo(db,'n',antes,dados(),'a','Técnico'),/alterado/);
 assert.equal(db.nucleos[0].memorial.texto,'núcleo');assert.equal(db.nucleos[0].memorial.vias[1].nome,'Rua B');
});
test('contorno vazio e área degenerada não geram memorial',()=>{
 assert.throws(()=>calcularMemorialNucleo([],{}));
 assert.throws(()=>calcularMemorialNucleo([{nome:'1',e:0,n:0},{nome:'2',e:1,n:0},{nome:'3',e:2,n:0}],{}),/área válida/);
});

import { fixture, blank } from './fixture.js';
import { copy, projetar, prepararEdicao } from '../src/dados-compartilhados.js';
test('núcleo e vias persistem somente em integracao_nucleos e reaparecem em outra carga',()=>{
 const state=projetar(fixture(),blank()),db=copy(state.db),id=db.nucleos[0].id;
 salvarMemorialNucleo(db,id,db.nucleos[0].memorial,dados(),null,'Técnico');
 salvarMemorialNucleo(db,id,null,dados(),'via-teste','Técnico');
 const ops=prepararEdicao(state.db,db,state,db.usuarios[0]);
 assert.ok(ops.length);assert.ok(ops.every(o=>o.table==='integracao_nucleos'));
 const base=copy(state.base);for(const op of ops)base[op.table].push({...op.key,...op.changes});
 const carregado=projetar(base,blank()).db.nucleos.find(n=>n.id===id);
 assert.equal(carregado.memorial.area,100);assert.equal(carregado.memorial.vias[0].nome,'Rua A');
});

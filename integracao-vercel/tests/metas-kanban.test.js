import test from 'node:test';import assert from 'node:assert/strict';
import {SEM_SETOR_META,metaNoSetor,colunaMetasAtivas,colunasMetasAtivas} from '../src/metas-kanban.js';
const ana={id:'a',erpRef:'ea'},bia={id:'b'},caio={id:'c'};
const metas=[
 {id:1,setor:'Projetos',status:'Em andamento',responsaveis:['ea'],ordemColuna:1},
 {id:2,setor:'Topografia',status:'Em andamento',responsaveis:['a'],ordemColuna:0},
 {id:3,setor:'Projetos',status:'Concluído',responsaveis:['b']},
 {id:4,setor:'',status:'Aguardando aprovação',responsaveis:['b'],prazo:'2026-10-01'},
 {id:5,setor:'Projetos',status:'Em andamento',responsaveis:['b','a'],prazo:'2026-09-01'},
];
test('filtro de setor mantém as metas do setor e aceita metas sem setor',()=>{
 assert.deepEqual(metas.filter(m=>metaNoSetor(m,'Projetos')).map(m=>m.id),[1,3,5]);
 assert.deepEqual(metas.filter(m=>metaNoSetor(m,SEM_SETOR_META)).map(m=>m.id),[4]);
 assert.equal(metas.filter(m=>metaNoSetor(m,'')).length,5);
});
test('quadro mostra só quem tem metas ativas no filtro, na ordem da coluna',()=>{
 const projetos=metas.filter(m=>metaNoSetor(m,'Projetos'));
 assert.deepEqual(colunasMetasAtivas([ana,bia,caio],projetos).map(c=>[c.usuario.id,c.metas.map(m=>m.id)]),[['a',[1,5]],['b',[5]]]);
 assert.deepEqual(colunaMetasAtivas(metas,ana).map(m=>m.id),[2,1,5]);
 assert.equal(colunasMetasAtivas([ana,bia,caio],projetos,true).length,3);
 assert.deepEqual(colunasMetasAtivas([caio],projetos),[]);
});

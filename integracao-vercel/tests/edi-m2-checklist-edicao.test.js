import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mesclarChecklistEditado} from '../src/metas-checklist.js';
import {projetar,prepararEdicao,copy} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';

const form=lista=>lista.map(c=>({id:c.id,titulo:c.titulo,concluido:!!c.concluido}));
const aberto=[{id:'a',titulo:'Primeiro',concluido:false},{id:'b',titulo:'Segundo',concluido:false},{id:'c',titulo:'Terceiro',concluido:true,concluido_por:'Colega',concluido_em:'2026-11-20T12:00:00.000Z'}];

test('EDI-M2: renomear um item não desfaz a conclusão nem o item novo do colega',()=>{
 const inicial=form(aberto);
 // Enquanto o formulário estava aberto, o colega concluiu "a" e adicionou "d".
 const atual=[{...aberto[0],concluido:true,concluido_por:'Colega',concluido_em:'2026-11-25T10:00:00.000Z'},aberto[1],aberto[2],{id:'d',titulo:'Do colega',concluido:false}];
 const final=inicial.map(x=>x.id==='b'?{...x,titulo:'  Segundo revisado '}:x);
 const r=mesclarChecklistEditado(atual,inicial,final,()=>'novo');
 assert.deepEqual(r.checklist,[atual[0],{...aberto[1],titulo:'Segundo revisado'},atual[2],atual[3]]);
 assert.deepEqual(r.adicionados,[]);assert.deepEqual(r.removidos,[]);
 assert.equal(atual[1].titulo,'Segundo','a lista atual não é alterada no lugar');
});

test('EDI-M2: adiciona, remove e marca somente o que o formulário mudou',()=>{
 const inicial=form(aberto),atual=[...aberto,{id:'d',titulo:'Do colega',concluido:true}];
 const final=[{...inicial[0],concluido:true},inicial[2],{id:'n1',titulo:'Novo com id',concluido:false},{titulo:' Novo sem id ',concluido:true},{id:'vazio',titulo:'   ',concluido:false}];
 const r=mesclarChecklistEditado(atual,inicial,final,()=>'gerado');
 assert.deepEqual(r.checklist.map(c=>[c.id,c.titulo,c.concluido]),[['a','Primeiro',true],['c','Terceiro',true],['d','Do colega',true],['n1','Novo com id',false],['gerado','Novo sem id',true]]);
 assert.equal(r.checklist[1].concluido_por,'Colega','metadados de conclusão do item intocado ficam como estão');
 assert.deepEqual(r.removidos.map(c=>c.id),['b']);assert.deepEqual(r.adicionados.map(c=>c.id),['n1','gerado']);
});

test('EDI-M2: item removido pelo colega não é recriado; reaplicar a mesma edição não duplica',()=>{
 const inicial=form(aberto),final=[...inicial.map(x=>x.id==='a'?{...x,titulo:'Primeiro editado'}:x),{id:'n1',titulo:'Novo',concluido:false}];
 const semA=aberto.filter(c=>c.id!=='a');
 const r=mesclarChecklistEditado(semA,inicial,final);
 assert.deepEqual(r.checklist.map(c=>c.id),['b','c','n1']);
 const de_novo=mesclarChecklistEditado(r.checklist,inicial,final);
 assert.deepEqual(de_novo.checklist,r.checklist);assert.deepEqual(de_novo.adicionados,[]);
 assert.deepEqual(mesclarChecklistEditado(undefined,[],[{id:'x',titulo:'Único'}]).checklist,[{id:'x',titulo:'Único',concluido:false}]);
});

test('EDI-M2: a fila recebe só a alteração do item editado (formato das operações inalterado)',()=>{
 const b=fixture();
 b.meta_checklist=[20,21].map(n=>({id:id(n),meta_id:id(7),titulo:'Item '+n,concluido:false,concluido_por:null,concluido_em:null,created_by:id(1)}));
 const aberta=projetar(b,blank()).db.metas[0].checklist;
 // Base já atualizada com a conclusão feita pelo colega no item 20 e um item novo (22).
 const atualizado=copy(b);Object.assign(atualizado.meta_checklist[0],{concluido:true,concluido_por:id(1),concluido_em:'2026-11-25T10:00:00+00:00'});
 atualizado.meta_checklist.push({id:id(22),meta_id:id(7),titulo:'Item do colega',concluido:false,concluido_por:null,concluido_em:null,created_by:id(1)});
 const state=projetar(atualizado,blank()),novo=copy(state.db),meta=novo.metas[0];
 const inicial=form(aberta),final=inicial.map(x=>x.id===id(21)?{...x,titulo:'Item 21 revisado'}:x);
 // Comportamento anterior (regravar a cópia aberta) desfaria a conclusão e removeria o item do colega.
 const regravado=copy(state.db);regravado.metas[0].checklist=final.map(x=>({...state.db.metas[0].checklist.find(c=>c.id===x.id),titulo:x.titulo,concluido:x.concluido}));
 const antigas=prepararEdicao(state.db,regravado,state,state.db.usuarios[0]).filter(o=>o.table==='meta_checklist');
 assert.ok(antigas.some(o=>o.remove&&o.key.id===id(22))&&antigas.some(o=>o.key.id===id(20)&&o.changes?.concluido===false),'o teste reproduz o defeito original');
 meta.checklist=mesclarChecklistEditado(meta.checklist,inicial,final).checklist;
 const ops=prepararEdicao(state.db,novo,state,state.db.usuarios[0]).filter(o=>o.table==='meta_checklist');
 assert.deepEqual(ops,[{table:'meta_checklist',key:{id:id(21)},expected:{titulo:'Item 21'},changes:{titulo:'Item 21 revisado'}}]);
});

test('EDI-M2: o formulário da meta usa a mescla e não regrava a lista inteira',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/mesclarChecklistEditado\(antesChecklist, fi\.checklistItens, itens/);
 assert.doesNotMatch(app,/q\.checklist = itens\.map\(/);
});

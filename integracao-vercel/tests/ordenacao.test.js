import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarLinhas, compararTextos } from '../src/ordenacao.js';
test('números e vazios ordenam corretamente nos dois sentidos sem mutação',()=>{
 const lista=[10,null,9,0,undefined,'',NaN];const antes=[...lista];
 assert.deepEqual(ordenarLinhas(lista,x=>x),[0,9,10,null,undefined,'',NaN]);
 assert.deepEqual(ordenarLinhas(lista,x=>x,'desc'),[10,9,0,null,undefined,'',NaN]);
 assert.deepEqual(lista,antes);
});
test('texto ignora acento e caixa e mantém empates estáveis',()=>{
 const lista=['Água','agua','Zebra','abacate',' '];
 assert.deepEqual(ordenarLinhas(lista,x=>x),['abacate','Água','agua','Zebra',' ']);
 assert.deepEqual(ordenarLinhas(lista,x=>x,'desc'),['Zebra','Água','agua','abacate',' ']);
});

test('nomes e códigos incompletos não derrubam listas nem alteram os registros',()=>{
 const rows=[{id:1,codigo:'A10'},{id:2},{id:3,codigo:null},{id:4,codigo:2},{id:5,codigo:'A2'}];
 const before=structuredClone(rows);
 assert.deepEqual([...rows].sort((a,b)=>compararTextos(a.codigo,b.codigo)).map(x=>x.id),[4,5,1,2,3]);
 assert.deepEqual(rows,before);
 assert.equal(compararTextos(undefined,null),0);assert.equal(compararTextos('Água','agua'),0);
});

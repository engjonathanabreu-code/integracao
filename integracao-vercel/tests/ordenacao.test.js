import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarLinhas } from '../src/ordenacao.js';
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

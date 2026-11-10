import test from 'node:test';
import assert from 'node:assert/strict';
import {checksumIntencao,abrirFilaIntencoes} from '../src/fila-intencoes.js';
test('checksum de intenção ignora ordem de chaves mas preserva listas e ausência',async()=>{
 assert.equal(await checksumIntencao({a:1,b:2}),await checksumIntencao({b:2,a:1}));
 assert.notEqual(await checksumIntencao({a:[1,2]}),await checksumIntencao({a:[2,1]}));
 assert.notEqual(await checksumIntencao({a:null}),await checksumIntencao({}));
});
test('diário não trata memória volátil como persistência quando IndexedDB falta',async()=>{
 const fila=abrirFilaIntencoes({indexedDB:null});await assert.rejects(fila.listar('fixture'),{code:'PERSISTENCIA_INDISPONIVEL'});
});
test('conteúdo não serializável é recusado antes de abrir o banco',async()=>{
 let abriu=false;const fila=abrirFilaIntencoes({indexedDB:{open(){abriu=true;throw Error('não deve abrir');}}});
 await assert.rejects(fila.enfileirar({conta:'fixture',unidade:'fixture',modulo:'fixture',operacoes:[{valor:Infinity}],base:{},intencao:{}}),{code:'INTENCAO_INVALIDA'});assert.equal(abriu,false);
});

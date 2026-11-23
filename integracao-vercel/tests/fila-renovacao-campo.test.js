import test from 'node:test';
import assert from 'node:assert/strict';
import {abrirFilaIntencoes} from '../src/fila-intencoes.js';

test('folga usa o relógio injetado da fila e a fronteira de um terço do lease',t=>{
 let tempo=1000;const fila=abrirFilaIntencoes({indexedDB:null,agora:()=>tempo});
 t.mock.method(Date,'now',()=>9999999999999);
 const item={leaseAte:61000},o={leaseMs:60000,ultimoAgora:1000};
 assert.deepEqual(fila.observarPrazoReserva(item,o),{agora:1000,comFolga:true});
 tempo=40999;assert.equal(fila.observarPrazoReserva(item,o).comFolga,true);
 tempo=41000;assert.equal(fila.observarPrazoReserva(item,o).comFolga,false);
 tempo=61000;assert.equal(fila.observarPrazoReserva(item,o).comFolga,false);
 tempo=62000;assert.equal(fila.observarPrazoReserva(item,o).comFolga,false);
});
test('prazo desconhecido ou relógio regressivo nunca autoriza omitir renovação',()=>{
 let tempo=1005;const fila=abrirFilaIntencoes({indexedDB:null,agora:()=>tempo}),item={leaseAte:61000};
 assert.equal(fila.observarPrazoReserva(item,{leaseMs:60000,ultimoAgora:1010}).comFolga,false);
 assert.equal(fila.observarPrazoReserva(item,{leaseMs:60000}).comFolga,false);
 assert.equal(fila.observarPrazoReserva(null,{leaseMs:60000,ultimoAgora:1000}).comFolga,false);
 assert.equal(fila.observarPrazoReserva({leaseAte:Infinity},{leaseMs:60000,ultimoAgora:1000}).comFolga,false);
 tempo=NaN;assert.equal(fila.observarPrazoReserva(item,{leaseMs:60000,ultimoAgora:1000}).comFolga,false);
});

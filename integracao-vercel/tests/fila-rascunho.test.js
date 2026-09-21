import test from 'node:test';import assert from 'node:assert/strict';import {filaRascunho} from '../src/fila-rascunho.js';
test('gravações de rascunho terminam em ordem e continuam após falha',async()=>{
 const estados=[],storage={set:async(k,v)=>{if(v==='falha')throw Error('Disco');await new Promise(r=>setTimeout(r,v==='antigo'?15:1));if(k==='conta')estados.push(v);}},salvar=filaRascunho(storage);
 await Promise.all([salvar('conta','antigo','u'),salvar('conta','novo','u')]);assert.deepEqual(estados,['antigo','novo']);
 await assert.rejects(salvar('conta','falha','u'));await salvar('conta','recuperado','u');assert.equal(estados.at(-1),'recuperado');
});

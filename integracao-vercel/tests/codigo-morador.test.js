import test from 'node:test';
import assert from 'node:assert/strict';
import { erroCodigoMorador, resolverCodigoMorador } from '../src/codigo-morador.js';
const atual = {id:'a',codigo:'ITA01_212',remessaId:'r1',numeroCliente:212};
const processos = [atual,{id:'b',codigo:'ITA01_213'}];
const resolver = rascunho => resolverCodigoMorador({atual,rascunho,processos,codigoAutomatico:'ITA02_010',numeroAutomatico:10});
test('edita e normaliza código sem modificar registros ou identidade do morador',()=>{
 const antes = JSON.stringify(processos);
 assert.deepEqual(resolver({...atual,codigo:' ita01_215 '}),{codigo:'ITA01_215',numeroCliente:215});
 assert.equal(JSON.stringify(processos),antes);
});
test('duplicado, vazio e inválido não podem ser salvos; próprio código é permitido',()=>{
 assert.equal(erroCodigoMorador(atual.codigo,processos,atual.id),'');
 for(const codigo of ['ita01_213','','A B','X'.repeat(65)]) assert.throws(()=>resolver({...atual,codigo}));
});
test('edição de outros campos preserva códigos legados e não renumera',()=>{
 assert.equal(resolver({...atual,requerente:{nome:'Nome corrigido'}}),null);
});
test('trocar remessa mantém geração automática, salvo código explicitamente editado',()=>{
 assert.deepEqual(resolver({...atual,remessaId:'r2'}),{codigo:'ITA02_010',numeroCliente:10});
 assert.deepEqual(resolver({...atual,remessaId:'r2',codigo:'ITA02_030'}),{codigo:'ITA02_030',numeroCliente:30});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { requisitosEtapa } from '../src/requisitos-moradores.js';
const morador = () => ({ etapa:2,requerente:{},conjuge:{},endereco:{},social:{},checks:{},campos:{},docs:[],historico:[{acao:'Registro anterior'}] });
test('parecer sai da documental e passa a bloquear prefeitura', () => {
 const p=morador();const antes=structuredClone(p);
 assert.equal(requisitosEtapa('documental',p,{}).some(r=>r.id==='parecer'),false);
 assert.equal(requisitosEtapa('prefeitura',p,{}).find(r=>r.id==='parecer').ok,false);
 assert.deepEqual(p,antes);
});
test('parecer já marcado continua válido sem migração', () => {
 const p=morador();p.checks.parecer=true;
 assert.equal(requisitosEtapa('prefeitura',p,{}).find(r=>r.id==='parecer').ok,true);
 assert.equal(p.etapa,2);
});

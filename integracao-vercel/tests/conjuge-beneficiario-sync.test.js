import test from 'node:test';
import assert from 'node:assert/strict';
import {projetar,prepararEdicao,copy} from '../src/dados-compartilhados.js';
import {fixture,blank} from './fixture.js';
test('beneficiário do cônjuge persiste no complemento sem mudar cliente financeiro ou histórico',()=>{
 const s=projetar(fixture(),blank()),before=copy(s.db);before.processos[0].conjuge={nome:'Conjuge Teste',cpf:'11144477735',beneficiario:'sim'};before.processos[0].documentosGerados=[{id:'doc-antigo',tipo:'contrato'}];
 const after=copy(before);after.processos[0].conjuge.beneficiario='nao';
 const ops=prepararEdicao(before,after,s,s.db.usuarios[0]);
 assert.equal(ops.length,1);assert.equal(ops[0].table,'integracao_moradores');assert.equal(ops[0].changes.dados.conjuge.beneficiario,'nao');
 assert.equal(ops[0].changes.dados.documentosGerados,undefined); // Patch does not rewrite prior history.
 const base=copy(s.base);base.integracao_complementos=base.integracao_complementos.filter(x=>x.colecao!=='processos');base.integracao_complementos.push({colecao:'processos',registro_id:after.processos[0].id,dados:{...before.processos[0],...ops[0].changes.dados}});
 const restored=projetar(base,blank()).db.processos[0];assert.equal(restored.conjuge.beneficiario,'nao');assert.equal(restored.conjuge.nome,'Conjuge Teste');assert.deepEqual(restored.documentosGerados,before.processos[0].documentosGerados);
});

import test from 'node:test';import assert from 'node:assert/strict';import {textoAcertoDistrato,validarDistrato,tipoDistrato} from '../src/distrato.js';
const numero=x=>Number(String(x||'').replace(',','.')),moeda=x=>numero(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),texto=d=>textoAcertoDistrato(d,moeda,x=>String(x),numero);
test('distrato com multa paga à empresa, sem acerto ignora valores antigos e legado mantém devolução',()=>{
 const d={tipo:'multa',motivo:'Encerramento solicitado',valorMulta:'250,00',vencimentoMulta:'2026-10-10',formaMulta:'PIX',valorDevolucao:900};
 assert.equal(validarDistrato(d,numero),'');assert.match(texto(d),/CONTRATANTE pagará à CONTRATADA multa/);assert.match(texto(d),/10\/10\/2026/);assert.doesNotMatch(texto(d),/900/);
 assert.ok(validarDistrato({...d,valorMulta:0},numero));assert.match(texto({...d,tipo:'sem_acerto'}),/sem multa e sem devolução/);
 assert.equal(tipoDistrato({}),'devolucao');assert.match(texto({valorDevolucao:100,parcelas:1}),/CONTRATADA devolverá/);
});

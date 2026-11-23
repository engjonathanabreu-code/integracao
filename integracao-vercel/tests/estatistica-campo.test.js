import test from 'node:test';
import assert from 'node:assert/strict';
import {percentil,compararCampo} from '../scripts/estatistica-campo.js';
const sample=n=>({status:'ok',durableMs:n,uiMs:n+2,legacyPollingMs:n+7,pollAfterUiMs:5});
const rounds=(deltas)=>deltas.flatMap((delta,i)=>{
 const a={versao:'base',samples:[sample(100),sample(105),sample(110)]},b={versao:'pr',samples:[sample(100+delta),sample(105+delta),sample(110+delta)]};
 return i%2?[b,a]:[a,b];
});
test('percentil conserva cauda e não altera a ordem das amostras',()=>{
 const a=[1000,...Array.from({length:19},(_,i)=>i)];assert.equal(percentil(a,.95),18);assert.equal(a[0],1000);
 assert.throws(()=>percentil([], .95));assert.throws(()=>percentil([NaN],.95));
});
test('comparação preserva blocos ABBA completos e identifica aumento consistente conhecido',()=>{
 const r=compararCampo(rounds([9,9,9,9]),{repeticoes:200,seed:1}).endpoints.durableMs;
 assert.equal(r.deltaP95,9);assert.deepEqual(r.intervalo95,[9,9]);assert.deepEqual(r.deltasPorPar,[9,9,9,9]);
});
test('incerteza entre rodadas aparece no intervalo; falha e censura não são descartadas',()=>{
 const a=rounds([-10,-10,10,10]),r=compararCampo(a,{repeticoes:1000,seed:1});
 assert.ok(r.endpoints.durableMs.intervalo95[0]<0&&r.endpoints.durableMs.intervalo95[1]>0);
 assert.deepEqual(r,compararCampo(a,{repeticoes:1000,seed:1}));
 a[0].samples.push({status:'timeout'});assert.throws(()=>compararCampo(a));
 assert.throws(()=>compararCampo(rounds([1]).slice(0,1)));
});

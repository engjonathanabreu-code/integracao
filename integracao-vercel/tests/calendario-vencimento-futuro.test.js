import test from 'node:test';import assert from 'node:assert/strict';import {prazosDoCalendario} from '../src/calendario-prazos.js';import {ocorreNoDia,segmentosMetas} from '../src/calendario-periodos.js';import {ocorrenciasDoEvento,diaCivilEvento} from '../src/calendario-ocorrencias.js';
test('meta de 15 dias criada na semana anterior é encontrada na semana futura e somente no vencimento',()=>{
 const db={metas:[{id:'m',titulo:'Prazo quinze dias',semana_inicio:'2026-09-28',criadoEm:'2026-09-30',prazo:'2026-10-15',status:'Em andamento'}]};const before=structuredClone(db),items=prazosDoCalendario(db,{hoje:'2026-10-01'});
 assert.deepEqual(segmentosMetas(items,['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']),[]);
 assert.deepEqual(segmentosMetas(items,['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']).map(s=>[s.coluna,s.largura]),[[4,1]]);
 assert.deepEqual(Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`).filter(d=>ocorreNoDia(items[0],d)),['2026-10-15']);assert.deepEqual(db,before);
});
test('virada de mês/ano e itens sem prazo não criam faixas nem datas inventadas',()=>{
 const items=prazosDoCalendario({metas:[{id:'m',status:'Em andamento',semana_inicio:'2026-12-21',prazo:'2027-01-05'},{id:'s',status:'Em andamento',semana_inicio:'2026-12-21'}]},{hoje:'2026-12-22'});assert.equal(items.length,1);assert.equal(ocorreNoDia(items[0],'2026-12-31'),false);assert.equal(ocorreNoDia(items[0],'2027-01-05'),true);assert.equal(segmentosMetas(items,['2027-01-04','2027-01-05','2027-01-06'])[0].largura,1);
});
test('eventos usam término em America/Sao_Paulo, preservam datas civis e não dependem do fuso da máquina',()=>{
 const e={inicio:'2026-12-20T15:00:00Z',fim:'2027-01-01T01:30:00Z',recorrencia:'nenhuma'},before=structuredClone(e);assert.deepEqual(ocorrenciasDoEvento(e),['2026-12-31']);assert.deepEqual(e,before);assert.equal(diaCivilEvento('2027-01-01'),'2027-01-01');assert.equal(diaCivilEvento('2027-01-01T00:30:00'),'2027-01-01');assert.deepEqual(ocorrenciasDoEvento({...e,fim:undefined}),[]);
});

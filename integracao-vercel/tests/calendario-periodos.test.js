import test from 'node:test';
import assert from 'node:assert/strict';
import { prazosDoCalendario } from '../src/calendario-prazos.js';
import { ocorreNoDia, segmentosMetas, filtrarMetasCalendario } from '../src/calendario-periodos.js';
const meta={id:'m',titulo:'Meta',semana_inicio:'2026-09-28',prazo:'2026-10-03',status:'Em andamento'};
test('vencimento aparece somente no seu dia, em outra semana/mês, sem mudar datas persistidas',()=>{
 const db={metas:[meta]};const antes=structuredClone(db);const itens=prazosDoCalendario(db,{hoje:'2026-09-30'});
 assert.equal(ocorreNoDia(itens[0],'2026-09-29'),false);assert.equal(ocorreNoDia(itens[0],'2026-10-04'),false);
 assert.deepEqual(segmentosMetas(itens,['2026-09-27','2026-09-28','2026-09-29']),[]);
 assert.deepEqual(segmentosMetas(itens,['2026-10-01','2026-10-02','2026-10-03']).map(s=>[s.coluna,s.largura]),[[3,1]]);
 assert.deepEqual(db,antes);
});
test('atrasada permanece no vencimento original e concluída desaparece',()=>{
 const itens=prazosDoCalendario({metas:[meta]},{hoje:'2026-10-10'});
 assert.equal(ocorreNoDia(itens[0],'2026-10-10'),false);assert.equal(ocorreNoDia(itens[0],'2026-10-03'),true);assert.equal(itens[0].atrasada,true);
 assert.equal(prazosDoCalendario({metas:[{...meta,status:'Concluído'}]}).length,0);
});

test('filtro separa metas no prazo e atrasadas sem esconder eventos', () => {
 const itens=[{id:'ativa',tipo:'meta',atrasada:false},{id:'atrasada',tipo:'meta',atrasada:true},{id:'evento',tipo:'evento'}];
 assert.deepEqual(filtrarMetasCalendario(itens,'ativas').map(i=>i.id),['ativa','evento']);
 assert.deepEqual(filtrarMetasCalendario(itens,'atrasadas').map(i=>i.id),['atrasada','evento']);
 assert.equal(filtrarMetasCalendario(itens,'').length,3);
});

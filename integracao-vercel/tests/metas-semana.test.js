import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {segundaDaMeta,semanaAoSalvar,metaNaSemana} from '../src/metas-semana.js';
const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
test('qualquer dia escolhido vira a segunda-feira da mesma semana',()=>{
 // 2026-11-23 é segunda-feira.
 for(const dia of ['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-28','2026-11-29'])assert.equal(segundaDaMeta(dia),'2026-11-23',dia);
 assert.equal(segundaDaMeta('2026-11-30'),'2026-11-30');
 assert.equal(segundaDaMeta('2027-01-01'),'2026-12-28');assert.equal(segundaDaMeta('2028-03-01'),'2028-02-28');
});
test('texto que não é data completa volta como veio',()=>{
 for(const v of ['','2026-11',null,undefined,'abc'])assert.equal(segundaDaMeta(v),v);
});
test('ao salvar: data nova é ajustada; data antiga não mexida é preservada',()=>{
 assert.equal(semanaAoSalvar('2026-11-25',undefined),'2026-11-23');
 assert.equal(semanaAoSalvar('2026-11-25','2026-11-16'),'2026-11-23');
 assert.equal(semanaAoSalvar('2026-11-25','2026-11-25'),'2026-11-25');
 assert.equal(semanaAoSalvar('2026-11-23','2026-11-25'),'2026-11-23');
});
test('filtro da semana encontra a meta gravada em qualquer dia daquela semana',()=>{
 const metas=[{id:'seg',semana_inicio:'2026-11-23'},{id:'qua',semana_inicio:'2026-11-25'},{id:'dom',semana_inicio:'2026-11-29'},{id:'outra',semana_inicio:'2026-11-30'},{id:'anterior',semana_inicio:'2026-11-22'},{id:'sem'},{id:'vazia',semana_inicio:''}];
 assert.deepEqual(metas.filter(m=>metaNaSemana(m,'2026-11-23')).map(m=>m.id),['seg','qua','dom']);
 assert.deepEqual(metas.filter(m=>metaNaSemana(m,'2026-11-30')).map(m=>m.id),['outra']);
 assert.equal(metaNaSemana(null,'2026-11-23'),false);
});
test('tela de Metas usa as regras: filtro por semana e ajuste ao salvar',()=>{
 assert.match(fonte,/const daSemana = visiveis\.filter\(\(m\) => metaNaSemana\(m, inicioSemana\)\);/);
 assert.doesNotMatch(fonte,/m\.semana_inicio === inicioSemana/);
 assert.match(fonte,/semana_inicio: semanaAoSalvar\(f\.semana_inicio, meta\?\.semana_inicio\),/);
});

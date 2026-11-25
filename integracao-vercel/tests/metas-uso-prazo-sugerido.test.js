import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prazoSugeridoMeta,PRAZO_SUGERIDO_DIAS} from '../src/metas-uso.js';

test('USO-M1: a meta nova sugere prazo de duas semanas a partir do dia civil operacional',()=>{
 assert.equal(PRAZO_SUGERIDO_DIAS,14);
 assert.equal(prazoSugeridoMeta(new Date('2026-11-25T15:00:00Z')),'2026-12-09');
 // 23h em Brasília ainda é o mesmo dia civil, mesmo já sendo o dia seguinte em UTC.
 assert.equal(prazoSugeridoMeta(new Date('2026-11-26T02:00:00Z')),'2026-12-09');
 assert.equal(prazoSugeridoMeta(new Date('2026-11-26T03:00:00Z')),'2026-12-10');
 // Viradas de mês e de ano.
 assert.equal(prazoSugeridoMeta(new Date('2026-12-24T15:00:00Z')),'2027-01-07');
 assert.equal(prazoSugeridoMeta(new Date('2028-02-20T15:00:00Z')),'2028-03-05');
 assert.equal(prazoSugeridoMeta(new Date('invalida')),'');
});

test('USO-M1: só a criação usa a sugestão; a edição mantém o prazo gravado, inclusive vazio',()=>{
 const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const modal=fonte.slice(fonte.indexOf('function ModalMetaERP('),fonte.indexOf('function ModalDetalheMeta('));
 const estado=modal.slice(modal.indexOf('useState(() => nova'),modal.indexOf('const set = '));
 const [criacao,edicao]=estado.split('\n').filter(l=>l.includes('prazo:'));
 assert.match(criacao,/prazo: prazoSugeridoMeta\(\),/);
 assert.match(edicao,/prazo: meta\.prazo \|\| "",/);
 assert.doesNotMatch(edicao,/prazoSugeridoMeta/);
 // O campo continua editável e opcional.
 assert.match(modal,/htmlFor="mtp">Prazo \(opcional\)<\/label><input id="mtp" type="date"/);
});

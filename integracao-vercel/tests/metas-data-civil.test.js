import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diaCivilEvento} from '../src/calendario-ocorrencias.js';

test('atraso usa o dia civil operacional perto de 21h e na virada de dia, mês ou ano',()=>{
 const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const trecho=fonte.slice(fonte.indexOf('function PaginaMetas('),fonte.indexOf('function AbaMetasNucleo('));
 const hoje=trecho.match(/const hoje = ([^;]+);/)[1];
 const atrasadas=trecho.match(/const atrasadas = ([^;]+);/)[1];
 const avaliar=new Function('Date','diaCivilEvento','ativas',`const hoje=${hoje}; return (${atrasadas}).length`);
 for(const [instante,prazo,esperado] of [
   ['2026-11-17T23:59:00Z','2026-11-17',0],
   ['2026-11-18T00:01:00Z','2026-11-17',0],
   ['2026-11-18T02:59:59Z','2026-11-17',0],
   ['2026-11-18T03:00:00Z','2026-11-17',1],
   ['2026-12-01T03:00:00Z','2026-11-30',1],
   ['2027-01-01T02:59:59Z','2026-12-31',0],
   ['2027-01-01T03:00:00Z','2026-12-31',1],
   ['2026-11-17T20:05:00-04:00','2026-11-17',0],
   ['2026-11-18T01:01:00+01:00','2026-11-17',0],
 ]) {
   class Relogio extends Date { constructor(){super(instante);} }
   assert.equal(avaliar(Relogio,diaCivilEvento,[{prazo}]),esperado,instante);
 }
});

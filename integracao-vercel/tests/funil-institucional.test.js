import test from 'node:test';
import assert from 'node:assert/strict';
import {alterarFunil,funilVazio} from '../src/funil-institucional.js';
const contexto = {municipios:Array.from({length:5},(_,i)=>({id:`m${i}`,nome:`Cidade ${i}`,uf:'SC'})),nucleos:[{id:'n1',municipioId:'m0'},{id:'n2',municipioId:'m0'}],autor:'Pessoa de teste',data:'2026-10-13T12:00:00Z'};
test('fluxo único preserva municípios e múltiplos núcleos sem criar cadastros',()=>{
 const vazio=funilVazio();
 let f=alterarFunil(vazio,{tipo:'cidade',id:'c0',nome:'Cidade 0',uf:'SC'},contexto);
 assert.equal(f.cidades[0].etapa,'nuvens');assert.equal(f.cidades[0].municipioId,null);
 assert.throws(()=>alterarFunil(f,{tipo:'cidade',...f.cidades[0],etapa:'prospeccao'},contexto));
 f=alterarFunil(f,{tipo:'cidade',...f.cidades[0],municipioId:'m0',etapa:'prospeccao'},contexto);
 f=alterarFunil(f,{tipo:'nucleo',nucleoId:'n1',carteira:'reserva'},contexto);
 f=alterarFunil(f,{tipo:'nucleo',nucleoId:'n2',carteira:'preparacao'},contexto);
 f=alterarFunil(f,{tipo:'nucleo',nucleoId:'n1',carteira:'venda'},contexto);
 assert.equal(f.nucleos.length,2);assert.ok(f.nucleos.every(n=>n.municipioId==='m0'));
 assert.equal(f.cidades[0].etapa,'carteiras');assert.equal(f.historico.length,5);
 assert.equal(vazio.cidades.length,0);assert.equal(contexto.nucleos.length,2);
});
test('quatro municípios em Prospecção sem apagar excedentes nem limitar núcleos',()=>{
 let f=funilVazio();
 for(let i=0;i<4;i++) f=alterarFunil(f,{tipo:'cidade',id:`c${i}`,municipioId:`m${i}`,etapa:'prospeccao'},contexto);
 assert.throws(()=>alterarFunil(f,{tipo:'cidade',id:'c4',municipioId:'m4',etapa:'prospeccao'},contexto));
 assert.equal(f.cidades.length,4);assert.equal(f.historico.length,4);
 assert.throws(()=>alterarFunil(f,{tipo:'cidade',id:'dup',nome:'Cidade 0',uf:'SC'},contexto));
});

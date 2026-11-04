import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {carregarResumosChatwoot} from '../src/crm-chatwoot-carga.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('resumo consulta somente cards autorizados, em lotes sequenciais de até 25',async()=>{
 const cards=Object.freeze(Array.from({length:51},(_,n)=>Object.freeze({id:id(n)}))),calls=[];
 let emCurso=0;
 const rows=await carregarResumosChatwoot([...cards,cards[0]],async(t,f)=>{
   assert.equal(++emCurso,1);assert.equal(t,'integracao_crm_chatwoot_resumo');
   const ids=f.slice('&card_id=in.('.length,-1).split(',');calls.push(ids);
   await Promise.resolve();emCurso--;return [...ids.map(card_id=>({card_id,mensagens:2})),{card_id:id(999)}];
 });
 assert.deepEqual(calls.map(x=>x.length),[25,25,1]);assert.deepEqual(calls.flat(),cards.map(c=>c.id));assert.equal(rows.length,51);
});
test('sem cards não consulta uma visão global',async()=>{
 assert.deepEqual(await carregarResumosChatwoot([],()=>assert.fail('consulta indevida')),[]);
});
test('erro de resumo não é convertido em zero ou resultado parcial; repetir pode recuperar',async()=>{
 const cards=Array.from({length:26},(_,n)=>({id:id(n)}));let calls=0;
 await assert.rejects(carregarResumosChatwoot(cards,async()=>{if(++calls===2)throw Error('statement timeout');return [{card_id:id(0),mensagens:5}];}),/statement timeout/);
 assert.deepEqual(await carregarResumosChatwoot([cards[0]],async()=>[{card_id:id(0),mensagens:5}]),[{card_id:id(0),mensagens:5}]);
});
test('mudança de usuário/fechamento interrompe lotes seguintes e descarta a resposta',async()=>{
 let ativo=true,calls=0;
 const rows=await carregarResumosChatwoot(Array.from({length:26},(_,n)=>({id:id(n)})),async()=>{calls++;ativo=false;return [{card_id:id(0)}];},()=>ativo);
 assert.equal(rows,null);assert.equal(calls,1);
});
test('ID inválido não pode ampliar o filtro REST',async()=>{
 await assert.rejects(carregarResumosChatwoot([{id:'x)&or=(true)'}],()=>assert.fail('consulta indevida')),/inválido/);
});
test('CRM mantém carga essencial separada, erro explícito e controle de respostas obsoletas',()=>{
 const src=readFileSync(new URL('../src/CRM.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(src,/listarCRM\('integracao_crm_chatwoot_resumo'\)/);
 assert.match(src,/return \{cards,tarefas,followups\}/);
 assert.match(src,/chatwoot\?\.base===m.dados&&chatwoot\?\.usuario===usuario\?\.id/);
 assert.match(src,/return\(\)=>\{ativo=false;\}/);
 assert.match(src,/Os dados do CRM continuam disponíveis/);
});

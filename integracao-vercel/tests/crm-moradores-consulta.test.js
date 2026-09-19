import test from 'node:test';
import assert from 'node:assert/strict';
import {definirSessao,lerTabela} from '../src/dados-compartilhados.js';
test('CRM carrega vínculos dos moradores com chave composta e paginação estável',async()=>{
 const original=globalThis.fetch, chamadas=[];
 definirSessao({access_token:'teste',expires_in:3600,user:{id:'teste'}});
 globalThis.fetch=async input=>{
  const url=new URL(input); chamadas.push(url);
  if(url.searchParams.get('order')==='id')return new Response(JSON.stringify({message:'column integracao_moradores.id does not exist'}),{status:400});
  const offset=Number(url.searchParams.get('offset'));
  return Response.json(Array.from({length:offset===0?500:1},(_,i)=>({referencia_id:`cliente-${offset+i}`,nucleo_id:'nucleo'})));
 };
 try {
  const rows=await lerTabela('integracao_moradores','referencia_id,nucleo_id:dados->>nucleoId','&colecao=eq.processos&referencia_id=in.(cliente)');
  assert.equal(rows.length,501);
  assert.deepEqual(chamadas.map(u=>u.searchParams.get('offset')),['0','500']);
  for(const url of chamadas){assert.equal(url.searchParams.get('order'),'colecao,registro_id');assert.equal(url.searchParams.get('colecao'),'eq.processos');assert.equal(url.searchParams.get('select'),'referencia_id,nucleo_id:dados->>nucleoId');}
  chamadas.length=0;
  globalThis.fetch=async input=>{chamadas.push(new URL(input));return Response.json([]);};
  await lerTabela('integracao_crm_funil');
  assert.equal(chamadas[0].searchParams.get('order'),'id');
 }finally{globalThis.fetch=original;definirSessao(null);}
});

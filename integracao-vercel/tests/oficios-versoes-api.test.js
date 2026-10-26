import test from 'node:test';import assert from 'node:assert/strict';
import {definirSessao} from '../src/dados-compartilhados.js';
import {listarOficios,historicoOficio,atualizarOficio} from '../src/oficios-api.js';
test('leitura pagina ofícios e histórico, mantém ID original e seleciona maior versão sem escritas',async()=>{
 const original=globalThis.fetch,calls=[];
 definirSessao({user:{id:'fixture'},access_token:'fixture',expires_in:3600});
 globalThis.fetch=async(input,opts)=>{
  const u=new URL(input);calls.push({u,opts});const offset=Number(u.searchParams.get('offset')||0),table=u.pathname.split('/').at(-1);
  if(table==='integracao_oficios_sequencias')return Response.json([{ano:2026,ultimo:501}]);
  if(table==='integracao_oficios'){
   assert.equal(u.searchParams.get('versoes.limit'),'1');assert.equal(u.searchParams.get('versoes.order'),'versao.desc');
   return Response.json(Array.from({length:offset===0?500:1},(_,i)=>({id:`raiz-${offset+i}`,ano:2026,numero:offset+i+1,versoes:[{id:'v2',versao:2,resumo:'mais recente',data_envio:null}]})));
  }
  if(table==='integracao_oficios_versoes')return Response.json(Array.from({length:offset===0?500:1},(_,i)=>({id:`v-${offset+i}`,versao:501-offset-i})));
  throw Error('Chamada inesperada');
 };
 try{
  const r=await listarOficios(2026);assert.equal(r.itens.length,501);assert.equal(r.itens[500].id,'raiz-500');assert.equal(r.itens[0].versao_id,'v2');assert.equal(r.itens[0].data_envio,null);
  assert.equal((await historicoOficio('raiz-0')).length,501);assert.ok(calls.every(c=>!c.opts.method||c.opts.method==='GET'));
  let body;globalThis.fetch=async(input,opts)=>{body=JSON.parse(opts.body);return Response.json({versao:3});};
  assert.equal((await atualizarOficio({pedido:'teste',oficio_id:'raiz-0',base_id:'v2'})).versao,3);assert.equal(body.p_acao,'atualizar');assert.equal(body.p_dados.base_id,'v2');
 }finally{globalThis.fetch=original;definirSessao(null);}
});

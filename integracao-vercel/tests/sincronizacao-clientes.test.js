import test from 'node:test';
import assert from 'node:assert/strict';
import {clientesDasOperacoes,clientesComEdicao,atualizarFichas} from '../src/sincronizacao-clientes.js';
import {lerFichaCliente,definirSessao,mesclarEdicoes} from '../src/dados-compartilhados.js';
import {id} from './fixture.js';
import {falhaTransitoria} from '../src/sincronizacao-regras.js';

test('a pending refresh reloads edited or locally removed full residents, without loading untouched summaries',()=>{
 const antigo={id:id(1),_compartilhado:true,etapa:0},apagado={id:id(2),_compartilhado:true},resumo={id:id(3),_resumo:true,_compartilhado:true},igual={id:id(4),_compartilhado:true};
 assert.deepEqual(clientesComEdicao({processos:[antigo,apagado,resumo,igual]},{processos:[{...antigo,etapa:1},resumo,igual]}),[antigo,apagado]);
});

test('metadata-only edits reload the full customer and ignore deletions/unrelated modules',()=>{
 const p={id:id(1),financeiroRef:id(2)};
 assert.deepEqual(clientesDasOperacoes([{table:'integracao_moradores',key:{colecao:'processos',registro_id:id(1)}},{table:'fin_receb_clientes',key:{id:id(3)},remove:true},{table:'integracao_metas',key:{id:id(4)}}],[p]),[p]);
 assert.deepEqual(clientesDasOperacoes([{table:'fin_receb_clientes',key:{id:id(2)}}],[p]),[p]);
});
test('unavailable cached customer is removed from every projection without blocking other records',async()=>{
 const row={registro_id:id(1),referencia_id:id(2)};
 const base={fin_receb_clientes:[{id:id(2)},{id:id(3)}],integracao_moradores:[row],integracao_complementos:[{...row,_tabela:'integracao_moradores'},{registro_id:id(1),_tabela:'integracao_metas'}],_moradoresResumo:[{id:id(1),financeiroRef:id(2)}]};
 await atualizarFichas(base,[{id:id(1),financeiroRef:id(2)}],async(_,options)=>{assert.equal(options.permitirAusente,true);return {clientes:[],complementos:[],indisponivel:true};});
 assert.deepEqual(base.fin_receb_clientes,[{id:id(3)}]);assert.deepEqual(base.integracao_moradores,[]);assert.equal(base.integracao_complementos.length,1);assert.deepEqual(base._moradoresResumo,[]);
});
test('a vanished unchanged row stays absent, but an edited or new local row is preserved',()=>{
 const b={processos:[{id:'old',etapa:0}]};
 assert.deepEqual(mesclarEdicoes(b,b,{processos:[]}),{processos:[]});
 const l={processos:[{id:'old',etapa:1},{id:'new',etapa:2}]};
 assert.deepEqual(mesclarEdicoes(b,l,{processos:[]}),l);
});
test('optional lookup distinguishes an empty authorized result from permission/network failures',async()=>{
 const original=global.fetch;definirSessao({access_token:'fixture',expires_in:3600});
 try{
  global.fetch=async()=>Response.json([]);
  assert.equal((await lerFichaCliente({id:id(1)},{permitirAusente:true})).indisponivel,true);
  await assert.rejects(()=>lerFichaCliente({id:id(1)}),{code:'CLIENTE_INDISPONIVEL'});
  for(const status of [403,503]){global.fetch=async()=>Response.json({message:'Falha real'},{status});await assert.rejects(()=>lerFichaCliente({id:id(1)},{permitirAusente:true}),e=>{assert.equal(falhaTransitoria(e),status===503);return true;});}
 }finally{global.fetch=original;definirSessao(null);}
});
test('legacy reference is resolved through the complement with the same user session',async()=>{
 const original=global.fetch,requests=[];definirSessao({access_token:'fixture',expires_in:3600});
 try{
  global.fetch=async(url,options)=>{const u=new URL(url);requests.push(u);assert.equal(options.headers.Authorization,'Bearer fixture');return Response.json(u.pathname.endsWith('integracao_moradores')?[{registro_id:id(1),referencia_tabela:'fin_receb_clientes',referencia_id:id(2)}]:u.searchParams.get('id')==='eq.'+id(2)?[{id:id(2)}]:[]);};
  const carga=await lerFichaCliente({id:id(1)});assert.equal(carga.clientes[0].id,id(2));assert.equal(requests.length,3);
 }finally{global.fetch=original;definirSessao(null);}
});

test("transport-wrapped lost response remains retryable without retrying denied writes",()=>{assert.equal(falhaTransitoria(new Error("mensagem",{cause:new TypeError("rede")})),true);assert.equal(falhaTransitoria(new Error("mensagem",{cause:{status:403}})),false);});

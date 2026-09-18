import test from 'node:test';
import assert from 'node:assert/strict';
import {reunirClientes, filtrarClientes} from '../src/busca-clientes.js';
import {lerIndiceClientes, lerFichaCliente, definirSessao} from '../src/dados-compartilhados.js';
const db = {municipios:[{id:'m'}], remessas:[], nucleos:[], processos:[]};
const clientes = [
  {id:'a', nome:'João da Silva', codigo:'ILH01_001', municipio_id:'m', remessa_id:'r'},
  {id:'b', nome:'João Comércio Ltda', codigo:'ILH02_002', municipio_id:'m'},
  {id:'c', nome:'João sem município', codigo:'AVU_003'},
];
const complementos = [{registro_id:'pj', referencia_id:'b', dados:{requerente:{tipoPessoa:'juridica'}}}];
test('PF/PJ: partial, case and accent insensitive names, prefix and exact code; similar matches retain identity', () => {
 const lista = reunirClientes(clientes, complementos, db);
 assert.equal(filtrarClientes(lista,'JOAO').length,3);
 assert.equal(filtrarClientes(lista,'comerc')[0].id,'pj');
 assert.equal(filtrarClientes(lista,'ilh').length,2);
 assert.equal(filtrarClientes(lista,'ilh02_002')[0].requerente.tipoPessoa,'juridica');
 assert.equal(filtrarClientes(lista,'silv')[0].id,'a');
 assert.equal(filtrarClientes(lista,'   ').length,0);
 assert.equal(filtrarClientes(lista,'inexistente').length,0);
 assert.equal(filtrarClientes(lista,'joao','m').length,2);
 assert.equal(filtrarClientes(lista,'avu')[0].municipioId,undefined);
 assert.equal(filtrarClientes(lista,'comerc')[0].remessaId,undefined);
});
test('local unsaved edits win, standalone clients are searchable, archived clients stay hidden', () => {
 const local={...db,processos:[{id:'local',financeiroRef:'a',codigo:'ILH01_001',requerente:{nome:'Nome editado'}}]};
 const lista=reunirClientes(clientes,[...complementos,{registro_id:'solo',dados:{codigo:'SOLO',requerente:{nome:'Cadastro avulso'}}},{registro_id:'archive',referencia_id:'c',dados:{extras:{arquivamento:{ativo:true}}}}],local);
 assert.equal(lista.filter(p=>p.financeiroRef==='a').length,1);
 assert.equal(filtrarClientes(lista,'editado')[0].id,'local');
 assert.equal(filtrarClientes(lista,'cadastro')[0].id,'solo');
 assert.equal(filtrarClientes(lista,'avu_003').length,0);
 assert.equal(reunirClientes(clientes,complementos,{...db,municipios:[{id:'m',extras:{arquivamento:{ativo:true}}}]}).length,1);
});
test('all matching results remain reachable beyond thirty',()=>{
 const muitos=Array.from({length:65},(_,i)=>({id:String(i),requerente:{nome:'João '+i}}));
 assert.equal(filtrarClientes(muitos,'joao').length,65);
});
test('directory uses session, narrow projections and paging; orphan detail uses existing source permissions',async()=>{
 const original=global.fetch, requests=[];
 definirSessao({access_token:'test-token',expires_in:3600});
 global.fetch=async(url,options)=>{
  const u=new URL(url); requests.push([u,options]);
  assert.equal(options.headers.Authorization,'Bearer test-token');
  if(u.pathname.endsWith('fin_receb_clientes'))return Response.json(u.searchParams.get('select')==='*'?[clientes[2]]:clientes);
  return Response.json(u.searchParams.get('select') ? [{registro_id:'pj',referencia_id:'b',nome:'João Comércio Ltda',tipoPessoa:'juridica'}] : complementos);
 };
 try {
  const indice=await lerIndiceClientes();assert.equal(indice.complementos[0].dados.requerente.tipoPessoa,'juridica');
  assert(!requests[1][0].searchParams.get('select').includes('cpf'));
  const ficha=await lerFichaCliente({id:'c',financeiroRef:'c'});assert.equal(ficha.clientes[0].id,'c');
  assert.equal(requests[2][0].searchParams.get('id'),'eq.c');
 } finally {global.fetch=original;definirSessao(null);}
});

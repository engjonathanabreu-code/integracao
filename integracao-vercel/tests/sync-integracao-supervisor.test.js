import test from 'node:test';
import assert from 'node:assert/strict';
import {igualCampo} from '../src/igualdade-semantica.js';
import {conciliarEdicoes} from '../src/concorrencia.js';

const A='erp_00000000-0000-4000-8000-00000000000a',B='erp_00000000-0000-4000-8000-00000000000b',C='erp_00000000-0000-4000-8000-00000000000c';

test('integração: lidaPor confirma quando outro leitor simultâneo também foi acrescentado', () => {
  assert.equal(igualCampo('notificacoes',['lidaPor'],[B,A,C],[A,B],{confirmacao:true}),true);
});

test('integração: lidaPor continua divergente quando falta o leitor esperado', () => {
  assert.equal(igualCampo('notificacoes',['lidaPor'],[A,C],[A,B],{confirmacao:true}),false);
});

test('integração: fora da confirmação lidaPor segue igualdade de conjunto (sem aditivo)', () => {
  assert.equal(igualCampo('notificacoes',['lidaPor'],[A,B,C],[A,B]),false);
  assert.equal(igualCampo('notificacoes',['lidaPor'],[B,A],[A,B]),true);
});

test('integração: aditivo não vale para outros conjuntos (responsáveis de meta)', () => {
  const r1='00000000-0000-4000-8000-000000000001',r2='00000000-0000-4000-8000-000000000002';
  assert.equal(igualCampo('metas',['responsaveis'],[r1,r2],[r1],{confirmacao:true}),false);
});

test('integração: conciliação de lidaPor continua merge de conjunto', () => {
  const {dados,conflitos}=conciliarEdicoes({lidaPor:[A]},{lidaPor:[A,B]},{lidaPor:[A,C]},{},{colecao:'notificacoes'});
  assert.deepEqual(conflitos,[]);
  assert.deepEqual([...dados.lidaPor].sort(),[A,B,C].sort());
});

test('integração: buscarREST sinaliza alcance do servidor ao monitor de conexão', async t => {
  const anteriorWindow=globalThis.window,anteriorFetch=globalThis.fetch;
  const alvo=new EventTarget(),sinais=[];
  alvo.addEventListener('integracao:transporte',e=>sinais.push(e.detail.ok));
  globalThis.window=alvo;
  t.after(()=>{globalThis.window=anteriorWindow;globalThis.fetch=anteriorFetch;});
  const {buscarREST}=await import('../src/transporte-rest.js');
  globalThis.fetch=async()=>new Response('[]',{status:200});
  await buscarREST('https://exemplo.invalid/x');
  globalThis.fetch=async()=>new Response('{"message":"lento"}',{status:500});
  await assert.rejects(buscarREST('https://exemplo.invalid/x',{method:'POST'}));
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(buscarREST('https://exemplo.invalid/x',{method:'POST'}));
  assert.deepEqual(sinais,[true,true,false]);
});

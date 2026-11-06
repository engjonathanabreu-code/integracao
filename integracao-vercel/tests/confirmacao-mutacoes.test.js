import test from 'node:test';
import assert from 'node:assert/strict';
import {alteracoesConfirmadas,criarConfirmacoesMutacoes,erroConfirmacao} from '../src/confirmacao-mutacoes.js';

const base = () => ({processos:[{id:'p',unidades:[{id:'u1',area:'10.05'},{id:'u2',area:'20'}]}],nucleos:[{id:'n',memorial:{texto:'anterior'}}],auditoria:[]});
const mudar = (b,id,fn) => { const d=structuredClone(b);fn(d);d.auditoria.unshift({id});return d; };

test('confere unidade pelo ID, campos alterados e precisão, sem exigir posição de array',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{d.processos[0].unidades[0].area='12.3456';});
  const remoto=structuredClone(depois);remoto.processos[0].unidades.reverse();remoto.processos[0].unidades[0].observacao='outro usuário';
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),true);
  remoto.processos[0].unidades.find(u=>u.id==='u1').area='12.34';
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});

test('não aceita projeção sem campo persistido e trata geometrias completas como valores exatos',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].geo={geojson:{type:'Polygon',coordinates:[[[1,2],[3,4],[1,2]],[[2,2],[2,3],[2,2]]]},centro:{lat:2,lng:1}};});
  assert.equal(alteracoesConfirmadas(antes,depois,antes),false);
  const remoto=structuredClone(depois);remoto.nucleos[0].geo.geojson.coordinates.pop();
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
  assert.equal(alteracoesConfirmadas(antes,depois,depois),true);
});

test('considera aliases de registros e aceita defaults acrescentados na leitura',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{d.processos.push({id:'local',nome:'Novo',nucleoId:'n'});});
  const remoto=structuredClone(depois);remoto.processos[1]={...remoto.processos[1],id:'uuid',extra:true};
  assert.equal(alteracoesConfirmadas(antes,depois,remoto,{local:'uuid'}),true);
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});

test('exclusões só são confirmadas quando o campo ou registro não aparece na leitura',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{delete d.nucleos[0].memorial;d.processos=[];});
  assert.equal(alteracoesConfirmadas(antes,depois,depois),true);
  assert.equal(alteracoesConfirmadas(antes,depois,antes),false);
});

test('Promise espera seu próprio lote e a leitura, sem confirmar edições posteriores',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base();
  const primeira=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='primeira';});
  const segunda=mudar(primeira,'b',d=>{d.processos[0].unidades[1].area='55';});
  let uma=false,duas=false;
  const p1=c.aguardar('a',antes,primeira).then(r=>{uma=true;return r;});
  const p2=c.aguardar('b',primeira,segunda).then(r=>{duas=true;return r;});
  await Promise.resolve();assert.equal(uma,false);assert.equal(duas,false);
  c.confirmar(primeira,primeira,{pedido:'lote1'});await p1;
  assert.equal(uma,true);assert.equal(duas,false);assert.equal(c.tamanho,1);
  c.confirmar(segunda,segunda,{pedido:'lote2'});assert.equal((await p2).confirmado,true);assert.equal(c.tamanho,0);
});

test('recibo com leitura divergente rejeita sem alterar os dados recebidos',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const original=structuredClone(depois),p=c.aguardar('a',antes,depois);
  c.confirmar(depois,antes,{pedido:'gravou'});
  await assert.rejects(p,{code:'LEITURA_DIVERGENTE',rascunhoPreservado:true});
  assert.deepEqual(depois,original);
});

test('timeout, falha de rede e encerramento limpam apenas esperas e preservam snapshots',async()=>{
  let timeout;const c=criarConfirmacoesMutacoes({setTimer:fn=>{timeout=fn;return 1;},clearTimer:()=>{}}),antes=base();
  const depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const p=c.aguardar('a',antes,depois);timeout();await assert.rejects(p,{code:'CONFIRMACAO_TIMEOUT'});
  const p2=c.aguardar('b',antes,depois);c.falhar(erroConfirmacao('Sem rede','SEM_CONEXAO'));await assert.rejects(p2,{code:'SEM_CONEXAO'});
  assert.equal(depois.nucleos[0].memorial.texto,'novo');assert.equal(c.tamanho,0);
});

test('modificar o rascunho depois do registro não muda os valores esperados',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].geo={centro:{lng:1,lat:2}};});
  const esperado=structuredClone(depois),p=c.aguardar('a',antes,depois);depois.nucleos[0].geo.centro.lng=20;
  c.confirmar(esperado,esperado,{});assert.equal((await p).confirmado,true);
});

test('retoma a mesma intenção depois de falha e reconhece confirmação em segundo plano',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const p=c.aguardar('a',antes,depois);c.falhar(erroConfirmacao('rede','SEM_CONEXAO'));await assert.rejects(p);
  c.confirmar(depois,depois,{pedido:'original'});
  assert.equal(c.confirmada('a'),true);
  assert.equal((await c.retentar('a')).recibo.pedido,'original');
  const seguinte=mudar(depois,'b',d=>{d.nucleos[0].memorial.texto='outro';});
  c.confirmar(seguinte,seguinte,{pedido:'posterior'});
  assert.equal((await c.retentar('a')).recibo.pedido,'original','uma intenção já confirmada não muda com edições posteriores');
});

test('retentativas simultâneas aguardam uma só confirmação da intenção',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const p=c.aguardar('a',antes,depois);c.falhar(erroConfirmacao('rede','SEM_CONEXAO'));await assert.rejects(p);
  const a=c.retentar('a'),b=c.retentar('a');assert.equal(a,b);assert.equal(c.tamanho,1);
  c.confirmar(depois,depois,{});assert.equal((await a).confirmado,true);await b;
});

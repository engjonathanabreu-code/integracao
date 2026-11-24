import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao,validarVinculoMoradoresDoEnvio} from '../src/dados-compartilhados.js';
import {processarIntencao} from '../src/fila-intencoes.js';
import {classificarFalha,orientacaoPendencia} from '../src/estado-sincronizacao.js';

function cenario(existenteNoServidor=false){
 const base=fixture(),codigo='TST01_065', registro=id(65);
 const dados={id:registro,municipioId:id(2),remessaId:id(3),codigo,nucleoId:'',situacao:'Ativo',requerente:{nome:'Requerente fictício'}};
 if(existenteNoServidor)base.integracao_moradores=[{colecao:'processos',registro_id:registro,criado_por:id(1),referencia_tabela:null,referencia_id:null,dados}];
 return {base,state:projetar(base,blank()),dados,registro};
}
test('edição de ficha local ou suplemento órfão não gera writes nem cria outro cadastro',()=>{
 for (const existente of [false,true]){
  const {state,dados,registro}=cenario(existente);
  const local=structuredClone(state.db);
  if(!existente)local.processos.push(dados);
  const proximo=structuredClone(local);
  proximo.processos.find(r=>r.id===registro).requerente.telefone='Telefone fictício';
  const original=structuredClone(proximo);
  assert.throws(()=>prepararEdicao(local,proximo,state,state.db.usuarios[0]),e=>{
   assert.equal(e.code,'CLIENTE_SEM_VINCULO_CANONICO');assert.equal(classificarFalha(e).categoria,'validacao');return true;
  });
  assert.deepEqual(proximo,original);
  assert.match(orientacaoPendencia({erro:{codigo:'CLIENTE_SEM_VINCULO_CANONICO'}}),/não foi enviada/);
 }
});
test('criação normal mantém id e código e produz criação canônica e complemento vinculado na mesma lista',()=>{
 const {state,dados,registro}=cenario();
 const depois=structuredClone(state.db);depois.processos.push(dados);
 const ops=prepararEdicao(state.db,depois,state,state.db.usuarios[0]);
 const can=ops.find(o=>o.table==='fin_receb_clientes'&&o.insert),comp=ops.find(o=>o.table==='integracao_moradores'&&o.insert);
 assert.equal(can.key.id,registro);assert.equal(can.changes.codigo,dados.codigo);
 assert.equal(comp.changes.referencia_tabela,'fin_receb_clientes');assert.equal(comp.changes.referencia_id,registro);
 assert.ok(ops.indexOf(can)<ops.indexOf(comp));
});
test('após criação e releitura do vínculo real a edição sucessora mantém a ficha exata e não duplica',()=>{
 const {base,dados,registro}=cenario();
 base.fin_receb_clientes.push({id:registro,municipio_id:dados.municipioId,remessa_id:dados.remessaId,codigo:dados.codigo,nome:dados.requerente.nome,ativo:true});
 base.integracao_moradores=[{colecao:'processos',registro_id:registro,criado_por:id(1),referencia_tabela:'fin_receb_clientes',referencia_id:registro,dados:{nucleoId:''}}];
 const state=projetar(base,blank()), novo=structuredClone(state.db);
 novo.processos.find(r=>r.id===registro).requerente.telefone='Telefone fictício';
 const ops=prepararEdicao(state.db,novo,state,state.db.usuarios[0]);
 assert.ok(!ops.some(o=>o.insert));
 assert.equal(ops.find(o=>o.table==='integracao_moradores').key.registro_id,registro);
 assert.equal(ops.find(o=>o.table==='integracao_moradores').changes.dados.requerente.telefone,'Telefone fictício');
});

test('primeiro complemento de cliente canônico já existente não é bloqueado',()=>{
 const {state}=cenario(), novo=structuredClone(state.db), cliente=novo.processos[0];
 cliente.requerente.telefone='Telefone fictício';
 const ops=prepararEdicao(state.db,novo,state,state.db.usuarios[0]);
 assert.ok(!ops.some(o=>o.table==='fin_receb_clientes'&&o.insert));
 const comp=ops.find(o=>o.table==='integracao_moradores'&&o.insert);
 assert.equal(comp.changes.referencia_tabela,'fin_receb_clientes');
 assert.equal(comp.changes.referencia_id,cliente.id);
});
test('processador conserva intenção órfã e não inicia envio, fixação, recibo nem releitura',async()=>{
 const {state,dados}=cenario(), antes=structuredClone(state.db);
 antes.processos.push(dados);
 const depois=structuredClone(antes);
 depois.processos.at(-1).requerente.telefone='Fictício';
 const item={conta:'fixture',id:'pedido-fixture',pedido:'pedido-fixture',fase:'preparacao',estado:'pendente_local',original:{modulo:'processos',intencao:{edicoes:[{colecao:'processos',id:dados.id,antes:{existe:true,valor:dados},depois:{existe:true,valor:depois.processos.at(-1)}}],arquivos:{}}}};
 const original=structuredClone(item.original);let hits=0, erro;
 const nao=()=>{hits++;throw new Error('Não deve chamar');};
 const fila={reservar:async()=>item,fixarPayload:nao,registrarEnvio:nao,registrarRecibo:nao,confirmarLeitura:nao,registrarFalha:async(_i,e)=>{erro=classificarFalha(e);}};
 await assert.rejects(processarIntencao(fila,{conta:item.conta,dono:'fixture',sessaoAtual:()=>true,
  preparar:async()=>({operacoes:prepararEdicao(antes,depois,state,state.db.usuarios[0]),sent:{}}),
  enviar:nao,consultarRecibo:nao,reler:nao}),{code:'CLIENTE_SEM_VINCULO_CANONICO'});
 assert.equal(hits,0);
 assert.equal(erro.categoria,'validacao');
 assert.deepEqual(item.original,original);
});

test('payload fixado órfão só é bloqueado após a consulta; recibo verdadeiro segue para releitura sem envio',async()=>{
 const r=id(65), dados={remessaId:id(3),codigo:'TST01_065'};
 const op={table:'integracao_moradores',key:{colecao:'processos',registro_id:r},insert:true,changes:{dados,referencia_tabela:null,referencia_id:null}};
 for(const recibo of [null,{aliases:{},ticket:'fixture'}]){
  const item={conta:'fixture',id:'pedido-fixo',pedido:'pedido-fixo',fase:'recibo',estado:'resultado_desconhecido',payload:[op],preparado:{depois:{processos:[]}},original:{modulo:'processos'}};
  const original=structuredClone(item);
  const etapas=[];
  const fila={reservar:async()=>item,registrarEnvio:()=>{etapas.push('marcou envio');return item;},
   registrarRecibo:async(i,x)=>{etapas.push('recibo oficial');return {...i,recibo:x};},confirmarLeitura:async()=>etapas.push('confirmou releitura'),
   registrarFalha:async(_i,e)=>etapas.push(e.code)};
  const resultado=processarIntencao(fila,{conta:item.conta,dono:'fixture',sessaoAtual:()=>true,
   validarEnvio:i=>{etapas.push('validação');validarVinculoMoradoresDoEnvio(i.payload,i.preparado.depois);},
   consultarRecibo:async()=>{etapas.push('consultou recibo');return recibo;},enviar:async()=>etapas.push('ENVIADO'),reler:async()=>etapas.push('releu')});
  if(recibo){
   await resultado;assert.deepEqual(etapas,['consultou recibo','recibo oficial','releu','confirmou releitura']);
  }else{
   await assert.rejects(resultado,{code:'CLIENTE_SEM_VINCULO_CANONICO'});
   assert.deepEqual(etapas,['consultou recibo','validação','CLIENTE_SEM_VINCULO_CANONICO']);
  }
  assert.deepEqual(item,original);
 }
});
test('valida somente moradores de remessa ou UUID, preservando alias confirmado e legado privado sem identificação',()=>{
 const row={table:'integracao_moradores',key:{colecao:'processos',registro_id:'legado'},insert:true,changes:{dados:{etapa:2}}};
 assert.doesNotThrow(()=>validarVinculoMoradoresDoEnvio([row],{}));
 const after={processos:[{id:'legado',financeiroRef:id(45)}]},valido={...row,changes:{...row.changes,referencia_tabela:'fin_receb_clientes',referencia_id:id(45)}};
 assert.doesNotThrow(()=>validarVinculoMoradoresDoEnvio([valido],after));
 for(const alteracao of [{referencia_id:id(66)},{referencia_tabela:'processos_kanban'},{referencia_id:null}]){
  assert.throws(()=>validarVinculoMoradoresDoEnvio([{...valido,changes:{...valido.changes,...alteracao}}],after),{code:'CLIENTE_SEM_VINCULO_CANONICO'});
 }
 assert.throws(()=>validarVinculoMoradoresDoEnvio([{...row,changes:{dados:{remessaId:id(3),codigo:'TST01_065'}}}],{}),{code:'CLIENTE_SEM_VINCULO_CANONICO'});
});

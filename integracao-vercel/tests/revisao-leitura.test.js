import test from 'node:test';
import assert from 'node:assert/strict';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {extrairIntencao} from '../src/intencoes-edicao.js';
import {divergenciasConfirmacao} from '../src/confirmacao-mutacoes.js';
import {revisarLeitura} from '../src/revisao-leitura.js';

const before={metas:[{id:'m',titulo:'base',observacoes:'base'}],auditoria:[]};
const after={metas:[{id:'m',titulo:'local',observacoes:'base'}],auditoria:[]};
const edit=extrairIntencao(before,after);
function ambiente({edicoes=edit,db=before,sent={},base={integracao_arquivos:[]},recibo=true,estado='confirmado_aguardando_leitura'}={}){
 let item={conta:'a',id:'i',estado,original:{intencao:{edicoes,arquivos:structuredClone(sent)}},preparado:{antes:edicoes.length?before:{},depois:edicoes.length?after:{},sent},payload:[],...(recibo?{recibo:{aliases:{}}}:{}),erro:{codigo:'LEITURA_DIVERGENTE'}};
 let state={db:structuredClone(db),base:structuredClone(base)},ativo=true;
 const calls={envios:0,decisoes:0,retomadas:0,cache:0};
 const fila={listar:async()=>[structuredClone(item)],fechar:()=>{},retomar:async()=>{calls.retomadas++;},aceitarRemoto:async()=>{calls.decisoes++;item.estado='dispensado';item.decisao={tipo:'manter_remoto'};},aceitarLeituraAtual:async(conta,id,decisao)=>{assert.equal(conta,'a');assert.equal(id,'i');calls.decisoes++;item.estado='confirmado';item.decisao={tipo:'aceitar_estado_atual_apos_recibo',...decisao};}};
 const diario=criarDiarioCompartilhado({conta:'a',ativo:()=>ativo,fila,carregar:async()=>structuredClone(state),preparar:async()=>({operacoes:[]}),enviar:async()=>{calls.envios++;},consultarRecibo:async()=>null,confirmar:async()=>{},aceitarLeitura:async()=>{calls.cache++;},atualizou:()=>{}});
 return {diario,calls,item:()=>item,setDb:db=>{state.db=structuredClone(db);},setBase:base=>{state.base=structuredClone(base);},encerrar:()=>{ativo=false;}};
}

test('recibo com retorno ao valor base é divergência, mesmo sem conflito de três versões',async()=>{
 const a=ambiente();try{
  const p=await a.diario.previa('i');assert.equal(p.conflitos.length,0);assert.deepEqual(p.leitura.campos,[{caminho:['metas','m','titulo'],base:'base',local:'local',remoto:'base'}]);
  const original=structuredClone(a.item().original);await a.diario.reconhecerLeitura('i');
  assert.deepEqual(a.calls,{envios:0,decisoes:1,retomadas:0,cache:1});assert.deepEqual(a.item().original,original);assert.equal(a.item().estado,'confirmado');
 }finally{a.diario.fechar();}
});
test('repetir somente leitura nunca aceita divergência ou reenvia',async()=>{
 const a=ambiente({db:{metas:[{id:'m',titulo:'terceiro',observacoes:'base'}]}});try{await a.diario.previa('i');await a.diario.resolver('i',{});assert.deepEqual(a.calls,{envios:0,decisoes:0,retomadas:1,cache:0});}finally{a.diario.fechar();}
});
test('recibo só de arquivo pode ser revisto sem edição de dados',async()=>{
 const sent={file:{key:'integracao-prf-modelo-v4',value:'original preservado',version:'v1',expected:null}};
 const a=ambiente({edicoes:[],db:{},sent});try{
  const p=await a.diario.previa('i');assert.equal(p.leitura.campos.length,0);assert.equal(p.leitura.arquivos.length,1);assert.equal(p.leitura.arquivos[0].atual,null);
  await a.diario.reconhecerLeitura('i');assert.equal(a.calls.envios,0);assert.deepEqual(a.item().decisao.arquivosAtual,{file:null});assert.deepEqual(a.item().original.intencao.arquivos,sent);
 }finally{a.diario.fechar();}
});
test('descarte explícito de arquivo recusado reconcilia cache mantendo original arquivado',async()=>{
 const sent={file:{key:'integracao-prf-modelo-v4',value:'original preservado',version:'v1',expected:null}};
 const a=ambiente({edicoes:[],db:{},sent,recibo:false,estado:'bloqueado_validacao'});try{
  a.item().erro={categoria:'validacao',rejeicaoConfirmada:true};await a.diario.previa('i');await a.diario.descartar('i');
  assert.deepEqual(a.calls,{envios:0,decisoes:1,retomadas:0,cache:1});assert.equal(a.item().estado,'dispensado');assert.deepEqual(a.item().original.intencao.arquivos,sent);
 }finally{a.diario.fechar();}
});
test('nova alteração relevante entre prévia e aceite bloqueia decisão',async()=>{
 const a=ambiente();try{await a.diario.previa('i');a.setDb({metas:[{id:'m',titulo:'alterado de novo'}]});await assert.rejects(a.diario.reconhecerLeitura('i'),/mudaram/);assert.equal(a.calls.decisoes,0);}finally{a.diario.fechar();}
});
test('arquivo mudado entre prévia e aceite bloqueia decisão',async()=>{
 const a=ambiente({edicoes:[],db:{},sent:{file:{key:'k',value:'local',version:'v'}}});try{await a.diario.previa('i');a.setBase({integracao_arquivos:[{registro_id:'file',dados:{hash:'nova leitura'}}]});await assert.rejects(a.diario.reconhecerLeitura('i'),/mudaram/);assert.equal(a.calls.decisoes,0);}finally{a.diario.fechar();}
});
test('mudança em outra entidade não bloqueia aceite dos valores mostrados',async()=>{
 const a=ambiente();try{await a.diario.previa('i');a.setDb({...before,metas:[...before.metas,{id:'outra',titulo:'novo'}]});await a.diario.reconhecerLeitura('i');assert.equal(a.calls.decisoes,1);}finally{a.diario.fechar();}
});
test('resultado desconhecido, sessão alterada e ausência de prévia não permitem aceite',async()=>{
 const a=ambiente({recibo:false,estado:'resultado_desconhecido'}),b=ambiente();try{
  await a.diario.previa('i');await assert.rejects(a.diario.reconhecerLeitura('i'),/recibo/);
  await assert.rejects(b.diario.reconhecerLeitura('i'),/prévia/);await b.diario.previa('i');b.encerrar();await assert.rejects(b.diario.reconhecerLeitura('i'),{code:'SESSAO_ALTERADA'});
  assert.equal(a.calls.decisoes+b.calls.decisoes,0);
 }finally{a.diario.fechar();b.diario.fechar();}
});
test('overlay mostra campo remoto conflitante e mantém mudança local compatível',async()=>{
 const local=structuredClone(after);local.metas[0].observacoes='nota local';
 const remote={metas:[{id:'m',titulo:'novo remoto',observacoes:'base'}]};
 const a=ambiente({edicoes:extrairIntencao(before,local),db:remote,recibo:false,estado:'bloqueado_conflito'});try{
  await a.diario.atualizar();assert.deepEqual(a.diario.materializar(remote).metas,[{id:'m',titulo:'novo remoto',observacoes:'nota local'}]);assert.equal(a.item().original.intencao.edicoes[0].depois.valor.titulo,'local');
 }finally{a.diario.fechar();}
});
test('recibo divergente não reapresenta o valor enviado como atual',async()=>{
 const a=ambiente();try{await a.diario.atualizar();assert.deepEqual(a.diario.materializar(before),before);assert.equal(a.item().original.intencao.edicoes[0].depois.valor.titulo,'local');}finally{a.diario.fechar();}
});
test('diagnóstico usa exatamente os mesmos adaptadores de confirmação',async()=>{
 const b={nucleos:[{id:'n',etapaIniciadaEm:'2026-01-01'}]},d={nucleos:[{id:'n',etapaIniciadaEm:'2026-01-02T12:00:00Z'}]},r={nucleos:[{id:'n',etapaIniciadaEm:'2026-01-02T09:00:00-03:00'}]};
 assert.deepEqual(divergenciasConfirmacao(b,d,r),[]);
 assert.equal((await revisarLeitura({conta:'a',recibo:{},preparado:{antes:b,depois:d,sent:{}}},{db:r,base:{}})).campos.length,0);
});

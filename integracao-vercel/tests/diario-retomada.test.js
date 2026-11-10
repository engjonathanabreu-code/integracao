import test from 'node:test';
import assert from 'node:assert/strict';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';

function ambiente({estado='resultado_desconhecido',edicoes=[]}={}){
 let item={conta:'fixture',id:'item',estado,original:{intencao:{edicoes,arquivos:{}}}},remoto={},ativo=true,aoLer=()=>{};
 const calls={leituras:0,retomadas:0,decisoes:0,envios:0};
 const fila={listar:async()=>item?[structuredClone(item)]:[],fechar:()=>{},retomar:async()=>{calls.retomadas++;if(!item||item.estado.startsWith('bloqueado'))throw Object.assign(Error('Revisão necessária'),{code:'REVISAO_NECESSARIA'});return structuredClone(item);},aceitarRemoto:async()=>{calls.decisoes++;if(!item||!item.estado.startsWith('bloqueado'))throw Object.assign(Error('Revisão mudou'),{code:'REVISAO_NECESSARIA'});}};
 const diario=criarDiarioCompartilhado({conta:'fixture',fila,ativo:()=>ativo,carregar:async()=>{calls.leituras++;await aoLer();return {db:structuredClone(remoto)};},preparar:async()=>({operacoes:[]}),enviar:async()=>{calls.envios++;},consultarRecibo:async()=>null,confirmar:async()=>{},atualizou:()=>{}});
 return {diario,calls,setEstado:v=>{item.estado=v;},setRemoto:v=>{remoto=v;},setAoLer:fn=>{aoLer=fn;},remover:()=>{item=null;},encerrar:()=>{ativo=false;}};
}
for(const estado of ['confirmado','substituido','dispensado'])test(`prévia antiga de pendência ${estado} termina sem reler ou retomar`,async()=>{
 const a=ambiente();try{await a.diario.previa('item');a.setEstado(estado);await a.diario.resolver('item',{});assert.deepEqual(a.calls,{leituras:1,retomadas:0,decisoes:0,envios:0});assert.equal(a.diario.itens()[0].estado,estado);}finally{a.diario.fechar();}
});
test('pendência ausente continua como erro, sem concluir outra conta',async()=>{
 const a=ambiente();try{await a.diario.previa('item');a.remover();await assert.rejects(a.diario.resolver('item',{}),{code:'REVISAO_NECESSARIA'});assert.equal(a.calls.envios,0);}finally{a.diario.fechar();}
});
test('nova recusa determinística não é mascarada por prévia antiga',async()=>{
 const a=ambiente();try{await a.diario.previa('item');a.setEstado('bloqueado_validacao');await assert.rejects(a.diario.resolver('item',{}),{code:'REVISAO_NECESSARIA'});assert.equal(a.calls.envios,0);}finally{a.diario.fechar();}
});
test('decisão originalmente bloqueada mantém a guarda contra decisão de outra aba',async()=>{
 const a=ambiente({estado:'bloqueado_conflito'});try{await a.diario.previa('item');a.setEstado('dispensado');await assert.rejects(a.diario.resolver('item',{}),{code:'REVISAO_NECESSARIA'});assert.equal(a.calls.decisoes,1);assert.equal(a.calls.envios,0);}finally{a.diario.fechar();}
});
test('mudança remota relevante ainda exige nova prévia',async()=>{
 const edicoes=[{colecao:'metas',id:'meta',antes:{existe:true,valor:{id:'meta',titulo:'antes'}},depois:{existe:true,valor:{id:'meta',titulo:'local'}}}];
 const a=ambiente({edicoes});try{a.setRemoto({metas:[{id:'meta',titulo:'antes'}]});await a.diario.previa('item');a.setRemoto({metas:[{id:'meta',titulo:'novo'}]});await assert.rejects(a.diario.resolver('item',{}),/Os dados mudaram/);assert.equal(a.calls.retomadas,0);assert.equal(a.calls.envios,0);}finally{a.diario.fechar();}
});
test('sessão encerrada não transforma item concluído em sucesso',async()=>{
 const a=ambiente();try{await a.diario.previa('item');a.setEstado('confirmado');a.encerrar();await assert.rejects(a.diario.resolver('item',{}),{code:'SESSAO_ALTERADA'});assert.equal(a.calls.retomadas,0);}finally{a.diario.fechar();}
});

test('conclusão durante a releitura de delta real não aparece como nova divergência',async()=>{
 const edicoes=[{colecao:'metas',id:'meta',antes:{existe:true,valor:{id:'meta',titulo:'antes'}},depois:{existe:true,valor:{id:'meta',titulo:'local'}}}];
 const a=ambiente({edicoes});try{a.setRemoto({metas:[{id:'meta',titulo:'antes'}]});await a.diario.previa('item');a.setAoLer(()=>{a.setEstado('confirmado');a.setRemoto({metas:[{id:'meta',titulo:'local'}]});});await a.diario.resolver('item',{});assert.deepEqual(a.calls,{leituras:2,retomadas:0,decisoes:0,envios:0});assert.equal(a.diario.itens()[0].estado,'confirmado');}finally{a.diario.fechar();}
});

for(const estado of ['confirmado','substituido','dispensado'])test(`abrir item ${estado} retorna prévia vazia sem criar erro de sincronização`,async()=>{
 const a=ambiente({estado});try{assert.equal(await a.diario.previa('item'),null);assert.deepEqual(a.calls,{leituras:0,retomadas:0,decisoes:0,envios:0});assert.equal(a.diario.itens()[0].estado,estado);}finally{a.diario.fechar();}
});
test('abrir item ausente não é tratado como confirmação de sucesso',async()=>{
 const a=ambiente();try{a.remover();await assert.rejects(a.diario.previa('item'),{code:'REVISAO_NECESSARIA'});assert.equal(a.calls.leituras,0);}finally{a.diario.fechar();}
});

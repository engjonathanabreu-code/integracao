import test from 'node:test';
import assert from 'node:assert/strict';
import {alteracoesConfirmadas,estruturaReleituraNotificacoesLegadas,releituraNotificacoesLegadas,verificarReleituraNotificacoesLegadas} from '../src/confirmacao-mutacoes.js';
import {aplicarIntencao,extrairIntencao,recortarIntencao} from '../src/intencoes-edicao.js';
import {complementos} from '../src/dados-compartilhados.js';
const dono='dono-original';
const antiga={id:'antiga',rota:{pag:'metas'},titulo:'Conteúdo antigo'};
const avisos=[{id:'nova-1',rota:{pag:'metas',ref:'meta'},titulo:'Conteúdo 1'}, {id:'nova-2',titulo:'Conteúdo 2',lidaPor:[]}];
function fixture(table='integracao_notificacoes'){
 const payload=avisos.map(dados=>({table,key:{colecao:'notificacoes',registro_id:dados.id},insert:true,changes:{dados,criado_por:dono,referencia_tabela:null,referencia_id:null}}));
 const edicoes=[{colecao:'notificacoes',id:antiga.id,antes:{existe:true,valor:antiga},depois:{existe:false}},
 ...avisos.map(valor=>({colecao:'notificacoes',id:valor.id,antes:{existe:false},depois:{existe:true,valor}}))];
 const rows=payload.map(o=>({...o.key,...o.changes}));
 return structuredClone({item:{conta:dono,recibo:{aliases:{}},payload,original:{modulo:'notificacoes',intencao:{edicoes,arquivos:{}}},preparado:{antes:{notificacoes:[antiga]},depois:{notificacoes:avisos},sent:{}}},rows,base:{integracao_notificacoes:rows,integracao_complementos:rows.map(r=>({...r,_tabela:'integracao_notificacoes'}))}});
}
test('legado confirma ambos inserts, sem exigir exclusão de aviso antigo',()=>{
 const {item,base}=fixture(),{antes,depois}=item.preparado;
 // O corte local nunca é enviado: com o payload em mãos a confirmação comum já o aceita;
 // sem o payload (ou com a remoção enviada) continua divergente.
 assert.equal(alteracoesConfirmadas(antes,depois,{notificacoes:[antiga,...avisos]},item.recibo.aliases,item.payload),true);
 assert.equal(alteracoesConfirmadas(antes,depois,{notificacoes:[antiga,...avisos]},item.recibo.aliases,[]),false);
 assert.equal(alteracoesConfirmadas(antes,depois,{notificacoes:[antiga,avisos[0]]},item.recibo.aliases,item.payload),false);
 assert.equal(estruturaReleituraNotificacoesLegadas(item,dono),true);
 assert.equal(releituraNotificacoesLegadas(item,base,dono),true);
});
test('complemento antigo pode estar na própria tabela ou migrado para a tabela canônica',()=>{
 const {item,rows,base}=fixture('integracao_complementos');
 assert.equal(releituraNotificacoesLegadas(item,base,dono),true);
 assert.equal(releituraNotificacoesLegadas(item,{integracao_notificacoes:[],integracao_complementos:rows},dono),true);
 assert.equal(releituraNotificacoesLegadas(item,{...base,integracao_complementos:rows},dono),false);
});
test('exige metadados e conteúdo atuais exatos, IDs e número de inserts',()=>{
 for(const change of [
  c=>c.base.integracao_notificacoes.pop(),
  c=>c.base.integracao_notificacoes.push(c.base.integracao_notificacoes[0]),
  c=>{c.base.integracao_notificacoes[0].registro_id='outra';},
  c=>{c.base.integracao_notificacoes[0].dados={...avisos[0],rota:{pag:'outra'}};},
  c=>{c.base.integracao_notificacoes[0].criado_por='outra';},
  c=>{c.base.integracao_notificacoes[0].referencia_id='outra';},
  c=>c.item.payload.pop(),
  c=>{c.item.payload[1]=c.item.payload[0];},
 ]){
  const c=fixture();change(c);
  assert.equal(releituraNotificacoesLegadas(c.item,c.base,dono),false);
 }
});
test('não generaliza exceção para ausência de recibo, alias, anexo, efeito ou remoção enviada',()=>{
 for(const change of [
  i=>delete i.recibo,i=>{i.recibo.aliases={um:'outro'};},i=>{i.recibo.protocoloRecibo=1;},
  i=>{i.conta='outra';},i=>{i.preparado.sent.foto={};},i=>{i.original.intencao.arquivos.foto={};},
  i=>{i.preparado.antes.auditoria=[{id:'efeito'}];},
  i=>{i.preparado.antes.metas=[{id:'meta'}];i.preparado.depois.metas=[];},
  i=>{i.original.intencao.edicoes[0].colecao='metas';},
  i=>{i.payload.push({table:'integracao_notificacoes',key:{colecao:'notificacoes',registro_id:'antiga'},remove:true});},
  i=>{i.payload[0].table='integracao_auditoria';},
  i=>{i.payload[0].expected=null;},
 ]){
  const {item,base}=fixture();change(item);
  assert.equal(estruturaReleituraNotificacoesLegadas(item,dono),false);
  assert.equal(releituraNotificacoesLegadas(item,base,dono),false);
 }
});

test('consulta autorizada recebe pedido e payload exatos; sem retorno igual não confirma',async()=>{
 const {item,base}=fixture();item.pedido='pedido-exato';
 let chamadas=0;
 const lookup=recibo=>async i=>{chamadas++;assert.equal(i,item);assert.equal(i.pedido,'pedido-exato');assert.equal(i.payload.length,2);return recibo;};
 assert.equal(await verificarReleituraNotificacoesLegadas(item,base,dono,lookup({aliases:{}})),true);
 assert.equal(await verificarReleituraNotificacoesLegadas(item,base,dono,lookup(null)),false);
 assert.equal(await verificarReleituraNotificacoesLegadas(item,base,dono,lookup({aliases:{outro:'alias'}})),false);
 assert.equal(await verificarReleituraNotificacoesLegadas(item,base,'outra',lookup({aliases:{}})),false);
 assert.equal(chamadas,3);
 await assert.rejects(verificarReleituraNotificacoesLegadas(item,base,dono,async()=>{throw Error('Rede');}),/Rede/);
});

function fixtureTipada(){
 const antigaCompartilhada={...antiga,_compartilhado:true};
 const antes={notificacoes:[...Array.from({length:299},(_,i)=>({id:`anterior-${i}`})),antigaCompartilhada]};
 const nova=avisos[0];
 const edicoes=extrairIntencao(antes,{notificacoes:[nova,...antes.notificacoes].slice(0,300)});
 const {dados:depois,conflitos}=aplicarIntencao(antes,edicoes);
 assert.deepEqual(conflitos,[]);
 const payload=complementos(antes,depois,{base:{integracao_complementos:[]},bindings:[]},{erpRef:dono});
 assert.equal(payload.length,1);
 assert.equal(payload[0].insert,true);
 const op=payload[0],pedido='pedido-original';
 const row={...op.key,...op.changes,updated_at:'2026-11-23T15:04:12.58888+00:00'};
 const recibo={protocoloRecibo:1,aliases:{},pedido,confirmadoEm:row.updated_at,resultados:[{
   indice:0,versao:'a'.repeat(32),tipo:'registro',tabela:op.table,chave:structuredClone(op.key),removido:false,disponivel:true,canonico:structuredClone(row)
 }]};
 return {item:{conta:dono,pedido,payload,recibo,original:{modulo:'notificacoes',intencao:{edicoes,arquivos:{}}},
   preparado:{antes:recortarIntencao(antes,edicoes),depois:recortarIntencao(depois,edicoes),sent:{}}},
   base:{integracao_notificacoes:[row],integracao_complementos:[{...row,_tabela:'integracao_notificacoes'}]},
   remoto:{notificacoes:[antigaCompartilhada,nova]}};
}

test('recibo tipado confirma somente a inserção do corte local preservado, sem reenviar',async()=>{
 const {item,base,remoto}=fixtureTipada();
 assert.equal(alteracoesConfirmadas(item.preparado.antes,item.preparado.depois,remoto,item.recibo.aliases,item.payload),true);
 assert.equal(alteracoesConfirmadas(item.preparado.antes,item.preparado.depois,remoto,item.recibo.aliases,[...item.payload,{table:'integracao_notificacoes',key:{colecao:'notificacoes',registro_id:'antiga'},remove:true}]),false);
 assert.equal(estruturaReleituraNotificacoesLegadas(item,dono),true);
 assert.equal(await verificarReleituraNotificacoesLegadas(item,base,dono,async atual=>{
   assert.equal(atual.pedido,item.pedido);assert.equal(atual.payload,item.payload);
   return structuredClone(item.recibo);
 }),true);
 assert.equal(await verificarReleituraNotificacoesLegadas(item,base,dono,async()=>null),false);
 assert.equal(await verificarReleituraNotificacoesLegadas(item,base,dono,async()=>({...item.recibo,confirmadoEm:'2026-11-23T15:09:10+00:00'})),false);
});

test('recibo tipado não libera corte sem prova integral de pedido, escopo e linha atual',()=>{
 const casos=[
  c=>{c.item.recibo.pedido='outro';},
  c=>{c.item.recibo.aliases={antiga:'outra'};},
  c=>{c.item.recibo.resultados[0].disponivel=false;},
  c=>{c.item.recibo.resultados[0].removido=true;},
  c=>{c.item.recibo.resultados[0].versao='errada';},
  c=>{c.item.recibo.resultados[0].canonico.criado_por='outra';},
  c=>{c.item.recibo.resultados.push(c.item.recibo.resultados[0]);},
  c=>{c.item.original.intencao.edicoes.find(e=>!e.depois.existe).antes.valor._compartilhado=false;},
  c=>{c.item.original.intencao.arquivos.foto={};},
  c=>{c.item.preparado.antes.metas=[{id:'meta'}];c.item.preparado.depois.metas=[];},
  c=>{c.item.payload.push({table:'integracao_notificacoes',key:{colecao:'notificacoes',registro_id:'antiga'},remove:true});},
  c=>{c.base.integracao_notificacoes[0].criado_por='outra';},
  c=>{c.base.integracao_notificacoes[0].updated_at='2026-11-23T15:09:10+00:00';},
  c=>{c.base.integracao_notificacoes[0].dados.titulo='mudou';},
  c=>{c.base.integracao_notificacoes=[];},
  c=>{c.base.integracao_notificacoes.push(c.base.integracao_notificacoes[0]);},
 ];
 for(const change of casos){const ctx=fixtureTipada();change(ctx);assert.equal(releituraNotificacoesLegadas(ctx.item,ctx.base,dono),false,change.toString());}
});

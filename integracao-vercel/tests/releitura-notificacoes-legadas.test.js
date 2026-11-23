import test from 'node:test';
import assert from 'node:assert/strict';
import {alteracoesConfirmadas,estruturaReleituraNotificacoesLegadas,releituraNotificacoesLegadas,verificarReleituraNotificacoesLegadas} from '../src/confirmacao-mutacoes.js';
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
 assert.equal(alteracoesConfirmadas(antes,depois,{notificacoes:[antiga,...avisos]},item.recibo.aliases,item.payload),false);
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

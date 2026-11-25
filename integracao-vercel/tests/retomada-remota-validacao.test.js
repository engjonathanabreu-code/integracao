import test from 'node:test';
import assert from 'node:assert/strict';
import {elegivelRetomadaCrm as elegivel} from '../src/retomada-remota-validacao.js';
const id=n=>'12345678-1234-4234-8234-'+String(n).padStart(12,'0');
const ctx=()=>{
 const pedido=id(1),conta=id(2),revisao='a'.repeat(64),idCad=id(3),idLog=id(4);
 const a={id:idCad,requerente:{statusCRM:'Cliente novo',nome:'Teste'},qualificacao:{por:'1',atualizadoEm:'1',textos:{simples:'Teste'}}};
 const b={...a,requerente:{...a.requerente,statusCRM:'Cliente Ativo'},qualificacao:{...a.qualificacao,por:'2',atualizadoEm:'2'}};
 const log={id:idLog,processoId:idCad,usuarioId:'erp_'+conta,acao:'Cadastro alterado'};
 const edicoes=[{colecao:'processos',id:idCad,antes:{existe:true,valor:a},depois:{existe:true,valor:b}},
   {colecao:'auditoria',id:idLog,antes:{existe:false},depois:{existe:true,valor:log}}];
 const payload=[{table:'integracao_moradores',key:{colecao:'processos',registro_id:idCad},expected:{dados:a},changes:{dados:b}},
   {table:'integracao_auditoria',key:{colecao:'auditoria',registro_id:idLog},insert:true,changes:{criado_por:conta,dados:log}}];
 const item={id:pedido,pedido,conta,checksum:revisao,estado:'bloqueado_validacao',fase:'envio',enviadoEm:50,preparado:{sent:{}},payload,
   erro:{codigo:'P0001',status:400,categoria:'validacao',fase:'envio',rejeicaoConfirmada:true},
   original:{modulo:'processos',intencao:{edicoes,arquivos:{}}}};
 return {item,args:{pedido,conta,revisao,agora:100},a,b,log};
};
test('o vínculo, a revisão e o formato exato do status comercial são obrigatórios',()=>{
 const c=ctx(),anterior=structuredClone(c.item);
 assert.equal(elegivel(c.item,c.args),true);
 assert.deepEqual(c.item,anterior);
 for(const k of ['conta','pedido','revisao'])assert.equal(elegivel(c.item,{...c.args,[k]:id(99)}),false);
});
test('não retoma recibo, resultado incerto, preparação, conflito, lease ou substituição anterior',()=>{
 for(const f of [
 c=>{c.item.recibo={ok:true}},c=>{c.item.erro.rejeicaoConfirmada=false},
 c=>{c.item.erro.status=403},c=>{c.item.erro.codigo='PT409'},c=>{c.item.leaseAte=120},
 c=>{delete c.item.enviadoEm},c=>{c.item.substituidaPor=id(100)},
 c=>{c.item.fase='preparacao'},c=>{c.item.estado='resultado_desconhecido'}
 ]){const c=ctx();f(c);assert.equal(elegivel(c.item,c.args),false);}
});
test('nega anexo, dado pessoal adicional, outro módulo, edição ou autoria',()=>{
 for(const f of [
 c=>{c.item.original.intencao.arquivos.foto={version:'x'}},c=>{c.item.preparado.sent.foto='x'},
 c=>{c.b.requerente.nome='Outra pessoa'},c=>{c.b.etapa=2},c=>{c.b.qualificacao.textos={simples:'Outro'}},
 c=>{c.log.usuarioId='erp_'+id(19)},c=>{c.item.payload[0].key.registro_id=id(90)},
 c=>{c.item.original.modulo='metas'},c=>{c.item.payload[0].delete=true}
 ]){const c=ctx();f(c);assert.equal(elegivel(c.item,c.args),false);}
});

test('a prévia lê somente pedido exato, exige ausência confirmada do recibo e checa a versão',async()=>{
 const {conferirRetomadaCrm:conferir}=await import('../src/retomada-remota-validacao.js');
 const c=ctx(),ordem=[];
 const o={item:c.item,alvo:c.args,verificar:()=>ordem.push('sessão'),
  revalidar:async()=>ordem.push('lease'),consultarRecibo:async()=>{ordem.push('recibo');return null},
  reler:async()=>{ordem.push('releitura');return {cadastro:c.a,auditoria:null}}};
 assert.deepEqual(await conferir(o),{codigo:'PREVIA_VALIDADA',registro:c.a.id,auditoria:c.log.id});
 assert.deepEqual(ordem.filter(x=>x!=='sessão'),['lease','recibo','lease','releitura','lease']);
 assert.equal((await conferir({...o,consultarRecibo:async()=>({ok:true})})).codigo,'REVISAO_NECESSARIA');
 assert.equal((await conferir({...o,consultarRecibo:async()=>undefined})).codigo,'REVISAO_NECESSARIA');
 assert.equal((await conferir({...o,reler:async()=>({cadastro:c.b,auditoria:null})})).codigo,'REVISAO_NECESSARIA');
 assert.equal((await conferir({...o,reler:async()=>({cadastro:c.a,auditoria:{id:c.log.id}})})).codigo,'REVISAO_NECESSARIA');
 let n=0;await assert.rejects(conferir({...o,revalidar:async()=>{if(++n===2)throw Error('revogado')}}),/revogado/);
});

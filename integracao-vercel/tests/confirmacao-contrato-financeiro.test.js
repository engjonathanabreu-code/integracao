import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
function caso(campo,coluna,digitado,gravado){
 const b=fixture();b.fin_receb_clientes[0][coluna]=400;
 const s=projetar(b,blank()),d=structuredClone(s.db);d.processos[0].comercial[campo]=digitado;
 const ops=prepararEdicao(s.db,d,s,s.db.usuarios[0]);
 const baseRemota=structuredClone(b);baseRemota.fin_receb_clientes[0][coluna]=gravado;
 const r=projetar(baseRemota,s.db);
 return {antes:s.db,depois:d,remoto:r.db,ops};
}
for(const [campo,coluna,digitado,gravado] of [['entrada','valor_entrada','500,00',500],['valorTotal','valor_global','1.234,50',1234.5],['valorParcela','valor_parcela','100.05',100.05],['parcelas','numero_parcelas','12',12],['diaVencimento','dia_vencimento','',null]]){
 test(`confirma contrato financeiro após encode/projeção: ${campo}`,()=>{
  const c=caso(campo,coluna,digitado,gravado);
  assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,{},c.ops),true);
 });
}
test('não confirma valor financeiro diferente nem recibo de outra linha/coluna',()=>{
 const c=caso('entrada','valor_entrada','500,00',501);
 assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,{},c.ops),false);
 const certo=caso('entrada','valor_entrada','500,00',500);
 assert.equal(alteracoesConfirmadas(certo.antes,certo.depois,certo.remoto,{},[]),false);
 const outra=certo.ops.map(o=>({...o,key:{id:id(99)}}));
 assert.equal(alteracoesConfirmadas(certo.antes,certo.depois,certo.remoto,{},outra),false);
 const diferente=certo.ops.map(o=>({...o,changes:{valor_entrada:501}}));
 assert.equal(alteracoesConfirmadas(certo.antes,certo.depois,certo.remoto,{},diferente),false);
});
test('não relaxa comparação de campos comerciais sem encoder',()=>{
 const c=caso('entrada','valor_entrada','500,00',500);
 c.depois.processos[0].comercial.observacoes='0500';c.remoto.processos[0].comercial.observacoes='500';
 assert.equal(alteracoesConfirmadas(c.antes,c.depois,c.remoto,{},c.ops),false);
});

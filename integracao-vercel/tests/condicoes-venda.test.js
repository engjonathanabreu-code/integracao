import test from 'node:test';
import assert from 'node:assert/strict';
import {atualizarCondicoes as editar,validarCondicoesVenda as validar,ultimaParcela} from '../src/condicoes-venda.js';
import {dadosContrato} from '../src/contrato-dados.js';
import {documentos} from './documentos-comerciais.fixture.js';
const base={modalidade:'Entrada e parcelas',valorTotal:'3500,00',entradaTipo:'valor',entrada:'500,00',parcelas:'20',valorParcela:'150,00',diaVencimento:'15'};
test('entrada em reais mantém valor exato ao editar o total; parcelas fecham saldo',()=>{
 let f=editar(base,'entrada','500,01');assert.equal(f.entrada,'500,01');assert.equal(f.valorParcela,'149,99');assert.equal(ultimaParcela(f),'150,18');assert.equal(validar(f),'');
 f=editar(f,'valorTotal','4000,00');assert.equal(f.entrada,'500,01');assert.equal(validar(f),'');
});
test('porcentagem recalcula entrada e conversão para reais preserva centavos',()=>{
 let f=editar(base,'entradaTipo','percentual');assert.equal(f.entrada,'500,00');
 f=editar(f,'entradaPercentual','10');assert.equal(f.entrada,'350,00');assert.equal(f.valorParcela,'157,50');
 f=editar(f,'valorTotal','4000,00');assert.equal(f.entrada,'400,00');
 f=editar(f,'entradaTipo','valor');f=editar(f,'valorTotal','5000,00');assert.equal(f.entrada,'400,00');assert.equal(validar(f),'');
});
test('modalidades sem entrada limpam valor anterior e validam saldo',()=>{
 const f=editar(base,'modalidade','Parcelado sem entrada');assert.equal(f.entrada,'');assert.equal(f.valorParcela,'175,00');assert.equal(validar(f),'');
 for(const entrada of ['-1','0','3500','4000','abc'])assert.ok(validar({...base,entrada}));
 for(const parcelas of ['0','2.5','1000'])assert.ok(validar({...base,parcelas}));
 assert.ok(validar({...base,valorParcela:'200'}));assert.equal(validar({modalidade:'Isento (REURB-S)'}),'');
});
test('contrato contém nove cláusulas, assinaturas e nenhum dado do morador original',()=>{
 const h=documentos.contrato;for(const palavra of ['PRIMEIRA','SEGUNDA','TERCEIRA','QUARTA','QUINTA','SEXTA','SÉTIMA','OITAVA','NONA'])assert.ok(h.includes('CLÁUSULA '+palavra));
 assert.match(h,/Testemunha 1/);assert.match(h,/Testemunha 2/);assert.doesNotMatch(h,/OSNILDO|069.665|ILH03_0889|\{\{/i);
 const d=dadosContrato({condicoes:base,nome:'Nome teste',cpf:'000',dataExtenso:'Data teste',pagamento:'Texto teste'});assert.match(d.valorAlteracaoContrato,/1.050,00/);assert.match(d.precoContrato,/cláusula quinta/);
 assert.doesNotMatch(dadosContrato({nome:'<img src=x>',condicoes:base}).assinatura_contrato,/<img/);
});

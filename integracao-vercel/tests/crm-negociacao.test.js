import test from 'node:test';import assert from 'node:assert/strict';
import {lerValorReais,prepararNegociacao,resumoNegociacao,formularioNegociacao} from '../src/crm-negociacao.js';
test('reais aceita formato brasileiro sem confundir milhares e rejeita valores inválidos',()=>{assert.equal(lerValorReais('R$ 1.234,56'),1234.56);assert.equal(lerValorReais('1500'),1500);for(const v of ['-1','0','12abc','1.23','1,234','Infinity'])assert.throws(()=>lerValorReais(v));});
test('formas de pagamento calculam descontos, entrada e saldo sem perder centavos',()=>{
 const a=prepararNegociacao({valor:'1.000,00',forma:'avista',desconto:'10'});assert.match(resumoNegociacao(a),/900,00/);
 const p=prepararNegociacao({valor:'100,00',forma:'parcelado',parcelas:'3'});assert.match(resumoNegociacao(p),/2 parcelas de R\$\s33,33 e a última de R\$\s33,34/);
 const e=prepararNegociacao({valor:'1.000,00',forma:'entrada_parcelas',entrada:'200',parcelas:'4'});assert.match(resumoNegociacao(e),/800,00 em 4 parcelas de R\$\s200,00/);assert.deepEqual(prepararNegociacao(formularioNegociacao(e)),e);
});
test('não salva negociação parcial, parcelas fracionadas ou percentuais inválidos',()=>{
 for(const f of [{valor:'100'},{valor:'100',forma:'parcelado',parcelas:'1.5'},{valor:'100',forma:'avista',desconto:'101'},{valor:'100',forma:'entrada_parcelas',entrada:'100',parcelas:'2'}])assert.throws(()=>prepararNegociacao(f));
 assert.equal(prepararNegociacao(formularioNegociacao({})).valor_total,null);
});

test('entrada aceita reais exatos sem arredondar para percentual e preserva leitura antiga',()=>{
 const d=prepararNegociacao({valor:'1.234,56',forma:'entrada_parcelas',entrada:'123,45',parcelas:'3'});
 assert.equal(d.entrada_valor,123.45);assert.equal(d.entrada_percentual,null);assert.match(resumoNegociacao(d),/123,45/);assert.match(resumoNegociacao(d),/1.111,11/);
 assert.equal(formularioNegociacao({valor_total:1000,entrada_percentual:20,forma_negociacao:"entrada_parcelas"}).entrada,'200,00');
 assert.equal(resumoNegociacao({valor_total:1000,entrada_percentual:20,forma_negociacao:'entrada_parcelas',parcelas:4}),resumoNegociacao(prepararNegociacao({valor:'1000',entrada:'200',forma:'entrada_parcelas',parcelas:'4'})));
});

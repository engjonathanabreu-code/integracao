import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {moedaExtenso,reaisPorExtenso,dadosContrato} from '../src/contrato-dados.js';
import {parseNum} from '../src/requisitos-moradores.js';
import {textoAcertoDistrato} from '../src/distrato.js';
import {ENTRADA_PARCELADA,descreverEntradaParcelada} from '../src/condicoes-venda.js';

// Trecho real do App.jsx: o extenso usado no contrato à vista e no distrato.
const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ctx={parseNum,reaisPorExtenso,ENTRADA_PARCELADA,descreverEntradaParcelada,textoAcertoDistrato,dataBR:v=>v.split('-').reverse().join('/')};
vm.createContext(ctx);
const trecho=ini=>fonte.slice(fonte.indexOf(ini),fonte.indexOf('\n}',fonte.indexOf(ini))+2);
vm.runInContext(fonte.slice(fonte.indexOf('const reais = (v) =>'),fonte.indexOf('function resumoCondicoes('))+trecho('function textoPagamento(')+trecho('function textoDevolucao(')
 +';this.extenso=porExtensoReais;this.pagamento=textoPagamento;this.devolucao=textoDevolucao;',ctx);

const casos=[
 ['6.000,00','seis mil reais'],['6000','seis mil reais'],['1,00','um real'],['1','um real'],['2,00','dois reais'],
 ['0,01','um centavo'],['0,50','cinquenta centavos'],['1,01','um real e um centavo'],['1.234,56','um mil duzentos e trinta e quatro reais e cinquenta e seis centavos'.replace('um mil','mil')],
 ['1.000,00','mil reais'],['1.500,00','mil e quinhentos reais'],['2.400,00','dois mil e quatrocentos reais'],['12.345,67','doze mil trezentos e quarenta e cinco reais e sessenta e sete centavos'],
 ['100,00','cem reais'],['101,10','cento e um reais e dez centavos'],['1.000.000,00','um milhão de reais'],['2.000.000,00','dois milhões de reais'],
 ['1.000.001,00','um milhão e um reais'],['1.500.000,00','um milhão e quinhentos mil reais'],
];
test('extenso em reais: inteiros, centavos, milhares, 1 real e 1 milhão',()=>{
 for(const [valor,esperado] of casos) assert.equal(reaisPorExtenso(valor),esperado,valor);
 assert.equal(reaisPorExtenso(''),'');assert.equal(reaisPorExtenso(null),'');assert.equal(reaisPorExtenso('abc'),'');
});
test('contrato à vista e distrato usam o mesmo extenso das outras modalidades',()=>{
 for(const [valor,esperado] of casos){
  assert.equal(ctx.extenso(valor),esperado,valor);
  // moedaExtenso é a função das modalidades parceladas: "R$ x (extenso)".
  assert.ok(moedaExtenso(valor).endsWith('('+esperado+')'),valor);
  assert.ok(ctx.pagamento({modalidade:'À vista',valorTotal:valor}).includes(moedaExtenso(valor)),valor);
  assert.ok(ctx.devolucao({tipo:'devolucao',valorDevolucao:valor,parcelas:'1'}).includes(moedaExtenso(valor)),valor);
  assert.ok(ctx.devolucao({tipo:'multa',valorMulta:valor,vencimentoMulta:'2026-12-10',formaMulta:'PIX'}).includes(moedaExtenso(valor)),valor);
 }
});
test('não sobra o formato numérico antigo no contrato à vista nem no distrato',()=>{
 const vista=ctx.pagamento({modalidade:'À vista',valorTotal:'6.000,00',primeiroVencimento:'2026-12-10'});
 assert.match(vista,/R\$\s6\.000,00 \(seis mil reais\) será pago à vista, até 10\/12\/2026\./);assert.doesNotMatch(vista,/6000,00 reais/);
 const d=dadosContrato({condicoes:{modalidade:'À vista',valorTotal:'6.000,00'},pagamento:vista,dataExtenso:'x',nome:'A',cpf:'1'});
 assert.match(d.pagamentoContrato,/seis mil reais/);assert.match(d.precoContrato,/seis mil reais/);
 const dist=ctx.devolucao({tipo:'devolucao',valorDevolucao:'1.250,50',parcelas:'1',formaDevolucao:'carne'});
 assert.match(dist,/\(mil duzentos e cinquenta reais e cinquenta centavos\) em parcela única/);assert.doesNotMatch(dist,/1250,50 reais/);
});
test('valor acima do alcance do extenso mantém o número, sem parênteses vazios',()=>{
 assert.equal(reaisPorExtenso('1.000.000.000,00'),'');
 assert.equal(ctx.extenso('1.000.000.000,00'),'1000000000,00 reais');
 assert.doesNotMatch(moedaExtenso('1.000.000.000,00'),/\(\)/);
});

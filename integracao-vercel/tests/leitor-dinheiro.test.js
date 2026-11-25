import test from 'node:test';
import assert from 'node:assert/strict';
import {lerDinheiro,numeroDinheiro,erroDinheiro,semPontoDeMilhar} from '../src/leitor-dinheiro.js';
import {atualizarCondicoes as editar,validarCondicoesVenda as validar,gravarCondicaoVenda,erroRestricoesCondicoes,ultimaParcela} from '../src/condicoes-venda.js';
import {codificarNumeroFinanceiro} from '../src/contrato-financeiro.js';
import {dadosContrato} from '../src/contrato-dados.js';
import {validarDistrato,textoAcertoDistrato} from '../src/distrato.js';
import {lerValorReais} from '../src/crm-negociacao.js';

test('formato brasileiro: ponto é milhar, vírgula é centavo',()=>{
 for(const [texto,valor] of [['15.000',15000],['1.500',1500],['15.000,50',15000.5],['15000',15000],['15,5',15.5],['15,50',15.5],['2400,00',2400],['1.234.567,89',1234567.89],['R$ 1.500,00',1500],[' 700 ',700],['0',0],['0,5',0.5]]){
  assert.equal(numeroDinheiro(texto),valor,texto);assert.equal(erroDinheiro(texto),'',texto);assert.equal(lerDinheiro(texto).centavos,Math.round(valor*100),texto);
 }
});
test('escrita ambígua ou inválida é recusada com mensagem, nunca adivinhada',()=>{
 for(const texto of ['1.5','1.50','1500.50','15.00','15.0000','1.5000','0.500','01.500','1,234','1,5,0','15.000.50','15,000.50','1.500,','.500',',50','-5','abc','12abc','1e3','Infinity','15 000']){
  const r=lerDinheiro(texto);assert.equal(r.ok,false,texto);assert.equal(r.valor,null,texto);assert.equal(numeroDinheiro(texto),null,texto);
  assert.match(erroDinheiro(texto,'Valor total'),/^Valor total: formato não reconhecido .*15\.000,00\.$/,texto);
 }
 for(const n of [NaN,Infinity])assert.equal(lerDinheiro(n).ok,false);
});
test('vazio não é erro nem zero; número já gravado não muda',()=>{
 for(const v of ['','   ',null,undefined]){assert.deepEqual(lerDinheiro(v),{ok:true,vazio:true,valor:null,centavos:null});assert.equal(erroDinheiro(v),'');}
 for(const n of [0,15,1.5,1500.5,15000,2400.55])assert.equal(numeroDinheiro(n),n);
});
test('texto gravado perde só o ponto de milhar',()=>{
 assert.equal(semPontoDeMilhar('15.000'),'15000');assert.equal(semPontoDeMilhar('R$ 15.000,50'),'15000,50');
 for(const v of ['2400,00','2400','1.5','',null,undefined,15000,1.5])assert.equal(semPontoDeMilhar(v),v);
});

const base={modalidade:'Entrada e parcelas',valorTotal:'15.000',entradaTipo:'valor',entrada:'1.500',parcelas:'10',valorParcela:'',diaVencimento:'10'};
test('15.000 de total com 1.500 de entrada calcula, valida e segue ao Financeiro como 15000 e 1500',()=>{
 const f=editar(base,'parcelas','10');
 assert.equal(f.valorParcela,'1350,00');assert.equal(ultimaParcela(f),'1350,00');assert.equal(validar(f),'');
 const r=gravarCondicaoVenda({},f,{atualizadoEm:'2026-01-01',por:'Teste'});
 assert.equal(r.comercial.valorTotal,'15000');assert.equal(r.comercial.entrada,'1500');assert.equal(r.comercial.valorParcela,'1350,00');
 assert.equal(codificarNumeroFinanceiro('valorTotal',r.comercial.valorTotal),15000);
 assert.equal(codificarNumeroFinanceiro('entrada',r.comercial.entrada),1500);
 assert.equal(codificarNumeroFinanceiro('valorParcela',r.comercial.valorParcela),1350);
 const v=gravarCondicaoVenda({},{modalidade:'À vista',valorTotal:'15.000,50'},{});
 assert.equal(v.comercial.valorTotal,'15000,50');assert.equal(codificarNumeroFinanceiro('valorTotal',v.comercial.valorTotal),15000.5);
});
test('texto que já estava gravado sem ponto continua idêntico ao gravar de novo',()=>{
 const f={modalidade:'Entrada e parcelas',valorTotal:'3500,00',entradaTipo:'valor',entrada:'500',parcelas:'20',valorParcela:'150,00',diaVencimento:'15'};
 const r=gravarCondicaoVenda({},f,{});
 for(const k of ['valorTotal','entrada','valorParcela','parcelas','diaVencimento'])assert.equal(r.comercial[k],f[k],k);
});
test('valor ambíguo em total, entrada ou parcela impede salvar e copiar, com o campo na mensagem',()=>{
 const ok=editar(base,'parcelas','10');
 assert.match(validar({...ok,valorTotal:'1.5'}),/^Valor total: formato não reconhecido/);
 assert.match(validar({...ok,entrada:'1500.50'}),/^Entrada: formato não reconhecido/);
 assert.match(validar({...ok,valorParcela:'1350.00'}),/^Valor da parcela: formato não reconhecido/);
 assert.match(validar({modalidade:'À vista',valorTotal:'15.00'}),/^Valor total: formato não reconhecido/);
 assert.match(erroRestricoesCondicoes({...ok,valorTotal:'1.5'}),/^Valor total: formato não reconhecido/);
 // Campo oculto pela modalidade não bloqueia nem é lido.
 assert.equal(validar({modalidade:'À vista',valorTotal:'15.000',entrada:'1.5',valorParcela:'9.9'}),'');
 assert.equal(validar({modalidade:'Isento (REURB-S)',valorTotal:'1.5'}),'');
 // Durante a digitação o cálculo automático não inventa parcela a partir de valor recusado.
 assert.equal(editar(ok,'valorTotal','15.0').valorParcela,'');
 assert.equal(editar({...ok,entrada:'1.5'},'entradaTipo','percentual').entradaPercentual,'');
 assert.equal(ultimaParcela({...ok,valorTotal:'1.5'}),'');
});
test('entrada parcelada recusa ponto decimal e aceita milhar',()=>{
 const plano={modalidade:'Com Entrada Parcelada',valorTotal:'15.000',parcelas:'10',valorParcela:'1.400,00',diaVencimento:'10',primeiroVencimento:'2027-01-10',parcelasEntrada:[{valor:'1.000',vencimento:'2026-12-10'}]};
 assert.equal(validar(plano),'');
 assert.ok(validar({...plano,valorTotal:'15000.00'}));
 assert.ok(validar({...plano,parcelasEntrada:[{valor:'1.5',vencimento:'2026-12-10'}]}));
});
test('contrato mostra 15.000 como quinze mil e deixa em branco o que não dá para ler',()=>{
 const f=editar(base,'parcelas','10');
 const d=dadosContrato({condicoes:f,nome:'Nome teste',cpf:'000',dataExtenso:'Data teste',pagamento:'Texto teste'});
 assert.match(d.precoContrato,/R\$\s15\.000,00 \(quinze mil reais\)/);assert.match(d.pagamentoContrato,/R\$\s1\.500,00/);
 const amb=dadosContrato({condicoes:{...f,valorTotal:'1.5'},nome:'Nome teste',cpf:'000',dataExtenso:'Data teste',pagamento:'Texto teste'});
 assert.doesNotMatch(JSON.stringify(amb),/1,50/);
 const num=dadosContrato({condicoes:{modalidade:'À vista',valorTotal:1500.5},nome:'Nome teste',cpf:'000',dataExtenso:'Data teste',pagamento:'Texto teste'});
 assert.match(JSON.stringify(num),/1\.500,50/);
});
test('distrato recusa valor ambíguo em multa, devolução e parcela',()=>{
 const multa={tipo:'multa',motivo:'Encerramento solicitado',valorMulta:'1.500',vencimentoMulta:'2026-10-10',formaMulta:'PIX'};
 assert.equal(validarDistrato(multa,numeroDinheiro),'');
 assert.match(validarDistrato({...multa,valorMulta:'1.5'},numeroDinheiro),/^Valor da multa: formato não reconhecido/);
 const dev={tipo:'devolucao',motivo:'Encerramento solicitado',valorDevolucao:'2.000',parcelas:'2',valorParcela:'1.000,00'};
 assert.equal(validarDistrato(dev,numeroDinheiro),'');
 assert.match(validarDistrato({...dev,valorDevolucao:'2000.00'},numeroDinheiro),/^Valor a devolver: formato não reconhecido/);
 assert.match(validarDistrato({...dev,valorParcela:'1000.00'},numeroDinheiro),/^Valor da parcela: formato não reconhecido/);
 // Valor de outro tipo de acerto fica oculto e não bloqueia.
 assert.equal(validarDistrato({...multa,valorDevolucao:'1.5'},numeroDinheiro),'');
 assert.match(textoAcertoDistrato(dev,v=>`R$ ${numeroDinheiro(v)}`,String,numeroDinheiro),/devolverá R\$ 2000 /);
});
test('negociação do CRM usa o mesmo leitor e mantém as recusas',()=>{
 assert.equal(lerValorReais('15.000'),15000);assert.equal(lerValorReais('R$ 15.000,50'),15000.5);
 for(const v of ['1.5','0.500','','0',1500.5])assert.throws(()=>lerValorReais(v),/Informe (o|um) valor/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {pendenciasDocumento} from '../src/documentos-bloqueio.js';
import {pendenciasPagamento,dadosContrato} from '../src/contrato-dados.js';
import {ENTRADA_PARCELADA} from '../src/condicoes-venda.js';
import {faltaNaTela,DIA,solteiro,condicoesOk} from './documentos-bloqueio.fixture.js';

const emBranco=c=>{const d=dadosContrato({condicoes:c,pagamento:'texto da tela',dataExtenso:'x',nome:'A',cpf:'1'});return /_{3,}/.test(d.precoContrato+d.pagamentoContrato+d.valorAlteracaoContrato);};
test('contrato com parcelas, valor da parcela, entrada ou valor total em branco fica bloqueado',()=>{
 assert.deepEqual(pendenciasPagamento(condicoesOk()),[]);assert.equal(emBranco(condicoesOk()),false);
 const c={...condicoesOk(),parcelas:'',valorParcela:''};
 assert.equal(emBranco(c),true);
 assert.deepEqual(pendenciasPagamento(c),['Quantidade de parcelas','Valor da parcela']);
 assert.deepEqual(faltaNaTela('contrato',solteiro(),{condicoes:c}),['Quantidade de parcelas','Valor da parcela']);
 assert.deepEqual(pendenciasPagamento({...condicoesOk(),valorTotal:'',entrada:''}),['Valor total do contrato','Valor da entrada (ou troque a forma de venda para Parcelado sem entrada)']);
 assert.deepEqual(pendenciasPagamento({...condicoesOk(),parcelas:'0'}),['Quantidade de parcelas']);
 assert.deepEqual(pendenciasPagamento({...condicoesOk(),parcelas:'1,5'}),['Quantidade de parcelas']);
});
test('cada forma de venda exige só o que o contrato dela imprime',()=>{
 assert.deepEqual(pendenciasPagamento({modalidade:'À vista',valorTotal:'6.000,00',parcelas:'',valorParcela:'',entrada:''}),[]);
 assert.deepEqual(pendenciasPagamento({modalidade:'À vista',valorTotal:''}),['Valor total do contrato']);
 assert.deepEqual(pendenciasPagamento({modalidade:'Parcelado sem entrada',valorTotal:'6.000,00',entrada:'',parcelas:'12',valorParcela:'500,00'}),[]);
 assert.deepEqual(pendenciasPagamento({modalidade:'Parcelado sem entrada',valorTotal:'6.000,00',parcelas:'',valorParcela:'500,00'}),['Quantidade de parcelas']);
 for(const modalidade of ['Isento (REURB-S)','Custeado pela prefeitura'])assert.deepEqual(pendenciasPagamento({modalidade,valorTotal:'',parcelas:''}),[]);
 // Entrada parcelada continua com a validação própria já existente na tela.
 assert.deepEqual(pendenciasPagamento({modalidade:ENTRADA_PARCELADA}),[]);
 assert.deepEqual(faltaNaTela('contrato',solteiro(),{condicoes:{modalidade:ENTRADA_PARCELADA}}),['forma de pagamento']);
 assert.deepEqual(pendenciasPagamento(null),[]);
 assert.deepEqual(faltaNaTela('contrato',solteiro(),{condicoes:null}),['forma de pagamento']);
});
test('procuração e distrato não dependem da forma de pagamento; contrato junta qualificação e pagamento',()=>{
 const c={...condicoesOk(),parcelas:''};
 for(const tipo of ['procuracao','distrato']){
  assert.deepEqual(pendenciasDocumento(tipo,solteiro(),{referencia:DIA,condicoes:c}),[],tipo);
  assert.deepEqual(faltaNaTela(tipo,solteiro(),{condicoes:null}),[],tipo);
 }
 const p=solteiro();p.requerente.rg='';
 assert.deepEqual(pendenciasDocumento('contrato',p,{referencia:DIA,condicoes:c}),['RG do requerente principal','Quantidade de parcelas']);
});

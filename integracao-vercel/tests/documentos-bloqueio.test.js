import test from 'node:test';
import assert from 'node:assert/strict';
import {pendenciasDocumento,pendenciasQualificacao,unirPendencias,DOCUMENTOS_COM_BLOQUEIO} from '../src/documentos-bloqueio.js';
import {DOCS,qualificar,faltaNaTela,DIA,pessoa,CPFS,solteiro,casado,empresa} from './documentos-bloqueio.fixture.js';

const BLOQUEADOS=['contrato','procuracao','distrato'];
const pend=(tipo,p)=>pendenciasDocumento(tipo,p,{referencia:DIA});

test('solteiro com cadastro completo gera contrato, procuração e distrato',()=>{
 assert.deepEqual(DOCUMENTOS_COM_BLOQUEIO,BLOQUEADOS);
 for(const tipo of BLOQUEADOS){assert.deepEqual(pend(tipo,solteiro()),[],tipo);assert.deepEqual(faltaNaTela(tipo,solteiro()),[],tipo);}
 assert.deepEqual(qualificar(solteiro()).faltas,[]);
});
test('casado sem cônjuge cadastrado bloqueia e diz o que falta, em vez de sair só com o titular',()=>{
 const p=casado();p.conjuge={nome:'',cpf:''};
 // Antes: a qualificação omitia o cônjuge sem acusar falta e o contrato era gerado.
 assert.deepEqual(qualificar(p).faltas,[]);
 for(const tipo of BLOQUEADOS){
  assert.deepEqual(pend(tipo,p),['Nome do cônjuge (ou marque no cadastro que o cônjuge não é beneficiário)'],tipo);
  assert.deepEqual(faltaNaTela(tipo,p),pend(tipo,p),tipo);
 }
 p.requerente.estadoCivil='União estável';assert.match(pend('contrato',p)[0],/^Nome do cônjuge/);
 p.conjuge.beneficiario='nao';assert.deepEqual(pend('contrato',p),[]);
});
test('casado com cônjuge incompleto lista cada dado do cônjuge e o regime de bens',()=>{
 const p=casado();Object.assign(p.conjuge,{cpf:'',rg:'',profissao:'',mae:''});p.requerente.regimeBens='';
 assert.deepEqual(pend('contrato',p),['Profissão do cônjuge','RG do cônjuge','CPF do cônjuge','Nome da mãe do cônjuge','Regime de bens do casamento do requerente principal']);
 p.conjuge.cpf='11111111111';assert.ok(pend('procuracao',p).includes('CPF válido do cônjuge'));
 assert.deepEqual(pend('contrato',casado()),[]);
});
test('dados da qualificação do titular e do endereço bloqueiam com nome de campo que o Comercial entende',()=>{
 const p=solteiro();Object.assign(p.requerente,{estadoCivil:'',rg:'',profissao:'',cpf:''});p.endereco.numero='';p.endereco.cep='891';
 assert.deepEqual(pend('distrato',p),['Estado civil do requerente principal','Profissão do requerente principal','RG do requerente principal','CPF do requerente principal','Endereço do requerente (número, CEP)']);
 assert.deepEqual(faltaNaTela('distrato',p),pend('distrato',p));
 const sem=solteiro();delete sem.endereco;assert.deepEqual(pend('contrato',sem),['Endereço do requerente (rua, número, bairro, município, UF, CEP)']);
 assert.deepEqual(pendenciasDocumento('contrato',undefined).slice(0,1),['Nome do requerente principal']);
});
test('vários requerentes: um incompleto bloqueia e é identificado pela posição e pelo nome',()=>{
 const p=casado();
 p.corequerentes=[
  {id:'c1',tipo:'normal',beneficiario:'sim',pessoa:pessoa('Segundo Completo',CPFS[2]),conjuge:{nome:''}},
  {id:'c2',tipo:'normal',beneficiario:'sim',pessoa:pessoa('Terceira Incompleta','',{estadoCivil:'',rg:''}),conjuge:{nome:''}},
  {id:'c3',tipo:'normal',beneficiario:'nao',pessoa:{nome:'Não Beneficiário'},conjuge:{nome:''}},
 ];
 assert.deepEqual(pend('contrato',p),['Estado civil do 3º requerente (Terceira Incompleta)','RG do 3º requerente (Terceira Incompleta)','CPF do 3º requerente (Terceira Incompleta)']);
 for(const tipo of BLOQUEADOS)assert.deepEqual(faltaNaTela(tipo,p),pend(tipo,p),tipo);
 Object.assign(p.corequerentes[1].pessoa,{estadoCivil:'Casado(a)',rg:'99',cpf:CPFS[3]});
 assert.deepEqual(pend('contrato',p),['Nome do cônjuge do 3º requerente (Terceira Incompleta) (ou marque no cadastro que o cônjuge não é beneficiário)']);
 p.corequerentes[1].conjuge=pessoa('Conjuge da Terceira','',{});
 assert.deepEqual(pend('contrato',p),['CPF do cônjuge do 3º requerente (Terceira Incompleta)','Regime de bens do casamento do 3º requerente (Terceira Incompleta)']);
 p.corequerentes[1].conjuge.cpf=CPFS[1];p.corequerentes[1].pessoa.regimeBens='Separação de bens';
 assert.deepEqual(pend('contrato',p),[]);
 p.corequerentes[0].tipo='representado';p.corequerentes[0].representanteId='';
 assert.deepEqual(pend('contrato',p),['Representante legal do 2º requerente (Segundo Completo)']);
});
test('pessoa jurídica: completa gera; incompleta pede razão social, CNPJ e representante, nunca CPF ou cônjuge',()=>{
 for(const tipo of BLOQUEADOS){assert.deepEqual(pend(tipo,empresa()),[],tipo);assert.deepEqual(faltaNaTela(tipo,empresa()),[],tipo);}
 const p=empresa();p.requerente={tipoPessoa:'juridica',estadoCivil:'Casado(a)',nome:'',cnpj:'',representante:''};
 assert.deepEqual(pend('contrato',p),['Razão social do requerente principal','CNPJ do requerente principal','Representante legal do requerente principal']);
 p.requerente.cnpj='11222333000100';assert.ok(pend('contrato',p).includes('CNPJ válido do requerente principal'));
});
test('declarações e requerimento continuam sendo gerados sem os dados que só contrato, procuração e distrato exigem',()=>{
 const p=casado();p.conjuge={nome:'',cpf:''};Object.assign(p.requerente,{rg:'',profissao:'',mae:'',regimeBens:''});p.endereco.cep='';
 assert.ok(pend('contrato',p).length>0);
 for(const doc of DOCS.filter(d=>!BLOQUEADOS.includes(d.id))){
  assert.deepEqual(pend(doc.id,p),[],doc.id);assert.deepEqual(faltaNaTela(doc.id,p),[],doc.id);
 }
 assert.deepEqual(pend('termo_compromisso',p),[]);
});
test('toda falta que a qualificação acusa bloqueia; nada vira texto resumido em silêncio',()=>{
 const base=()=>{const p=casado();p.corequerentes=[{id:'c1',tipo:'menor',representanteId:'principal',beneficiario:'sim',pessoa:pessoa('Outro Teste',CPFS[2],{estadoCivil:'Casado(a)',regimeBens:'Separação de bens'}),conjuge:pessoa('Conjuge do Outro',CPFS[3])}];return p;};
 assert.deepEqual(qualificar(base()).faltas,[]);assert.deepEqual(pendenciasQualificacao(base(),DIA),[]);
 const alvos=[p=>p.requerente,p=>p.conjuge,p=>p.corequerentes[0].pessoa,p=>p.corequerentes[0].conjuge];
 let conferidos=0;
 for(const alvo of alvos)for(const campo of ['nome','cpf','rg','mae','profissao','estadoCivil','regimeBens']){
  const p=base();alvo(p)[campo]='';
  if(qualificar(p).faltas.length){conferidos++;assert.ok(pendenciasQualificacao(p,DIA).length>0,campo);}
 }
 for(const campo of ['logradouro','numero','bairro','municipio','uf','cep']){const p=base();p.endereco[campo]='';assert.ok(qualificar(p).faltas.length>0,campo);assert.ok(pendenciasQualificacao(p,DIA).length>0,campo);conferidos++;}
 {const p=base();p.corequerentes[0].representanteId='';assert.ok(qualificar(p).faltas.length>0);assert.ok(pendenciasQualificacao(p,DIA).length>0);}
 assert.ok(conferidos>=20);
 // Rede de segurança: colchete que as regras não previram também bloqueia.
 assert.deepEqual(pendenciasDocumento('contrato',solteiro(),{referencia:DIA,qualificacao:'Fulano, [campo novo], residente.'}),['Qualificação: campo novo']);
 assert.deepEqual(pendenciasDocumento('dec_posse',solteiro(),{qualificacao:'[campo novo]'}),[]);
});
test('a tela junta a lista detalhada com as conferências que já existiam, sem repetir',()=>{
 assert.deepEqual(unirPendencias(['CPF do requerente principal'],['nome do requerente','CPF','CNPJ','endereço','forma de pagamento']),['CPF do requerente principal','forma de pagamento']);
 const p=solteiro();p.requerente.cpf='';p.endereco.logradouro='';
 assert.deepEqual(faltaNaTela('contrato',p,{condicoes:null}),['CPF do requerente principal','Endereço do requerente (rua)','forma de pagamento']);
 assert.deepEqual(faltaNaTela('procuracao',p,{advogados:[]}),['CPF do requerente principal','Endereço do requerente (rua)','representante cadastrado em Configurações']);
 const q=solteiro();q.distrato=null;assert.deepEqual(faltaNaTela('distrato',q),['distrato registrado na seção acima']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {montar,dadosExemplo} from './documentos-comerciais.fixture.js';
import {preenchido,ehPJ} from '../src/requisitos-moradores.js';
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ctx={preenchido,ehPJ};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function faltandoPara('),source.indexOf('const paragrafo ='))+';this.verificar=faltandoPara;',ctx);
test('CNPJ satisfaz identificação de PJ sem exigir CPF, endereço ausente vira pendência',()=>{
 const doc={precisa:['nome','cpf','endereco']},p={requerente:{tipoPessoa:'juridica',nome:'Empresa',cnpj:'29212382000107'}};
 assert.deepEqual(Array.from(ctx.verificar(doc,{},p)),['endereço']);p.endereco={logradouro:'Rua A'};
 assert.equal(ctx.verificar(doc,{},p).length,0);p.requerente.cnpj='';assert.deepEqual(Array.from(ctx.verificar(doc,{},p)),['CNPJ']);
});
test('todos os modelos preservam texto especial sem interpretá-lo como HTML',()=>{
 const nome='Maria & Filhos <Teste>',d={...dadosExemplo,nome,qualificacaoCompleta:nome,qualificacaoCompromisso:nome,assinantes:[[nome,'123']],historicoPosse:'Área <frente> & fundos'};
 for(const tipo of ['contrato','procuracao','requerimento','dec_estado_civil','dec_renda','dec_endereco','dec_posse','distrato','termo_compromisso']){
  const html=montar(tipo,d,{}, {procuradores:nome}),doc=parseHTML('<html><body>'+html+'</body></html>').document;
  assert.ok(doc.body.textContent.includes(nome),tipo);assert.equal(doc.querySelector('teste'),null,tipo);assert.ok(!html.includes('&amp;amp;'),tipo);
 }
});
test('assinatura e qualificação de PJ usam CNPJ',()=>{
 const html=montar('procuracao',{...dadosExemplo,tipoDocumento:'CNPJ',qualificacaoCompleta:'',nome:'Empresa',cpf:'29.212.382/0001-07'},{},{procuradores:'Representante'});
 assert.match(html,/CNPJ 29\.212/);assert.doesNotMatch(html,/inscrito\(a\) no CPF|Empresa, brasileira/);
});
test('renda numérica zero é formatada e renda ausente continua em branco',()=>{
 const expr=source.match(/renda: (preenchido\(p\.social\?\.rendaFamiliar\)[^\n]+),/)[1];
 const avaliar=new Function('p','preenchido','reais','return '+expr);
 const reais=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 assert.match(avaliar({social:{rendaFamiliar:0}},preenchido,reais),/0,00/);
 assert.equal(avaliar({social:{}},preenchido,reais),'____________');
});

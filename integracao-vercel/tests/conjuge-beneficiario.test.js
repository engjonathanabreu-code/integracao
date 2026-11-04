import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {preenchido,ehPJ,temConjuge,normalizar,cpfValido,cnpjValido,so,COM_CONJUGE} from '../src/requisitos-moradores.js';
import {cpfDispensado} from '../src/pessoa-menor.js';
import {montar,dadosExemplo} from './documentos-comerciais.fixture.js';
const src=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ctx={preenchido,ehPJ,temConjuge,normalizar,cpfValido,cnpjValido,so,COM_CONJUGE,cpfDispensado,fmtCPF:x=>x,fmtCNPJ:x=>x,fmtCEP:x=>x,codigosUnidades:()=>['TESTE_0001']};
vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('function gerarQualificacao('),src.indexOf('function AbaQualificacao('))+';this.gerar=gerarQualificacao;this.atualizar=atualizarQualificacao;',ctx);
const pessoa=(nome,cpf)=>({nome,cpf,estadoCivil:'Casado(a)',nacionalidade:'Brasileira',profissao:'Analista',rg:'123',mae:'Maria',regimeBens:'Comunhão parcial de bens'});
const cadastro=()=>({requerente:pessoa('Titular Teste','52998224725'),conjuge:pessoa('Conjuge Teste','11144477735'),corequerentes:[],endereco:{logradouro:'Rua A',numero:'1',bairro:'Centro',municipio:'Teste',uf:'SC',cep:'89140000'},documentosGerados:[{id:'antigo',tipo:'contrato'}]});
const nomesAssinantes=p=>{const expr=src.match(/assinantes: (\[\[p\.requerente\.nome[\s\S]*?)\n    dataContrato:/)[1].replace(/,\s*$/,'');return vm.runInContext('('+expr+')',vm.createContext({...ctx,p}));};
test('legado e sim incluem casal; nao exclui de qualificação e assinaturas sem mutação',()=>{
 for(const valor of [undefined,'sim','nao']){
  const p=cadastro();if(valor!==undefined)p.conjuge.beneficiario=valor;const antes=structuredClone(p);
  for(const modo of ['simples','completa']) assert.equal(ctx.gerar(p,modo).texto.includes('Conjuge Teste'),valor!=='nao');
  assert.equal(nomesAssinantes(p).some(([n])=>n==='Conjuge Teste'),valor!=='nao');assert.deepEqual(p,antes);
 }
});
test('novos contrato e procuração excluem cônjuge não beneficiário, declaração mantém identidade civil',()=>{
 const p=cadastro();p.conjuge.beneficiario='nao';
 const d={...dadosExemplo,nome:p.requerente.nome,conjuge:p.conjuge.nome,conjugeBeneficiario:false,qualificacaoCompleta:ctx.gerar(p,'completa').texto,assinantes:nomesAssinantes(p)};
 for(const tipo of ['contrato','procuracao']) {const html=montar(tipo,d,{},{});assert.doesNotMatch(html,/Conjuge Teste/);assert.match(html,/Titular Teste/);}
 const civil=montar('dec_estado_civil',d,{},{}),doc=parseHTML('<html><body>'+civil+'</body></html>').document;
 assert.match(doc.body.textContent,/Conjuge Teste/);assert.doesNotMatch(doc.querySelector('[data-assinaturas]').textContent,/Conjuge Teste/);
 assert.equal(d.conjuge,'Conjuge Teste');
});
test('sim e legado conservam assinaturas de contrato/procuração',()=>{
 for(const flag of [undefined,true]){
  const p=cadastro(),d={...dadosExemplo,nome:p.requerente.nome,conjuge:p.conjuge.nome,conjugeBeneficiario:flag,qualificacaoCompleta:ctx.gerar(p,'completa').texto,assinantes:nomesAssinantes(p)};
  for(const tipo of ['contrato','procuracao']) assert.match(montar(tipo,d,{},{}),/Conjuge Teste/);
 }
});
test('outros requerentes não beneficiários e seus cônjuges não viram assinantes',()=>{
 const p=cadastro();p.corequerentes=[{beneficiario:'nao',pessoa:pessoa('Outro','52998224725'),conjuge:pessoa('Outro Conjuge','11144477735')},{beneficiario:'sim',pessoa:pessoa('Outro Sim','52998224725'),conjuge:{...pessoa('Conjuge Nao','11144477735'),beneficiario:'nao'}}];
 const texto=ctx.gerar(p,'completa').texto;assert.doesNotMatch(texto,/Outro Conjuge|Conjuge Nao/);assert.match(texto,/Outro Sim/);
 assert.deepEqual(Array.from(nomesAssinantes(p),x=>x[0]),['Titular Teste','Conjuge Teste','Outro Sim']);
});
test('troca sim-nao-sim preserva cadastro, histórico e qualificações editadas',()=>{
 const p=cadastro();p.qualificacao={textos:{completa:'Texto manual anterior'},origem:{completa:'editada'}};
 const docs=JSON.stringify(p.documentosGerados),nome=p.conjuge.nome;
 for(const valor of ['nao','sim']){p.conjuge.beneficiario=valor;const q=ctx.atualizar(p,{nome:'Teste'});assert.equal(q.textos.completa,'Texto manual anterior');assert.equal(q.desatualizada,true);assert.equal(p.conjuge.nome,nome);assert.equal(JSON.stringify(p.documentosGerados),docs);}
});
test('seletor usa a permissão existente e modelos personalizados respeitam marcadores',()=>{
 assert.match(src,/papel === "conjuge" && <Campo[^\n]+path=\{P\("beneficiario"\)\}[^\n]+dis=\{dis\}/);
 const html=montar('contrato',{...dadosExemplo,conjugeBeneficiario:false},{modelosDoc:{contrato:'{{p:{{conjuge}} {{cpfConjuge}}}}'}},{});assert.doesNotMatch(html,/João|111/);
});

test('solteiro e pessoa jurídica preservam seleção de assinantes principal',()=>{
 for(const req of [{estadoCivil:'Solteiro(a)'},{tipoPessoa:'juridica',cnpj:'29212382000107'}]){
  const p=cadastro();p.requerente={...p.requerente,...req};assert.equal(nomesAssinantes(p).length,1);assert.doesNotMatch(ctx.gerar(p,'completa').texto,/Conjuge Teste/);
 }
});

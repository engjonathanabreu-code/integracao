import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {assinantesDocumento,partesAssinantes,pendenciasRepresentacao,pendenciasDocumento} from '../src/documentos-bloqueio.js';
import {declarantesComerciais} from '../src/declarantes-comerciais.js';
import {ehPJ,temConjuge} from '../src/requisitos-moradores.js';
import {montar,dadosExemplo} from './documentos-comerciais.fixture.js';
import {qualificar,faltaNaTela,DIA,pessoa,CPFS,solteiro,casado,empresa} from './documentos-bloqueio.fixture.js';

const fmtCPF=x=>x?`cpf:${x}`:'',fmtCNPJ=x=>x?`cnpj:${x}`:'';
const assinam=p=>assinantesDocumento(p,{referencia:DIA,fmtCPF,fmtCNPJ});
const menor=(extra={})=>({id:'m1',tipo:'menor',representanteId:'principal',beneficiario:'sim',pessoa:pessoa('Filho Menor','',{nascimento:'2015-03-01'}),conjuge:{nome:''},...extra});
const comMenor=extra=>{const p=casado();p.corequerentes=[menor(extra)];return p;};
// Seleção de assinantes que a tela usava antes (sem a regra de representante).
const antigos=p=>[[p.requerente.nome, ehPJ(p.requerente) ? fmtCNPJ(p.requerente.cnpj) : fmtCPF(p.requerente.cpf)], ...(temConjuge(p) && p.conjuge?.nome && p.conjuge.beneficiario !== "nao" ? [[p.conjuge.nome, fmtCPF(p.conjuge.cpf)]] : []),
 ...(p.corequerentes || []).filter((c) => c.beneficiario !== "nao").flatMap((c) => [[c.pessoa?.nome, ehPJ(c.pessoa) ? fmtCNPJ(c.pessoa.cnpj) : fmtCPF(c.pessoa?.cpf)], ...(c.conjuge?.nome && c.conjuge.beneficiario !== "nao" ? [[c.conjuge.nome, fmtCPF(c.conjuge.cpf)]] : [])])].filter(([nome]) => nome);
const assinaturasContrato=p=>{
 const html=montar('contrato',{...dadosExemplo,nome:p.requerente.nome,cpf:p.requerente.cpf,qualificacaoCompleta:qualificar(p).texto,assinantes:assinam(p)},{},{});
 const doc=parseHTML('<html><body>'+html+'</body></html>').document;
 return [...doc.querySelectorAll('p')].map(x=>x.textContent).filter(t=>/Contratante - CPF\/CNPJ/.test(t));
};

test('sem menor nem representado, os assinantes são exatamente os de antes',()=>{
 const varios=casado();
 varios.corequerentes=[{id:'c1',tipo:'normal',beneficiario:'sim',pessoa:pessoa('Outro Adulto',CPFS[2],{estadoCivil:'Casado(a)'}),conjuge:pessoa('Conjuge do Outro',CPFS[3])},
  {id:'c2',tipo:'normal',beneficiario:'nao',pessoa:pessoa('Fora',CPFS[2]),conjuge:{nome:''}},{tipo:'normal',beneficiario:'sim',pessoa:pessoa('Sem Chave',CPFS[3]),conjuge:{nome:''}},
  {id:'c4',tipo:'juridica',beneficiario:'sim',pessoa:{tipoPessoa:'juridica',nome:'Empresa Dois',cnpj:'11222333000181',representante:'Sócio'},conjuge:{nome:''}}];
 const semBenef=casado();semBenef.conjuge.beneficiario='nao';
 for(const p of [solteiro(),casado(),empresa(),varios,semBenef])assert.deepEqual(assinam(p),antigos(p));
 assert.deepEqual(assinam(varios).map(x=>x[0]),['Titular Teste','Conjuge Teste','Outro Adulto','Conjuge do Outro','Sem Chave','Empresa Dois']);
 assert.deepEqual(pendenciasRepresentacao(varios,DIA),[]);
});
test('menor com representante informado: quem assina é o representante, com o CPF dele',()=>{
 const p=comMenor();
 // Mesma regra das declarações.
 assert.equal(declarantesComerciais(p,DIA).at(-1).representante,p.requerente);
 assert.deepEqual(assinam(p),[['Titular Teste','cpf:'+CPFS[0]],['Conjuge Teste','cpf:'+CPFS[1]],['Titular Teste, representante legal de Filho Menor','cpf:'+CPFS[0]]]);
 assert.deepEqual(antigos(p).at(-1),['Filho Menor','']);
 assert.deepEqual(pendenciasRepresentacao(p,DIA),[]);
 for(const tipo of ['contrato','procuracao','distrato'])assert.deepEqual(faltaNaTela(tipo,p),[],tipo);
 const linhas=assinaturasContrato(p);
 assert.equal(linhas.length,3);
 assert.match(linhas[2],/Titular Teste, representante legal de Filho Menor.*Contratante - CPF\/CNPJ cpf:52998224725/);
 assert.ok(!linhas.some(l=>l.startsWith('Filho Menor')));
 assert.ok(!linhas.some(l=>/CPF\/CNPJ _+/.test(l)));
 assert.match(qualificar(p).texto,/Filho Menor.*neste ato representado\(a\) por Titular Teste/);
 // Representante que é outro requerente adulto da ficha.
 const q=comMenor({representanteId:'tio'});q.corequerentes.push({id:'tio',tipo:'normal',beneficiario:'sim',pessoa:pessoa('Tio Responsável',CPFS[2]),conjuge:{nome:''}});
 assert.deepEqual(assinam(q)[2],['Tio Responsável, representante legal de Filho Menor','cpf:'+CPFS[2]]);
});
test('menor sem representante informado: bloqueia os três documentos e não troca a assinatura por conta própria',()=>{
 const esperado=['Representante legal de Filho Menor (menor de idade), com CPF válido: escolha o tipo e o representante em Outros requerentes'];
 for(const extra of [{representanteId:''},{representanteId:'nao-existe'},{tipo:'normal',representanteId:''}]){
  const p=comMenor(extra);
  assert.deepEqual(pendenciasRepresentacao(p,DIA),esperado);
  assert.deepEqual(assinam(p).at(-1),['Filho Menor','']);
  for(const tipo of ['contrato','procuracao','distrato'])assert.ok(faltaNaTela(tipo,p).includes(esperado[0]),tipo);
 }
 // Representante sem CPF válido ou também menor não serve, como nas declarações.
 const semCpf=comMenor();semCpf.requerente.cpf='';
 assert.ok(pendenciasDocumento('contrato',semCpf,{referencia:DIA}).includes(esperado[0]));
 const repMenor=comMenor({representanteId:'irmao'});repMenor.corequerentes.push({id:'irmao',tipo:'normal',beneficiario:'sim',pessoa:pessoa('Irmão Menor',CPFS[2],{nascimento:'2012-01-01'}),conjuge:{nome:''}});
 assert.equal(pendenciasRepresentacao(repMenor,DIA).length,2);
 // Sem chave estável não há como localizar o representante com segurança.
 const semId=comMenor();delete semId.corequerentes[0].id;
 assert.deepEqual(pendenciasRepresentacao(semId,DIA),esperado);
});
test('a maioridade segue a data de referência; adulto marcado como representado usa a mesma regra',()=>{
 const p=comMenor({tipo:'normal',representanteId:''});p.corequerentes[0].pessoa.cpf=CPFS[2];
 assert.equal(pendenciasRepresentacao(p,'2033-02-28').length,1);
 assert.deepEqual(pendenciasRepresentacao(p,'2033-03-01'),[]);
 assert.deepEqual(assinantesDocumento(p,{referencia:'2033-03-01'}).at(-1),['Filho Menor',CPFS[2]]);
 const adulto=casado();adulto.corequerentes=[{id:'r1',tipo:'representado',representanteId:'',beneficiario:'sim',pessoa:pessoa('Adulto Representado',CPFS[2]),conjuge:{nome:''}}];
 assert.deepEqual(pendenciasRepresentacao(adulto,DIA),['Representante legal de Adulto Representado (representado), com CPF válido: escolha o tipo e o representante em Outros requerentes']);
 adulto.corequerentes[0].representanteId='principal';
 assert.deepEqual(assinam(adulto).at(-1),['Titular Teste, representante legal de Adulto Representado','cpf:'+CPFS[0]]);
});
test('requerente principal menor bloqueia com orientação; menor não beneficiário e ocupante não entram',()=>{
 const p=solteiro();p.requerente.nascimento='2012-06-01';p.requerente.cpf='';
 assert.deepEqual(pendenciasRepresentacao(p,DIA),['Representante legal de Titular Teste (menor de idade): o cadastro só aceita representante em Outros requerentes; cadastre o responsável como requerente principal']);
 for(const tipo of ['contrato','procuracao','distrato'])assert.equal(faltaNaTela(tipo,p).length,1,tipo);
 for(const tipo of ['dec_posse','dec_endereco','requerimento'])assert.deepEqual(pendenciasDocumento(tipo,p,{referencia:DIA}),[],tipo);
 const fora=comMenor({beneficiario:'nao',representanteId:''});fora.ocupantes=[{id:'o1',pessoa:pessoa('Ocupante Menor','',{nascimento:'2016-01-01'})}];
 assert.deepEqual(pendenciasRepresentacao(fora,DIA),[]);assert.equal(assinam(fora).length,2);
 assert.equal(partesAssinantes(empresa(),DIA)[0].representado,false);
});
test('a tela monta os assinantes pela função com a regra de representante',()=>{
 const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(fonte,/\n    assinantes: assinantesDocumento\(p, \{ fmtCPF, fmtCNPJ \}\),\n    dataContrato:/);
});

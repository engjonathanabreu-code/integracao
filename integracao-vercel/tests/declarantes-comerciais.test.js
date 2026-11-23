import test from 'node:test';
import assert from 'node:assert/strict';
import {declarantesComerciais,opcoesDeclaracao,documentoPorDeclarante} from '../src/declarantes-comerciais.js';

const ficha=()=>({
  requerente:{nome:'Pessoa A',cpf:'52998224725',estadoCivil:'Casado(a)'},
  conjuge:{nome:'Pessoa B',cpf:'11144477735',beneficiario:'nao'},
  corequerentes:[
    {id:'outro',tipo:'normal',beneficiario:'nao',pessoa:{nome:'Pessoa C',cpf:'12345678909'}},
    {id:'menor',tipo:'menor',representanteId:'principal',pessoa:{nome:'Pessoa D',nascimento:'2015-01-10'}},
  ],
  ocupantes:[{id:'ocup',pessoa:{nome:'Somente ocupante',cpf:'52998224725'}}],
});
const dia='2026-11-23';
test('renda e veracidade permitem escolher o cônjuge e demais requerentes, sem mudar o contrato',()=>{
 const p=ficha();
 const esperado=['requerente','conjuge','corequerentes:outro','corequerentes:menor'];
 for(const tipo of ['dec_renda','termo_veracidade']) assert.deepEqual(opcoesDeclaracao(p,tipo,dia).map(x=>x.id),esperado);
 assert.deepEqual(opcoesDeclaracao(p,'contrato',dia),[]);
 assert.equal(documentoPorDeclarante('procuracao'),false);
 assert.equal(declarantesComerciais(p,dia)[1].pessoa,p.conjuge);
});
test('cada pessoa usa seu documento e representação; não herda o CPF do principal',()=>{
 const p=ficha();p.conjuge.cpf='';
 const [,c,,m]=declarantesComerciais(p,dia);
 assert.equal(c.estadoCivil,'Casado(a)');
 assert.deepEqual(c.falta,['CPF válido do declarante']);
 assert.equal(m.representado,true);
 assert.equal(m.representante,p.requerente);
 assert.deepEqual(m.falta,[]);
 p.corequerentes[1].representanteId='desconhecido';
 assert.deepEqual(declarantesComerciais(p,dia).at(-1).falta,['representante válido no cadastro']);
});
test('remove identidades sem chave estável e bloqueia representante menor ou entidade sem responsável',()=>{
 const p=ficha();
 p.requerente={nome:'Empresa A',tipoPessoa:'juridica',cnpj:'11222333000181'};
 p.corequerentes.push({pessoa:{nome:'Sem chave',cpf:'52998224725'}});
  p.corequerentes.push({id:'vazio',pessoa:{nome:'  ',cpf:'52998224725'}});
 const d=declarantesComerciais(p,dia);
 assert.equal(d.length,4);
 assert.ok(d[0].falta.includes('representante válido no cadastro'));
 assert.ok(d.at(-1).falta.includes('representante válido no cadastro'));
});
test('pessoa jurídica com representante nomeado não inventa CPF do representante',()=>{
 const p=ficha();
 p.requerente={nome:'Empresa A',tipoPessoa:'juridica',cnpj:'11222333000181',representante:'Pessoa Representante',representanteCpf:'12'};
 assert.deepEqual(declarantesComerciais(p,dia)[0].representante,{nome:'Pessoa Representante',cpf:''});
 assert.deepEqual(declarantesComerciais(p,dia)[0].falta,[]);
});

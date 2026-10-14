import test from 'node:test';
import assert from 'node:assert/strict';
import {empresaDoMunicipio,timbradoDoMunicipio,prepararEmpresaMunicipal} from '../src/empresa-municipio.js';
import {cnpjValido} from '../src/requisitos-moradores.js';
test('empresa e timbrado municipais preservam fallback e não misturam identidade MCL com Integral',()=>{
 const db={empresa:{razaoSocial:'Empresa legada'},timbrado:{ativo:true,cabecalho:{modelo:'integral-2026'}},ajustesMunicipio:{m1:{empresaDocumento:{codigo:'mcl',dados:{razaoSocial:'Empresa de teste'}}}}};
 assert.equal(empresaDoMunicipio(db,'m2').razaoSocial,'Empresa legada');
 assert.equal(empresaDoMunicipio(db,'m1').razaoSocial,'Empresa de teste');
 assert.equal(timbradoDoMunicipio(db,'m2'),db.timbrado);
 assert.equal(timbradoDoMunicipio(db,'m1').ativo,false);
 db.ajustesMunicipio.m1.timbradosEmpresa={mcl:{cabecalho:{chave:'teste'}}};
 assert.equal(timbradoDoMunicipio(db,'m1').cabecalho.chave,'teste');
});
test('MCL só pode ser selecionada com dados confirmados e timbrado próprio',()=>{
 assert.throws(()=>prepararEmpresaMunicipal('mcl',{}, {},cnpjValido));
 const dados={razaoSocial:'Empresa fictícia para teste',cnpj:'29.212.382/0001-07',endereco:'Endereço fictício'};
 assert.throws(()=>prepararEmpresaMunicipal('mcl',dados,{},cnpjValido));
 assert.equal(prepararEmpresaMunicipal('mcl',dados,{timbradosEmpresa:{mcl:{cabecalho:{chave:'arquivo-ficticio'}}}},cnpjValido).codigo,'mcl');
});

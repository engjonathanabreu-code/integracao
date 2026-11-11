import {ajustarComparacaoFinanceira} from '../src/contrato-financeiro.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {extrairIntencao,aplicarIntencao} from '../src/intencoes-edicao.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';

test('reprodução: segunda edição financeira encontra falso conflito de representação',()=>{
 const b=fixture();b.fin_receb_clientes[0].valor_entrada=400;
 const s=projetar(b,blank()),primeira=structuredClone(s.db);
 primeira.processos[0].comercial.entrada='500,00';
 const ops=prepararEdicao(s.db,primeira,s,s.db.usuarios[0]);
 assert.equal(ops.find(o=>o.table==='fin_receb_clientes').changes.valor_entrada,500);
 const segunda=structuredClone(primeira);segunda.processos[0].comercial.entrada='600,00';
 const remoto=structuredClone(b);remoto.fin_receb_clientes[0].valor_entrada=500;
 const r=aplicarIntencao(projetar(remoto,s.db).db,extrairIntencao(primeira,segunda));
 const c=r.conflitos.find(c=>c.caminho.at(-1)==='entrada');
 assert.ok(c,'Caracterização do defeito atual, não teste de aceitação da correção');
 assert.equal(c.base,'500,00');assert.equal(c.remoto,'500');assert.equal(c.local,'600,00');
 const edicoes=extrairIntencao(primeira,segunda),saved=structuredClone(edicoes),state=projetar(remoto,s.db);
 const ajustadas=ajustarComparacaoFinanceira(edicoes,state);
 assert.equal(aplicarIntencao(state.db,ajustadas).conflitos.length,0);
 assert.deepEqual(edicoes,saved);
 assert.equal(aplicarIntencao(state.db,ajustadas).dados.processos[0].comercial.entrada,'600,00');
 const outro=structuredClone(remoto);outro.fin_receb_clientes[0].valor_entrada=550;
 const estadoOutro=projetar(outro,s.db);
 assert.ok(aplicarIntencao(estadoOutro.db,ajustarComparacaoFinanceira(edicoes,estadoOutro)).conflitos.length);
 assert.deepEqual(ajustarComparacaoFinanceira(edicoes,{...state,bindings:[]}),edicoes);
});
test('reprodução: captura global de arquivo vincula edição não relacionada à mesma chave',async()=>{
 const payloads=[];
 const fila={enfileirar:async p=>{payloads.push(structuredClone(p));return p;},listar:async()=>[],fechar:()=>{}};
 const diario=criarDiarioCompartilhado({conta:'audit',ativo:()=>true,fila,atualizou:()=>{}});
 const arquivos={'arquivo-independente':{key:'integracao-kml-v1-nucleo-outro',value:'{}',version:'v1',expected:null}};
 try{
  await diario.adicionar({usuarios:[{id:'u',nome:'Antes'}]},{usuarios:[{id:'u',nome:'Depois'}]},arquivos);
  await diario.adicionar({},{},arquivos);
  assert.ok(payloads[0].recursos.includes('arquivo:arquivo-independente'));
  assert.ok(payloads[1].recursos.includes('arquivo:arquivo-independente'));
  assert.deepEqual(payloads[0].intencao.arquivos,payloads[1].intencao.arquivos);
 }finally{diario.fechar();}
});

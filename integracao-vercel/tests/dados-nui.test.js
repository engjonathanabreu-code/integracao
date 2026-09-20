import test from 'node:test';
import assert from 'node:assert/strict';
import {dadosNUI,salvarDadosNUI,SECOES_NUI} from '../src/dados-nui.js';
import {contextoPRF} from '../src/modelos-prf.js';
import {marcadoresPRF} from '../municipio-prf/marcadoresPRF.js';
import {fixture,blank} from './fixture.js';
import {projetar,copy,prepararEdicao} from '../src/dados-compartilhados.js';
test('seis seções e edição preservam campos existentes e detectam alterações concorrentes',()=>{
 assert.equal(SECOES_NUI.length,6);const n={id:'n',nome:'Original',infra:{redeAgua:{presente:true,legado:1}},situacao:'Ativo'};const base=dadosNUI(n),d=structuredClone(base);d.equipeTecnica=[{nome:'Técnico'}];salvarDadosNUI(n,base,d);assert.equal(n.nome,'Original');assert.equal(n.infra.redeAgua.legado,1);
 const b=dadosNUI(n),novo=structuredClone(b);novo.situacao='Suspenso';n.situacao='Concluído';assert.throws(()=>salvarDadosNUI(n,b,novo),/alterado/);assert.equal(n.situacao,'Concluído');
});
test('dados NUI alimentam PRF com matrículas, vínculos de unidades e dados técnicos',()=>{
 const n={matriculas:[{numero:'123',proprietarios:[{nome:'Registral'}],remanescentes:[{area:'50'}]}],unidadesSemEspecializacao:[{unidadeId:'u'}],unidadesAtingidasRodovia:[{unidadeId:'u',rodovia:'BR'}],unidadesAtingidasCursoAgua:[{unidadeId:'u',cursoAgua:'Rio'}],areasUsucapidas:[{unidadeId:'u',processo:'1'}],equipeTecnica:[{nome:'Técnico'}],versoes:[{numero:'01'}],medida:{nome:'Medida',unidades:[{unidadeId:'u'}]}};
 const d=contextoPRF({nucleo:n,unidades:[{id:'u',matricula:'123',nome:'Morador',cpf:'123',logradouro:'Rua A'}],cpfDe:()=> 'mascarado'});
 assert.equal(d.matriculas[0].unidades[0].id,'u');assert.equal(d.matriculas[0].proprietarios[0].nome,'Registral');assert.equal(d.matriculas[0].remanescentes[0].area,'50');
 for(const k of ['unidadesSemEspecializacao','unidadesAtingidasRodovia','unidadesAtingidasCursoAgua','areasUsucapidas'])assert.equal(d[k][0].cpf,'mascarado');assert.equal(d.medida.unidades[0].nome,'Morador');assert.equal(d.versoes[0].numero,'01');
});
test('zona e macrozona não são presumidas quando não foram escolhidas',()=>{
 const entrada={dadosPRF:{macrozonas:[{nome:'Rural',sigla:'R'}]},nucleo:{dados:{}}};assert.equal(marcadoresPRF(entrada).marcadores['nucleo.macrozona'],'');assert.equal(marcadoresPRF(entrada).marcadores['nucleo.zona'],'');entrada.nucleo.dados={macrozona:'Rural',zona:'Área Rural'};assert.equal(marcadoresPRF(entrada).marcadores['nucleo.macrozonaSigla'],'R');
});
test('salvamento de Dados NUI persiste em complemento sem alterar cadastro canônico',()=>{
 const state=projetar(fixture(),blank()),d=copy(state.db);d.nucleos[0].equipeTecnica=[{id:'t',nome:'Técnico',registro:'123'}];d.nucleos[0].matriculas=[{numero:'123',proprietarios:[{nome:'Titular'}]}];d.nucleos[0].zona='Área Rural';
 const ops=prepararEdicao(state.db,d,state,d.usuarios[0]);assert.ok(ops.length);assert.ok(ops.every(o=>o.table==='integracao_nucleos'));assert.ok(JSON.stringify(ops).includes('equipeTecnica'));
});

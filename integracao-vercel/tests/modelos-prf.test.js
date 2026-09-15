import test from 'node:test';
import assert from 'node:assert/strict';
import {contextoPRF,prepararModeloPRF,mapaDoModeloPRF,encontrarLacunas,montarPRF} from '../src/modelos-prf.js';
const cpfDe = cpf => cpf ? '***.***.***-00' : '';
const criar = () => ({municipio:{nome:'Cidade teste'},remessa:{nome:'Remessa teste'},nucleo:{codigo:'NUI01'},cpfDe,unidades:[{codigo:'U1',nome:'A',cpf:'12345678900',requerente:{cpf:'12345678900'},matricula:'M1',logradouro:'Rua A',modalidade:'REURB-S'},{codigo:'U2',nome:'B',cpf:'98765432100',matricula:'M1',logradouro:'Rua A',modalidade:'REURB-S'},{codigo:'U3',nome:'C',matricula:'M2',logradouro:'Rua B',modalidade:'REURB-S'}]});
test('PRF agrupa apenas unidades com matrícula expressamente informada',()=>{
 const entrada=criar(), copia=structuredClone({...entrada,cpfDe:null});const d=contextoPRF(entrada);
 assert.equal(d.unidades.length,3);assert.deepEqual(d.matriculas.map(m=>m.unidades.length),[2,1]);assert.equal(d.logradouros.length,2);
 assert.equal(d.matriculas[0].proprietarios.length,0);assert.equal(d.unidadesSemEspecializacao.length,0);
 assert.deepEqual({...entrada,cpfDe:null},copia);
});
test('contexto do PRF respeita CPF mascarado inclusive em proprietários e aliases',()=>{
 const entrada=criar();entrada.nucleo.matriculas=[{numero:'M1',proprietarioCpf:'12345678900',proprietarios:[{cpf:'12345678900'}]}];
 const d=contextoPRF(entrada);assert.equal(d.unidades[0].cpf,'***.***.***-00');assert.equal(d.unidades[0].requerente.cpf,'***.***.***-00');assert.equal(d.matriculas[0].proprietarioCpf,'***.***.***-00');assert.equal(d.matriculas[0].proprietarios[0].cpf,'***.***.***-00');
 assert.ok(!JSON.stringify(d).includes('12345678900'));
});
test('modalidade social exige todos os moradores classificados como REURB-S',()=>{
 const entrada=criar();assert.equal(contextoPRF(entrada).modalidadeSocial,true);entrada.unidades[1].modalidade='';assert.equal(contextoPRF(entrada).modalidadeSocial,false);
});
test('modelo PRF antigo conserva HTML, blocos e correspondência manual',()=>{
 const html="<p class='original'>Cidade ______ e {{bloco.tabela_ocupantes}}</p>",valores={'municipio.nome':'Cidade &amp; teste','bloco.tabela_ocupantes':'<table><tr><td>A</td></tr></table>'};
 const preparo=prepararModeloPRF(html,{valores,estrutura:{}});assert.equal(preparo.html,html);assert.equal(preparo.estruturado,false);
 const lacunas=encontrarLacunas(preparo.html),mapa={L1:'municipio.nome',L2:'bloco.tabela_ocupantes'};
 assert.equal(mapaDoModeloPRF(null,preparo,lacunas),null);
 assert.deepEqual(mapaDoModeloPRF({modelo:html,valores:mapa},preparo,lacunas),mapa);
 assert.equal(montarPRF(preparo.html,lacunas,mapa,valores).html,"<p class='original'>Cidade Cidade &amp; teste e <table><tr><td>A</td></tr></table></p>");
});
test('mapa antigo não é reutilizado quando a expansão muda os espaços',()=>{
 const salvo={modelo:'anterior',valores:{L1:'municipio.nome'}};
 const lacunas=[{id:'L1',explicita:'unidade.ausente'},{id:'L2',explicita:null}];
 assert.deepEqual(mapaDoModeloPRF(salvo,{html:'novo',estruturado:true},lacunas),{L1:'unidade.ausente'});
 assert.equal(mapaDoModeloPRF(salvo,{html:'novo',estruturado:false},lacunas),null);
});

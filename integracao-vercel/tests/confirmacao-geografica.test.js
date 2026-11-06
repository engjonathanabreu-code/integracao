import test from 'node:test';
import assert from 'node:assert/strict';
import {criarConfirmacaoRetomavel} from '../geojson/confirmacao-retomavel.js';
import {salvarPerimetroGeografico} from '../geojson/geometria-geografica.js';

const falha=(retentar,mensagem='Resposta de gravação perdida')=>Object.assign(new Error(mensagem),retentar?{retentarConfirmacao:retentar}:{});
const geometria={type:'FeatureCollection',features:[{type:'Feature',properties:{nome:'Teste'},geometry:{type:'Polygon',coordinates:[[[-50,-27],[-49.9,-27],[-49.9,-26.9],[-50,-26.9],[-50,-27]]]}}]};

test('resposta perdida retoma recibo sem reaplicar geometria e sem falso conflito com estado otimista',async()=>{
 const confirmacao=criarConfirmacaoRetomavel(),db={nucleos:[{id:'n',etapa:0}]};let aplicacoes=0,recibos=0;
 const salvar=async()=>{aplicacoes++;salvarPerimetroGeografico(db,'n',geometria,{anterior:null});throw falha(async()=>{recibos++;return {confirmado:true};});};
 await assert.rejects(confirmacao.executar('kml-n',salvar),/perdida/);
 assert.deepEqual(db.nucleos[0].geo.geojson,geometria);
 assert.deepEqual(await confirmacao.executar('kml-n',salvar),{confirmado:true});
 assert.equal(aplicacoes,1);assert.equal(recibos,1);assert.equal(db.nucleos[0].etapa,0);
});
test('erro antes da edição sem callback permite nova tentativa original',async()=>{
 const confirmacao=criarConfirmacaoRetomavel();let chamadas=0;
 const salvar=async()=>{if(++chamadas===1)throw falha(null,'Sem conexão');return 'salvo';};
 await assert.rejects(confirmacao.executar('n',salvar),/conexão/);assert.equal(await confirmacao.executar('n',salvar),'salvo');assert.equal(chamadas,2);
});
test('alterar rascunho, seleção ou ação descarta a retentativa antiga',async()=>{
 const confirmacao=criarConfirmacaoRetomavel();let retries=0,originais=0;
 const original=async()=>{originais++;throw falha(async()=>{retries++;});};
 await assert.rejects(confirmacao.executar('importar:a',original));
 assert.equal(await confirmacao.executar('vincular:b',async()=>++originais),2);assert.equal(retries,0);
 await assert.rejects(confirmacao.executar('salvar:c',original));confirmacao.invalidar();
 assert.equal(await confirmacao.executar('salvar:c',async()=>++originais),4);assert.equal(retries,0);
});
test('nova falha na retomada usa o callback atualizado e nunca reaplica edição',async()=>{
 const confirmacao=criarConfirmacaoRetomavel();let originais=0,retries=0;
 const original=async()=>{originais++;throw falha(async()=>{retries++;throw falha(async()=>{retries++;return 'confirmado';});});};
 await assert.rejects(confirmacao.executar('n',original));await assert.rejects(confirmacao.executar('n',original));
 assert.equal(await confirmacao.executar('n',original),'confirmado');assert.equal(originais,1);assert.equal(retries,2);
});
test('resposta tardia não restaura callback depois que o usuário mudou o conteúdo',async()=>{
 const confirmacao=criarConfirmacaoRetomavel();let rejeitar,retries=0;
 const primeira=confirmacao.executar('n',()=>new Promise((_,reject)=>{rejeitar=reject;}));
 confirmacao.invalidar();rejeitar(falha(async()=>{retries++;}));await assert.rejects(primeira);
 assert.equal(await confirmacao.executar('n',async()=>'nova intenção'),'nova intenção');assert.equal(retries,0);
});
test('download concluído não repete ao retomar confirmação da emissão',async()=>{
 const confirmacao=criarConfirmacaoRetomavel();let downloads=0,gravacoes=0;
 const emitir=async()=>{downloads++;gravacoes++;throw falha(async()=>true);};
 await assert.rejects(confirmacao.executar('emitir:n:versao1',emitir));await confirmacao.executar('emitir:n:versao1',emitir);
 assert.equal(downloads,1);assert.equal(gravacoes,1);
});

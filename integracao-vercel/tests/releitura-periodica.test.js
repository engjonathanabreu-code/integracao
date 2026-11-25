// SYNC-M5: releitura completa periódica/de foco dispensada com o tempo real conectado.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispensaReleituraCompleta,TETO_SEM_RELEITURA_MS} from '../src/releitura-periodica.js';

const MIN=60000;
test('SYNC-M5: só dispensa com tempo real conectado e leitura completa posterior à conexão e recente',()=>{
 const base={tempoReal:'conectado',conectadoDesde:1000,ultimaCompletaEm:2000,agora:2000+MIN};
 assert.equal(dispensaReleituraCompleta(base),true);
 for(const tempoReal of ['desconectado','conectando','reconectando','offline',undefined])
  assert.equal(dispensaReleituraCompleta({...base,tempoReal}),false,`estado ${tempoReal} mantém a releitura`);
 // Leitura anterior à conexão atual não cobre o intervalo sem avisos.
 assert.equal(dispensaReleituraCompleta({...base,ultimaCompletaEm:999}),false);
 assert.equal(dispensaReleituraCompleta({...base,ultimaCompletaEm:0}),false);
 assert.equal(dispensaReleituraCompleta({...base,conectadoDesde:0}),false);
 // Rede de segurança: depois do teto a releitura volta, mesmo conectado.
 assert.equal(dispensaReleituraCompleta({...base,agora:2000+TETO_SEM_RELEITURA_MS-1}),true);
 assert.equal(dispensaReleituraCompleta({...base,agora:2000+TETO_SEM_RELEITURA_MS}),false);
 // Relógio retrocedido não prova base recente.
 assert.equal(dispensaReleituraCompleta({...base,agora:1500}),false);
 assert.equal(dispensaReleituraCompleta(),false);
});

test('SYNC-M5: o teto fica abaixo da validade da base da leitura por escopo, contando o intervalo do tick',()=>{
 const fonte=readFileSync(new URL('../src/use-dados-compartilhados.js',import.meta.url),'utf8');
 const validade=Function('return '+fonte.match(/VALIDADE_BASE_ESCOPO_MS=([^,;]+)/)[1])();
 assert.ok(TETO_SEM_RELEITURA_MS+120000<=validade,'a releitura de segurança precisa chegar antes de a base do escopo vencer');
});

// Uma aba aberta por 1 h: tick a cada 2 min e uma troca de janela a cada 5 min.
function simular({tempoReal,dispensa}){
 let agora=0,ultimaCompletaEm=0,leituras=0;const conectadoDesde=tempoReal==='conectado'?1:0;
 const ler=()=>{leituras++;ultimaCompletaEm=agora;};
 agora=2;ler(); // leitura pedida pela própria conexão do tempo real
 const eventos=[];
 for(let t=2*MIN;t<=60*MIN;t+=2*MIN)eventos.push(t);
 for(let t=5*MIN;t<=60*MIN;t+=5*MIN)eventos.push(t+1000);
 for(const t of eventos.sort((a,b)=>a-b)){agora=t;if(!dispensa||!dispensaReleituraCompleta({tempoReal,conectadoDesde,ultimaCompletaEm,agora}))ler();}
 return leituras-1;
}
test('SYNC-M5: medição — leituras completas por hora de aba aberta, antes e depois',()=>{
 const antes=simular({tempoReal:'conectado',dispensa:false});
 const depois=simular({tempoReal:'conectado',dispensa:true});
 const semTempoReal=simular({tempoReal:'reconectando',dispensa:true});
 assert.equal(antes,42,'30 ticks + 12 trocas de janela');
 assert.equal(semTempoReal,antes,'sem tempo real conectado nada muda');
 assert.ok(depois<=8,`com tempo real conectado: ${depois} leituras completas por hora`);
 console.log(`SYNC-M5 medição: leituras completas/h por aba = ${antes} antes, ${depois} depois (tempo real conectado)`);
});

test('SYNC-M5: o tick e o foco consultam a regra; avisos do tempo real, reconexão e atualização manual não',()=>{
 const fonte=readFileSync(new URL('../src/use-dados-compartilhados.js',import.meta.url),'utf8');
 assert.match(fonte,/retomarEEnviar\('tick'\)\.finally\(\(\)=>\{if\(!releituraDispensada\(\)\)refresh\(\);\}\)/);
 assert.match(fonte,/retomarEEnviar\('foco'\);if\(!releituraDispensada\(\)\)avisar\(null\);/);
 // A retomada da fila continua em todo tick/foco (C5), independentemente da releitura.
 assert.match(fonte,/alterou:avisar,estado:estadoDoTempoReal/);
 assert.match(fonte,/void verificar\.then\(\(\)=>retomar\('online'\)\)[^\n]*\n\s*avisar\(null\);/);
 assert.match(fonte,/if\(completa&&!emCache\)\{baseCompletaEm\.current=Date\.now\(\);completaIniciadaEm\.current=iniciadaEm;/);
});

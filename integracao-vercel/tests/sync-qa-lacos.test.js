import test from 'node:test';
import assert from 'node:assert/strict';
import {processarIntencao} from '../src/fila-intencoes.js';
import {requerRevisaoFila} from '../src/estado-sincronizacao.js';
import {novaFila,enfileirarMeta,erroCom,CONTA} from './apoio-sync-fila.js';

const nao=()=>{throw new Error('callback não esperado');};
const opcoes=extra=>({conta:CONTA,dono:'qa',sessaoAtual:()=>true,consultarRecibo:nao,enviar:nao,reler:nao,...extra});
const passar=async(fila,extra)=>{try{return await processarIntencao(fila,opcoes(extra));}catch(e){return e;}};

test('QA 1: tempestade de sinais não transforma o backoff em laço — retomada respeita piso após a falha',async()=>{
 const {fila,relogio,ler}=novaFila();
 const item=await enfileirarMeta(fila);let preparos=0;
 const preparar=()=>{preparos++;throw new TypeError('fetch failed');};
 for(let n=0;n<200;n++){await fila.retomarTransitorias(CONTA);await passar(fila,{preparar});}
 assert.equal(preparos,1,'sem avanço do relógio só há uma tentativa');
 const depois=await ler(item.id);
 assert.ok(depois.proximaTentativa>relogio.agora,'continua agendado no futuro');
 relogio.agora+=15_000;
 await fila.retomarTransitorias(CONTA);await passar(fila,{preparar});
 assert.equal(preparos,2,'após o piso, o sinal antecipa a tentativa');
 assert.equal(requerRevisaoFila(await ler(item.id)),false);
});

test('QA 3: o mesmo 500 determinístico na gravação pede revisão após repetições; consulta antecede cada reenvio',async()=>{
 const {fila,relogio,ler}=novaFila();
 const item=await enfileirarMeta(fila);let envios=0,consultas=0;
 const extra={preparar:async()=>({operacoes:[{table:'metas',key:{id:'x'},changes:{titulo:'Depois'}}]}),
  consultarRecibo:async()=>{consultas++;return null;},enviar:async()=>{envios++;throw erroCom('coluna inexistente',{status:500,code:'42703'});}};
 for(let n=0;n<12;n++){await passar(fila,extra);relogio.agora+=600_000;}
 const fim=await ler(item.id);
 assert.equal(envios,5,'para de reenviar após cinco respostas idênticas ao longo de mais de 10 min');
 assert.ok(consultas>=envios-1,'cada reenvio foi precedido de consulta do pedido');
 assert.equal(fim.estado,'bloqueado_validacao');assert.equal(requerRevisaoFila(fim),true);
 assert.equal(fim.erro.repetida,true);assert.equal(fim.erro.rejeicaoConfirmada,false);
 await fila.retomarTransitorias(CONTA);
 assert.equal(requerRevisaoFila(await ler(item.id)),true,'retomada automática não reabre a revisão');
 const retomado=await fila.retomar(CONTA,item.id);
 assert.equal(retomado.estado,'resultado_desconhecido','o usuário pode retomar o mesmo pedido');assert.equal(retomado.repeticoesEnvio,0);
});

test('QA 3: 500 sem SQLSTATE, de lock (55P03) ou interno (XX000), e rajada curta de 500 nunca escalam',async()=>{
 for(const [code,passo] of [[undefined,600_000],['55P03',600_000],['XX000',600_000],['42703',1000]]){
  const {fila,relogio,ler}=novaFila();
  const item=await enfileirarMeta(fila);
  const extra={preparar:async()=>({operacoes:[{table:'metas',key:{id:'x'},changes:{titulo:'Depois'}}]}),
   consultarRecibo:async()=>null,enviar:async()=>{throw erroCom('erro interno',{status:500,...(code?{code}:{})});}};
  for(let n=0;n<(passo===1000?30:12);n++){await fila.retomarTransitorias(CONTA);await passar(fila,extra);relogio.agora+=passo;}
  assert.equal(requerRevisaoFila(await ler(item.id)),false,String(code)+'/'+passo);
 }
});

test('QA 3: 500 de timeout/sobrecarga (57014) continua transitório, sem revisão',async()=>{
 const {fila,relogio,ler}=novaFila();
 const item=await enfileirarMeta(fila);
 const extra={preparar:async()=>({operacoes:[{table:'metas',key:{id:'x'},changes:{titulo:'Depois'}}]}),
  consultarRecibo:async()=>null,enviar:async()=>{throw erroCom('statement timeout',{status:500,code:'57014'});}};
 for(let n=0;n<12;n++){await passar(fila,extra);relogio.agora+=600_000;}
 assert.equal(requerRevisaoFila(await ler(item.id)),false);
});

test('QA 4: falha de sessão impõe pausa curta e não conta falha',async()=>{
 const {fila,relogio,ler}=novaFila();
 const item=await enfileirarMeta(fila);let preparos=0;
 const preparar=()=>{preparos++;throw erroCom('JWT expired',{status:401,code:'PGRST303'});};
 for(let n=0;n<20;n++)await passar(fila,{preparar});
 const depois=await ler(item.id);
 assert.equal(preparos,1);assert.equal(depois.falhas||0,0);assert.equal(requerRevisaoFila(depois),false);
 assert.ok(depois.proximaTentativa-relogio.agora<=5000);
 await fila.retomarTransitorias(CONTA);await passar(fila,{preparar});
 assert.equal(preparos,2,'sessão restaurada retoma na hora');
});

test('QA 5: 429 na consulta do recibo não autoriza reenvio sem nova consulta',async()=>{
 const {fila,relogio}=novaFila();
 await enfileirarMeta(fila);const ordem=[];let n=0;
 const extra={preparar:async()=>({operacoes:[{table:'metas',key:{id:'x'},changes:{titulo:'Depois'}}]}),
  consultarRecibo:async()=>{ordem.push('consulta');if(n++===0)throw erroCom('limite',{status:429});return null;},
  enviar:async()=>{ordem.push('envio');throw new TypeError('fetch failed');}};
 for(let k=0;k<4;k++){await passar(fila,extra);relogio.agora+=600_000;}
 for(let k=1;k<ordem.length;k++)if(ordem[k]==='envio'&&k>1)assert.equal(ordem[k-1],'consulta','reenvio sem consulta: '+ordem.join('>'));
 assert.ok(ordem.includes('consulta'));
});

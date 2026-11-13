import nodeTest from 'node:test';
const test=(nome,fn)=>nodeTest(nome,{timeout:1500},fn);
import assert from 'node:assert/strict';
import {setImmediate as turno} from 'node:timers/promises';
import {definirSessao,capturarSessao,requisicao} from '../src/dados-compartilhados.js';
import {criarApiSuporte} from '../src/suporte-remoto-api.js';
import {criarExecutorSuporte} from '../src/suporte-remoto-executor.js';
import {buscarREST} from '../src/transporte-rest.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sessao=(expires_in=3600)=>({user:{id:id(1)},access_token:'fixture',refresh_token:'fixture',expires_in});
function relogio(t){
 const limites=[];
 t.mock.method(AbortSignal,'timeout',ms=>{const c=new AbortController();limites.push({ms,c});return c.signal;});
 return {expirar(){assert.ok(limites.length,'requisição com sinal externo também precisa de timeout');assert.equal(limites.at(-1).ms,25000);limites.at(-1).c.abort(new DOMException('fixture','TimeoutError'));},limites};
}
function esperarAbort(signal){return new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}
function executor(){return criarExecutorSuporte({usuario:id(1),habilitado:true,api:criarApiSuporte({habilitado:true}),
 sync:{diagnosticoPronto:()=>true,executarSuporte:async()=>({codigo:'DIAGNOSTICO',itens:[]})},
 obterVinculo:async()=>({conta:id(1),instalacao_id:id(2),prova_instalacao:'a'.repeat(64)}),diagnosticoInstalacao:id(3),consumidor:id(4)});}

test('timeout encerra contato real preso, libera emCurso e permite próximo contato normal',async t=>{
 const clock=relogio(t);let chamadas=0;
 definirSessao(sessao());t.after(()=>definirSessao(null));
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{chamadas++;return chamadas===1?esperarAbort(signal):Response.json({habilitado:false});});
 const e=executor(),p=e.passo();await turno();assert.equal(e.executando,true);assert.equal(await e.passo(),null);assert.equal(chamadas,1);
 clock.expirar();assert.equal(await p,null);assert.equal(e.executando,false);assert.equal(await e.passo(),null);assert.equal(chamadas,2);
});
for(const etapa of ['autorizar','validar_execucao','concluir'])test(`timeout em ${etapa} não repete autorização, efeito ou ACK`,async t=>{
 const clock=relogio(t),chamadas=[];let efeitos=0;
 definirSessao(sessao());t.after(()=>definirSessao(null));
 t.mock.method(globalThis,'fetch',async(url,{signal,body})=>{
  const {acao}=JSON.parse(body);chamadas.push(acao);
  if(acao===etapa)return esperarAbort(signal);
  return Response.json(acao==='contatar'?{habilitado:true}:acao==='receber'?{comando:{id:id(5),usuario_id:id(1),instalacao_id:id(2),tipo:'diagnostico',expira_em:new Date(Date.now()+300000).toISOString()}}:acao==='concluir'?{aceito:true}:{autorizado:true});
 });
 const e=criarExecutorSuporte({usuario:id(1),habilitado:true,api:criarApiSuporte({habilitado:true}),
 sync:{diagnosticoPronto:()=>true,executarSuporte:async()=>{efeitos++;return {codigo:'DIAGNOSTICO',itens:[]};}},
 obterVinculo:async()=>({conta:id(1),instalacao_id:id(2),prova_instalacao:'a'.repeat(64)}),diagnosticoInstalacao:id(3),consumidor:id(4)});
 const p=e.passo();await turno();assert.equal(chamadas.at(-1),etapa);clock.expirar();
 const r=await p;assert.equal(e.executando,false);assert.equal(efeitos,etapa==='concluir'?1:0);
 assert.equal(r?.estado,etapa==='autorizar'?undefined:'resultado_incerto');
 await e.passo();assert.equal(efeitos,etapa==='concluir'?1:0);assert.equal(chamadas.filter(a=>a==='autorizar').length,1);assert.equal(chamadas.filter(a=>a==='concluir').length,etapa==='autorizar'?0:1);
});

test('renovação compartilhada presa termina por timeout sem despachar POST de negócio',async t=>{
 const clock=relogio(t);let refreshes=0,posts=0;
 definirSessao(sessao(0));t.after(()=>definirSessao(null));
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{if(url.includes('/auth/')){refreshes++;return esperarAbort(signal);}posts++;return Response.json({});});
 const a=requisicao('rpc/fixture',{method:'POST',signal:capturarSessao().signal}),b=requisicao('rpc/fixture',{method:'POST'});
 const resultado=Promise.allSettled([a,b]);await turno();assert.equal(refreshes,1);clock.expirar();
 for(const r of await resultado){assert.equal(r.status,'rejected');assert.equal(r.reason.name,'TimeoutError');}
 assert.equal(posts,0);assert.equal(refreshes,1);
 // O job rejeitado não bloqueia uma nova sessão autenticada.
 definirSessao(sessao());await requisicao('rpc/fixture',{method:'POST'});assert.equal(posts,1);
});

test('timeout cobre corpo da renovação e não instala sessão parcial',async t=>{
 const clock=relogio(t);let posts=0;
 definirSessao(sessao(0));t.after(()=>definirSessao(null));
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{if(url.includes('/auth/'))return {ok:true,json:()=>esperarAbort(signal)};posts++;return Response.json({});});
 const p=requisicao('rpc/fixture',{method:'POST'});const resultado=assert.rejects(p,{name:'TimeoutError'});await turno();clock.expirar();await resultado;assert.equal(posts,0);
});

test('GET ganha timeout novo por tentativa; POST com sinal externo não repete corpo interrompido',async t=>{
 const clock=relogio(t),controller=new AbortController();let chamadas=0;
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{chamadas++;return {status:200,ok:true,text:()=>esperarAbort(signal)};});
 const p=buscarREST('/fixture',{signal:controller.signal});const falha=assert.rejects(p,/dados já exibidos foram preservados/);
 await turno();clock.expirar();await turno();assert.equal(chamadas,2);assert.equal(clock.limites.length,2);assert.notEqual(clock.limites[0].c.signal,clock.limites[1].c.signal);clock.expirar();await falha;
 chamadas=0;const q=buscarREST('/fixture',{method:'POST',signal:controller.signal});const escrita=assert.rejects(q,/Verifique o registro/);await turno();clock.expirar();await escrita;assert.equal(chamadas,1);
});

test('cancelamento externo e troca de conta interrompem sem retry ou resultado cruzado',async t=>{
 relogio(t);let chamadas=0;
 t.mock.method(globalThis,'fetch',async(url,{signal})=>{chamadas++;return esperarAbort(signal);});
 const c=new AbortController(),p=buscarREST('/fixture',{signal:c.signal});const falha=assert.rejects(p);c.abort();await falha;assert.equal(chamadas,1);
 definirSessao(sessao());t.after(()=>definirSessao(null));const q=requisicao('rpc/fixture',{method:'POST'});const trocada=assert.rejects(q,{code:'SESSAO_ALTERADA'});definirSessao({...sessao(),user:{id:id(9)}});await trocada;assert.equal(chamadas,2);
});

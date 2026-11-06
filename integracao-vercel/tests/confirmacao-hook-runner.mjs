import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../package.json',import.meta.url));
const {parseHTML}=require('linkedom');
const {window}=parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
const bundle=process.argv[2],cenario=process.argv[3]||'sucesso';
const cache=new Map();
const localStorage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
Object.assign(globalThis,{window,document:window.document,location:new URL('http://localhost/?cenario=concorrente-independente'),localStorage,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent});
Object.defineProperty(globalThis,'navigator',{value:{onLine:cenario!=='offline',userAgent:'Node isolated test'},configurable:true});
window.localStorage=localStorage;window.location=globalThis.location;document.visibilityState='visible';
globalThis.fetch=(...args)=>window.fetch(...args);
await import(bundle);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<100;i++){
 await wait(30);const h=window.syncHarness;
 if(h?.ready&&(cenario==='offline'||h.draft()&&!h.draft().pending))break;
}
const h=window.syncHarness;assert.ok(h?.ready,'hook ready');
let chamadas=0;
const editar=d=>{chamadas++;if(d.processos[0].unidades[0].area==='123.4500')throw new Error('CAS detectou a própria alteração otimista');d.processos[0].unidades[0].area='123.4500';return d;};
const entrada=()=>({id:crypto.randomUUID(),data:new Date().toISOString(),acao:'Área revisada',usuarioId:h.db.usuarios[0].id,usuario:'Equipe Teste',setor:'comercial',processoId:h.db.processos[0].id});
const inicial=h.stats.writes;
if(cenario==='sucessivas'){
 const buscar=window.fetch;let liberar,avisar,interceptado=false;
 const bloqueio=new Promise(r=>{liberar=r;}),chegou=new Promise(r=>{avisar=r;});
 window.fetch=async(input,options)=>{
  if(String(input).includes('/rpc/integracao_gravar')&&!interceptado){interceptado=true;avisar();await bloqueio;}
  return buscar(input,options);
 };
 const primeira=h.sync.mutateConfirmed(editar,entrada());
 const lote1=h.sync.flush();await chegou;
 let segundaConfirmada=false;
 const segunda=h.sync.mutateConfirmed(d=>{chamadas++;d.processos[0].unidades[0].area='200.0001';return d;},entrada()).then(r=>{segundaConfirmada=true;return r;});
 liberar();await lote1;assert.equal((await primeira).confirmado,true);
 assert.equal(segundaConfirmada,false,'edição posterior não pertence ao recibo anterior');
 await h.sync.flush();assert.equal((await segunda).confirmado,true);
 assert.equal(h.base().integracao_moradores[0].dados.unidades[0].area,'200.0001');
 assert.equal(h.stats.writes,inicial+2);assert.equal(chamadas,2);
}else if(cenario==='offline'){
 await assert.rejects(h.sync.mutateConfirmed(editar,entrada()),{code:'SEM_CONEXAO'});
 assert.equal(chamadas,0,'offline não aplica a mutação');assert.equal(h.stats.writes,0);
}else{
 if(cenario==='permissao')h.flags.deny=true;
 if(cenario==='conflito')h.flags.conflict=true;
 if(cenario==='leitura')h.flags.failReads=true;
 if(cenario==='resposta-perdida')h.flags.loseResponse=true;
 let resolvida=false;
 const promessa=h.sync.mutateConfirmed(editar,entrada());
 const resultado=promessa.then(v=>{resolvida=true;return {valor:v};},erro=>({erro}));
 await Promise.resolve();assert.equal(resolvida,false,'a mutação otimista não pode confirmar');
 assert.equal(chamadas,1);
 if(cenario==='sessao')h.sync.close();else await h.sync.flush();
 const r=await resultado;
 if(cenario==='sucesso'){
  assert.equal(r.erro,undefined);assert.equal(r.valor.confirmado,true);
  assert.equal(h.base().integracao_moradores[0].dados.unidades[0].area,'123.4500');
  assert.equal(h.stats.writes,inicial+1);
 }else{
  assert.ok(r.erro,'falha deve rejeitar confirmação');
  assert.equal(r.erro.rascunhoPreservado,true);
  if(cenario==='sessao')assert.equal(r.erro.code,'SESSAO_ENCERRADA');
  if(cenario==='leitura')assert.equal(r.erro.code,'LEITURA_PENDENTE');
  if(cenario!=='sessao')assert.equal(h.draft().db.processos[0].unidades[0].area,'123.4500');
  if(['leitura','resposta-perdida'].includes(cenario)){
   h.flags.failReads=false;h.flags.loseResponse=false;
   assert.equal(typeof r.erro.retentarConfirmacao,'function');
   // Na resposta perdida, a fila pode concluir antes de o usuário clicar novamente.
   if(cenario==='resposta-perdida')await h.sync.flush();
   const retomada=r.erro.retentarConfirmacao();
   for(let i=0;i<20&&h.draft()?.pending;i++){await h.sync.flush();await wait(30);}
   assert.equal((await retomada).confirmado,true);
   assert.equal(h.stats.writes,inicial+1,'a recuperação deve reutilizar o mesmo recibo');
   assert.equal(chamadas,1,'a função de mutação não se repete');
   assert.equal(h.draft().pending,false);
  }
 }
}
console.log(JSON.stringify({cenario,chamadas,writes:h.stats.writes-inicial,ok:true}));
h.sync.close();process.exit(0);

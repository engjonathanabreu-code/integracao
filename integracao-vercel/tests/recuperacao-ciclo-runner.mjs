import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../package.json',import.meta.url));
const {parseHTML}=require('linkedom');
const {window}=parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
const bundle=process.argv[2],cenario=process.argv[3]||'concorrente-divergente';
const cache=new Map();
const localStorage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
Object.assign(globalThis,{window,document:window.document,location:new URL('http://localhost/?cenario='+cenario),localStorage,HTMLElement:window.HTMLElement,CustomEvent:window.CustomEvent});
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,userAgent:'Node test'},configurable:true});
window.localStorage=localStorage;window.location=globalThis.location;document.visibilityState='visible';
globalThis.fetch=(...args)=>window.fetch(...args);
await import(bundle);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Persisting the draft and committing React's render are separate async steps.
// Wait for both before asserting the screen, including on a busy build worker.
for(let i=0;i<70;i++){
 await wait(100);const h=window.syncHarness,draft=h?.draft();
 if(h?.ready&&draft&&!draft.pending&&JSON.stringify(h.db)===JSON.stringify(draft.db))break;
 if(cenario==='resposta-perdida'&&h?.stats.writes===1&&draft?.pending)await h.sync.flush();
}
const h=window.syncHarness;
assert.ok(h?.ready,'hook ready');
assert.equal(h.sync.conflitos.length,0);
assert.equal(h.draft().pending,false,JSON.stringify({status:h.sync.status,error:h.sync.error,attempt:h.draft().attempt,posts:h.stats.posts}));
assert.deepEqual(JSON.parse(JSON.stringify(h.db)),h.draft().db,'a tela deve refletir o estado recuperado e persistido');
if(cenario==='concorrente-divergente')assert.equal(h.db.processos[0].etapa,2);
if(cenario==='exclusao-recusada')assert.equal(h.db.processos.length,1);
if(cenario==='resposta-perdida')assert.equal(h.stats.writes,1);
if(cenario==='reserva-recusada'){assert.equal(h.db.eventos.length,1);assert.equal(h.sync.reservasPreservadas,1);assert.equal(h.db.processos[0].etapa,1);}
if(cenario==='municipio-restaurado'){
 const municipio=h.db.municipios[0].id,nucleo=h.db.nucleos[0].id;
 const atualizado=await h.sync.loadMunicipio(municipio);
 assert.equal(atualizado.processos.filter(p=>p.nucleoId===nucleo&&p.situacao==='Ativo').length,2,'abrir núcleo deve carregar todos os clientes ativos, inclusive os sem edição local');
 assert.equal(atualizado.processos.find(p=>p.codigo==='TST01_001').etapa,1,'edição recuperada deve ser mantida');
 assert.equal(h.stats.writes,1,'carregamento não deve alterar os cadastros');
}
if(cenario==='meta-historico-ausente'){
 assert.equal(h.stats.posts,2,'rejected batch rebuilt once');
 assert.equal(h.stats.writes,1,'one atomic successful write');
 assert.equal(h.base().metas.find(m=>m.id.endsWith('000000000007')).status,'Concluído');
 assert.ok(h.base().metas.some(m=>m.titulo==='Meta criada offline'));
 assert.ok(h.base().meta_historico.some(h=>h.descricao==='Criação preservada'));
 assert.ok(h.db.conversas[0].mensagens.some(m=>m.texto==='Mensagem recebida durante a pendência'));
 assert.ok([...cache.keys()].some(k=>k.includes('-revisao-')),'original rejected draft archived');
}
console.log(JSON.stringify({cenario,pending:h.draft().pending,posts:h.stats.posts,writes:h.stats.writes,clientes:h.db.processos.length,conflitos:h.sync.conflitos.length}));
h.sync.close();process.exit(0);

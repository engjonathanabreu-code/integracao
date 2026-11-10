const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});let cenarios=0;try{
 const contexto=async()=>{const c=await browser.newContext();await c.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());return c;};
 const abrir=async(c,cenario='fantasma')=>{const p=await c.newPage();p.setDefaultTimeout(15000);await p.goto('http://127.0.0.1:5178/tests/sincronizacao-ciclo.html?diario&cenario='+cenario);await p.waitForFunction(()=>window.syncHarness?.ready);return p;};
 const concluir=p=>p.waitForFunction(()=>!syncHarness.sync.pendencias.length&&syncHarness.stats.writes>0);
 let c=await contexto(),p=await abrir(c);await concluir(p);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);cenarios++;console.log('cenário aprovado',cenarios);
 await p.reload();await p.waitForFunction(()=>syncHarness.ready);await concluir(p);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);cenarios++;console.log('cenário aprovado',cenarios);
 // A new action after migration becomes a separate durable entry.
 await p.evaluate(()=>syncHarness.sync.loadMunicipio('00000000-0000-4000-8000-000000000002'));await p.getByRole('button',{name:'Editar novamente'}).click();await p.waitForFunction(()=>syncHarness.stats.writes===2&&!syncHarness.sync.pendencias.length);assert.equal(await p.evaluate(()=>syncHarness.base().integracao_moradores[0].dados.etapa),2);cenarios++;console.log('cenário aprovado',cenarios);await c.close();
 // Refused unit is retained while an independent goal edit completes.
 c=await contexto();p=await abrir(c,'reserva-recusada');await p.waitForFunction(()=>syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_validacao'));
 await p.evaluate(()=>syncHarness.sync.mutate(d=>{d.metas[0].titulo='Meta independente';return d;}));
 await p.waitForFunction(()=>syncHarness.base().metas[0].titulo==='Meta independente');assert.equal(await p.evaluate(()=>syncHarness.sync.pendencias.filter(i=>i.estado==='bloqueado_validacao').length),1);cenarios++;console.log('cenário aprovado',cenarios);await c.close();
 // Explicit recovery uses a fresh precondition and does not erase another field.
 c=await contexto();p=await abrir(c,'concorrente-divergente');await p.waitForFunction(()=>syncHarness.sync.pendencias.some(i=>i.estado==='bloqueado_conflito'));
 await p.evaluate(async()=>{await syncHarness.sync.abrirPendencia(syncHarness.sync.pendencias[0].id);});await p.waitForFunction(()=>syncHarness.sync.previaPendencia?.conflitos.length);
 await p.evaluate(async()=>{const choices=Object.fromEntries(syncHarness.sync.previaPendencia.conflitos.map(c=>[c.chave,'local']));await syncHarness.sync.resolverPendencia(choices);});
 await concluir(p);assert.equal(await p.evaluate(()=>syncHarness.base().integracao_moradores[0].dados.etapa),1);cenarios++;console.log('cenário aprovado',cenarios);await c.close();
 // Two tabs of one account append independent actions; closing the oldest cannot erase either.
 c=await contexto();const a=await abrir(c);await concluir(a);const b=await abrir(c);await concluir(b);
 await Promise.all([a.evaluate(()=>syncHarness.sync.mutate(d=>{d.metas[0].titulo='Aba A';return d;})),b.evaluate(()=>syncHarness.sync.mutate(d=>{d.planos[0].titulo='Aba B';return d;}))]);
 await a.waitForFunction(()=>!syncHarness.sync.pendencias.length);await a.close();await b.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('harness-server'));return s.metas[0].titulo==='Aba A'&&s.planos_trabalho[0].titulo==='Aba B';});
 await b.reload();await b.waitForFunction(()=>syncHarness.ready&&!syncHarness.sync.pendencias.length);assert.equal(await b.evaluate(()=>syncHarness.db.metas[0].titulo),'Aba A');cenarios++;console.log('cenário aprovado',cenarios);await c.close();

 // Lost write response is recovered by receipt, without a second committed write.
 c=await contexto();p=await abrir(c,'resposta-perdida');await concluir(p);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);assert.equal(await p.evaluate(()=>syncHarness.stats.posts),1);cenarios++;console.log('cenário aprovado',cenarios);await c.close();
 // A confirmed write survives reload while reads fail; recovery reads only.
 c=await contexto();p=await abrir(c,'falha-leitura');await p.waitForFunction(()=>syncHarness.sync.pendencias.some(i=>i.estado==='confirmado_aguardando_leitura'));
 await p.reload();await p.waitForFunction(()=>syncHarness.ready);await p.evaluate(()=>syncHarness.recover());await concluir(p);assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);assert.equal(await p.evaluate(()=>syncHarness.stats.posts),0);cenarios++;console.log('cenário aprovado',cenarios);await c.close();
 // New local edits during an in-flight write retain their own confirmation.
 c=await contexto();p=await abrir(c);await concluir(p);
 await p.evaluate(()=>{const original=window.fetch;window.fetch=async(u,o)=>{if(String(u).endsWith('/rpc/integracao_gravar')&&!window.interceptou){window.interceptou=true;await new Promise(r=>window.liberarEnvio=r);}return original(u,o);};syncHarness.sync.mutate(d=>{d.metas[0].titulo='Primeira edição';return d;});});
 await p.waitForFunction(()=>window.liberarEnvio);await p.evaluate(()=>{syncHarness.sync.mutate(d=>{d.metas[0].observacoes='Segunda edição';return d;});window.liberarEnvio();});
 await p.waitForFunction(()=>!syncHarness.sync.pendencias.length);assert.equal(await p.evaluate(()=>syncHarness.base().metas[0].titulo),'Primeira edição');assert.equal(await p.evaluate(()=>syncHarness.base().metas[0].observacoes),'Segunda edição');cenarios++;console.log('cenário aprovado',cenarios);await c.close();
 // Quota is a visible non-durable state. Refresh cannot discard the memory-only edit.
 c=await contexto();p=await abrir(c);await concluir(p);
 await p.evaluate(()=>{window.addOriginal=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...a){if(this.name==='intencoes')throw new DOMException('fixture','QuotaExceededError');return window.addOriginal.apply(this,a);};syncHarness.sync.mutate(d=>{d.metas[0].titulo='Preservar apesar da quota';return d;});});
 await p.waitForFunction(()=>syncHarness.sync.error.includes('guardar'));await p.evaluate(()=>syncHarness.sync.refresh({force:true}));assert.equal(await p.evaluate(()=>syncHarness.db.metas[0].titulo),'Preservar apesar da quota');assert.equal(await p.evaluate(()=>syncHarness.stats.writes),1);
 await p.evaluate(async()=>{IDBObjectStore.prototype.add=window.addOriginal;await syncHarness.sync.abrirPendencia(syncHarness.sync.pendencias.find(i=>i.estado==='persistencia_falhou').id);});
 await p.waitForFunction(()=>syncHarness.sync.previaPendencia);await p.evaluate(()=>syncHarness.sync.resolverPendencia({}));await concluir(p);assert.equal(await p.evaluate(()=>syncHarness.base().metas[0].titulo),'Preservar apesar da quota');cenarios++;console.log('cenário aprovado',cenarios);await c.close();

 // The real form initializes erpId to null; the canonical binding is not a lost field.
 c=await contexto();p=await abrir(c);await concluir(p);
 await p.evaluate(()=>syncHarness.sync.mutate(d=>{const meta={...structuredClone(d.metas[0]),id:'00000000-0000-4000-8000-000000000090',erpId:null,titulo:'Nova meta fictícia',historico:[],checklist:[],arquivos:[]};delete meta._compartilhado;d.metas.push(meta);return d;}));
 await p.waitForFunction(()=>syncHarness.base().metas.some(x=>x.titulo==='Nova meta fictícia')&&!syncHarness.sync.pendencias.length);cenarios++;console.log('cenário aprovado',cenarios);await c.close();
 console.log(JSON.stringify({ok:true,cenarios,hookReal:true,indexedDBReal:true,provedoresSimulados:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

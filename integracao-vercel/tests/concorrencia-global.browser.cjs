const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});let cases=0;const errors=[];
try{for(const width of [1440,390]){
 for(const scenario of ['concorrente-igual','concorrente-independente','concorrente-divergente'])for(const choice of scenario==='concorrente-divergente'?['local','remoto']:['']){
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:5182/tests/sincronizacao-ciclo.html?cenario=${scenario}`);await p.waitForFunction(()=>syncHarness?.ready);
  if(choice){
   await p.getByRole('region',{name:'Revisar alterações simultâneas'}).waitFor();assert.equal(await p.evaluate(()=>syncHarness.stats.writes),0);
   // A reload preserves the original baseline and the local change.
   await p.reload();await p.waitForFunction(()=>syncHarness?.ready);await p.getByRole('region',{name:'Revisar alterações simultâneas'}).waitFor();
   await p.getByRole('radio',{name:choice==='local'?/Sua alteração/:/Valor atual compartilhado/}).check();await p.getByRole('button',{name:'Salvar escolhas e continuar'}).click();
  }
  await p.waitForFunction(()=>!syncHarness.draft().pending,{},{timeout:15000});
  const s=await p.evaluate(()=>({etapa:syncHarness.base().integracao_moradores[0].dados.etapa,checks:syncHarness.base().integracao_moradores[0].dados.checks,local:syncHarness.db.processos[0].etapa,error:syncHarness.sync.error,writes:syncHarness.stats.writes,backups:Object.keys(localStorage).filter(k=>k.includes('-revisao-')).length}));
  assert.equal(s.etapa,choice==='remoto'?2:1);assert.equal(s.local,s.etapa);assert.equal(s.error,'');assert.ok(s.backups>=1);
  if(scenario==='concorrente-independente')assert.equal(s.checks.remoto,true);
  if(scenario==='concorrente-igual'||choice==='remoto')assert.equal(s.writes,0);
  if(choice==='local'){assert.equal(s.writes,1);await p.screenshot({path:`/private/tmp/concorrencia-${width}.png`,fullPage:true});}
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await context.close();cases++;
 }
}assert.deepEqual(errors,[]);console.log(`${cases} fluxos desktop/mobile: conciliação compatível, repetição, revisão local/remota e F5 aprovados.`);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

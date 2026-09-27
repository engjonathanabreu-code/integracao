const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 try {
  for(const width of [1440,768,390,320]) {
   const page=await browser.newPage({viewport:{width,height:1000}}), errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5178/tests/browser.html?mobile');
   await page.getByLabel('E-mail',{exact:true}).waitFor();
   await page.evaluate(()=>{
    const original=window.fetch;window.panoramaPedidos=[];window.panoramaErro=false;
    window.fetch=async(u,o={})=>{
     if(String(u)==='/api/agentes') {
      const body=JSON.parse(o.body);window.panoramaPedidos.push(body);
      if(window.panoramaErro&&body.modo==='acoes')return Response.json({erro:'Falha simulada'},{status:503});
      return Response.json(body.modo==='acoes'?{acoes:Array.from({length:10},(_,i)=>`${i+1}. **Revisar pendência do núcleo ${i+1}**\nContexto: **Município de São José · NUI${i+1}**\nMotivo/risco: **Prazo vencido**, andamento de 25/09/2026.\nResponsável: **Ana Souza**\nPrazo: **Hoje**, sugerido. ${i===9?'<img src=x onerror=alert(1)>':''}`).join('\n\n')}:{setor:body.setor,painel:{setor:body.setor,parado_dias:body.paradoDias,metas:{abertas:12,vencidas:3},nucleos:{total:20,parados:[]},andamentos:{}}});
     }
     return original(u,o);
    };
   });
   await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
   await page.getByLabel('Senha',{exact:true}).fill('fixture');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   await page.getByRole('navigation').waitFor({state:'attached'});
   if(await page.getByRole('button',{name:'Abrir menu',exact:true}).isVisible())await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
   await page.getByRole('navigation').getByRole('button',{name:/Agente/}).click();
   await page.locator('.agente-acao').nth(9).waitFor({state:'attached'});
   assert.equal(await page.locator('.agente-acao').count(),10);
   assert.equal(await page.locator('.agente-acao img').count(),0);
   assert.ok(await page.locator('.agente-acao strong').count()>=40);
   assert.ok(await page.locator('.agente-tiles').isVisible());
   const select=page.getByLabel('Parado há',{exact:true});
   assert.deepEqual(await select.locator('option').evaluateAll(es=>es.map(e=>e.value)),['7','15','30','45','60','90','180']);
   for(const dias of ['7','15']) {
    await select.selectOption(dias);
    await page.waitForFunction(d=>window.panoramaPedidos.filter(p=>p.paradoDias===Number(d)).length>=2,dias);
   }
   await page.getByRole('button',{name:'Atualizar sugestões',exact:true}).waitFor();
   await page.locator('.agente-acoes-rolagem').focus();await page.keyboard.press('End');
   await page.waitForFunction(()=>{const e=document.querySelector('.agente-acoes-rolagem');return e.scrollTop>0&&Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop)<2;});
   await page.locator('.agente-acoes-rolagem').evaluate(e=>e.scrollTo({top:0,behavior:'instant'}));await page.locator('.agente-acoes-rolagem').evaluate(e=>e.blur());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal');
   await page.screenshot({path:`tests/panorama-acoes-${width}.png`,fullPage:true});
   if(width===1440){
    await page.evaluate(()=>document.querySelector('.rb').classList.add('escuro'));
    await page.screenshot({path:'tests/panorama-acoes-escuro.png',fullPage:true});
    await page.evaluate(()=>window.panoramaErro=true);
    await page.getByRole('button',{name:'Atualizar sugestões',exact:true}).click();
    await page.getByText(/Falha simulada/).waitFor();assert.ok(await page.locator('.agente-tiles').isVisible());
    await page.evaluate(()=>window.panoramaErro=false);
    await page.getByRole('button',{name:'Atualizar sugestões',exact:true}).click();await page.locator('.agente-acao').nth(9).waitFor({state:'attached'});
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Panorama validado: 10 ações, negrito, ícones, filtros, indicadores, teclado, falha/recuperação, temas e quatro larguras.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

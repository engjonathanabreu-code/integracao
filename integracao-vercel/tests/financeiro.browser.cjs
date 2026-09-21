const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  for(const tipo of ['Financeiro','Administrador','Comercial','Topografia','Projetos','Pós-protocolo','Jurídico','Marketing']) {
   const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5178/tests/browser.html?financeiroTeste='+encodeURIComponent(tipo));
   await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
   await page.getByLabel('Senha',{exact:true}).fill('fixture');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   await page.getByRole('button',{name:'Financeiro',exact:true}).click();
   await page.getByRole('heading',{name:'Em construção',exact:true}).waitFor();
   const operacional=['Financeiro','Administrador'].includes(tipo);
   assert.equal(await page.locator('[data-acesso]').getAttribute('data-acesso'),operacional?'operacional':'consulta');
   assert.equal(await page.locator('[data-acesso] button, [data-acesso] input').count(),0);
   if(tipo==='Financeiro') {
    await page.screenshot({path:'/tmp/financeiro-desktop.png'});
    for(const tab of ['Clientes','Planos de trabalho','Calendário','Chat']) {
     await page.getByRole('button',{name:tab,exact:true}).first().click();
     if(tab==='Planos de trabalho')await page.getByRole('button',{name:'Novo plano',exact:true}).waitFor();
     if(tab==='Calendário')await page.getByRole('button',{name:'Novo evento',exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'Financeiro',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
    await page.getByRole('button',{name:'Financeiro',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('nav.nav').getBoundingClientRect().right<=0);
    await page.screenshot({path:'/tmp/financeiro-mobile.png'});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   }
   assert.deepEqual(errors,[]);console.log(tipo+': OK');await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

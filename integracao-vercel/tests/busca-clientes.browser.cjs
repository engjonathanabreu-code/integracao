// Run against the isolated fixture served by Vite; no real API calls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  for (const mobile of [false,true]) {
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
   page.setDefaultTimeout(10000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:5173/tests/browser.html?busca&calendario${mobile?'&perfil=topografia&mobile':''}`);
   await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
   await page.getByLabel('Senha',{exact:true}).fill('fixture-only');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   const home=async()=>{if(mobile)await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('button',{name:'Início',exact:true}).click();};
   const abrirBusca=async()=>{await page.getByRole('button',{name:/Buscar cliente PF/}).click();return page.getByRole('combobox',{name:'Buscar cliente por nome ou código'});};
   let input=await abrirBusca();await input.fill('JOAO');
   await page.getByRole('option',{name:/João Comércio/}).waitFor();
   assert.equal(await page.getByRole('option').count(),3);
   await page.screenshot({path:`/tmp/busca-clientes-${mobile?'mobile':'desktop'}.png`});
   await input.fill('comerc');await page.getByRole('option',{name:/João Comércio.*PJ/}).click();
   await page.getByRole('heading',{name:/João Comércio Ltda/}).waitFor();
   await home();input=await abrirBusca();await input.fill('avu_003');await page.getByRole('option',{name:/João Avulso/}).waitFor();await input.press('ArrowDown');await input.press('Enter');
   await page.getByRole('heading',{name:/João Avulso/}).waitFor().catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
   await page.getByRole('button',{name:'Atualizar dados',exact:true}).click();
   await page.getByText('Dados compartilhados no Supabase',{exact:true}).waitFor();
   await page.getByRole('heading',{name:/João Avulso/}).waitFor();
   await home();input=await abrirBusca();await input.fill('tst01_001');await page.getByRole('option',{name:/João da Silva/}).click();
   await page.getByRole('heading',{name:/João da Silva/}).waitFor();
   if(mobile)await page.getByRole('button',{name:'Abrir menu'}).click();
   await page.getByRole('button',{name:'Clientes',exact:true}).first().click();
   await page.getByRole('row').filter({hasText:'Município teste'}).getByText('Município teste',{exact:true}).click();
   input=page.getByRole('combobox');await input.fill('joao').catch(async e=>{console.log('MUNICIPIO',await page.locator('body').innerText());throw e;});
   assert.equal(await page.getByRole('option').count(),2);
   await page.getByRole('option',{name:/João Comércio/}).click();
   await page.getByRole('heading',{name:/João Comércio Ltda/}).waitFor();
   assert.deepEqual(errors,[]);
   console.log('PASS',mobile?'mobile / topografia':'desktop / diretoria','PF, PJ, accent, prefix, orphan details, municipality search, keyboard, no runtime errors');
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

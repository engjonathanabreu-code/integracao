const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const mobile of (process.env.MOBILE_ONLY ? [true] : [false,true])){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const nav=async(name)=>{if(mobile)await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();};
  const login=async(perfil)=>{await page.evaluate(p=>history.replaceState(null,'',`?calendario&perfil=${p}`),perfil);await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('button',{name:/Buscar cliente PF/}).waitFor();await page.getByRole('button',{name:'Atualizar dados',exact:true}).click();await page.getByText('Dados compartilhados no Supabase',{exact:true}).waitFor();};
  const open=async()=>{await nav('Metas');await page.locator('.meta-card-corpo').filter({hasText:'Meta ativa da Ana'}).first().click();};
  const saved=async()=>{await page.getByText('Dados compartilhados no Supabase',{exact:true}).waitFor();};
  await page.goto(`http://127.0.0.1:5186/tests/browser.html?calendario&perfil=topografia${mobile?'&mobile':''}`);await login('topografia');
  for(let n=1;n<=2;n++){
   await open();assert.equal(await page.getByRole('button',{name:'Recusar conclusão',exact:true}).count(),0);
   await page.getByRole('button',{name:'Concluir',exact:true}).click().catch(async e=>{console.log('REQUEST',n,await page.locator('body').innerText());throw e;});await saved();
   assert.equal(await page.locator('.meta-card-corpo').filter({hasText:'Meta ativa da Ana'}).first().getByLabel(`${n-1} recusas de aprovação`,{exact:true}).count(),1);
   await nav('Sair');await login('diretoria');await open();await page.getByRole('button',{name:'Recusar conclusão',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Confirmar recusa',exact:true}).isDisabled(),true);
   await page.getByLabel('Motivo da recusa').fill(`Revisar planta, rodada ${n}`);await page.getByRole('button',{name:'Confirmar recusa',exact:true}).click();await saved();
   await page.locator('.meta-card-corpo').filter({hasText:'Meta ativa da Ana'}).first().getByLabel(`${n} recusas de aprovação`,{exact:true}).waitFor();
   const userCard=page.getByRole('button').filter({has:page.locator('strong').filter({hasText:'Ana Topografia'})});
   assert((await userCard.first().innerText()).includes(`${n} recusa(s) de aprovação`));
   if(n===2){await page.screenshot({path:`/tmp/recusas-metas-${mobile?'mobile':'desktop'}.png`});await page.getByRole('button',{name:'Atualizar dados',exact:true}).click();await saved();await page.locator('.meta-card-corpo').filter({hasText:'Meta ativa da Ana'}).first().getByLabel('2 recusas de aprovação',{exact:true}).waitFor();}
   await nav('Sair');await login('topografia');
  }
  await open();await page.getByRole('button',{name:'Concluir',exact:true}).click();await saved();await nav('Sair');await login('diretoria');await open();await page.getByRole('button',{name:'Aprovar conclusão',exact:true}).click();await saved();
  assert.deepEqual(errors,[]);console.log('PASS',mobile?'mobile':'desktop','two rejection/resubmit cycles, approval, persistence, user totals and permission boundary');await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

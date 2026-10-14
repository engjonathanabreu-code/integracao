const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
 try{for(const width of [1440,390])for(const perfil of ['Administrador','Topografia','Projetos'])for(const original of [true,false]){
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  if(original)await page.route('**/src/App.jsx*',async route=>{const response=await route.fetch(),body=await response.text(),fixed=/const timbradoMemoriais = useTimbrado\((\w+), m\?\.id\);/;assert(fixed.test(body));await route.fulfill({response,body:body.replace(fixed,'const timbradoMemoriais = useTimbrado($1, p.municipioId);')});});
  await page.goto('http://127.0.0.1:5178/tests/browser.html?mobile');await page.evaluate(perfil=>{window.baseFixture.profiles[0].tipo=perfil;window.baseFixture.profiles[0].setor='Projetos';},perfil);
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  if(width<600)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'Clientes',exact:true}).click();await page.getByRole('heading',{name:'Clientes',exact:true}).waitFor();
  const snapshot=async()=>page.evaluate(()=>JSON.stringify([window.baseFixture.profiles,window.baseFixture.fin_receb_municipios,window.baseFixture.processos_kanban,window.baseFixture.fin_receb_clientes]));const before=await snapshot();
  await page.getByText('Município teste',{exact:true}).first().click();await page.getByText(/NUI01/).first().click();
  if(original){await page.getByText('p is not defined',{exact:true}).waitFor();assert(errors.some(x=>x==='p is not defined'));}
  else{await page.getByRole('heading',{name:/NUI01/}).waitFor();assert.equal(await page.getByText('Esta tela não abriu',{exact:true}).count(),0);assert.deepEqual(errors,[]);}
  assert.equal(await snapshot(),before);results.push({width,perfil,mode:original?'original-error-reproduced':'fixed-render-confirmed',error:original?'p is not defined':null,recordsPreserved:true});await page.close();
 }}finally{await browser.close();}
 fs.mkdirSync('../../qa-evidence',{recursive:true});fs.writeFileSync('../../qa-evidence/clientes-hotfix-qa.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1});

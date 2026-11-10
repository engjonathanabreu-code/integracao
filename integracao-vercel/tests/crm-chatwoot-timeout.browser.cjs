const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:5178/tests/browser.html?crm&agentecomercial'+(width===390?'&mobile':''));
  await page.evaluate(()=>{const original=window.fetch;window.resumoFalha=true;window.consultasResumo=[];window.escritasTeste=[];
   window.fetch=async(input,opts={})=>{const url=String(input);if(url.includes('integracao_crm_chatwoot_resumo?')){window.consultasResumo.push(url);if(window.resumoFalha)return Response.json({message:'canceling statement due to statement timeout',code:'57014'},{status:500});}
    if((opts.method||'GET')!=='GET')window.escritasTeste.push(url);return original(input,opts);};});
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  if(width===390)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'CRM',exact:true}).click();
  await page.getByText('Não foi possível carregar o resumo do Chatwoot.',{exact:false}).waitFor();
  await page.getByRole('group',{name:'Seções do CRM'}).getByRole('button',{name:'Funil comercial',exact:true}).click();
  await page.getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).first().click();
  await page.getByText('Resumo do Chatwoot indisponível.',{exact:true}).first().waitFor();
  await page.evaluate(()=>{window.resumoFalha=false;window.escritasTeste=[];});
  await page.getByRole('button',{name:'Fechar ficha',exact:true}).click();
  await page.getByRole('button',{name:'Tentar resumo novamente',exact:true}).click();
  await page.getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).first().click();
  await page.getByText('2 conversa(s) · 12 mensagem(ns) registradas',{exact:true}).first().waitFor();
  assert.equal(await page.getByRole('button',{name:'Tentar resumo novamente',exact:true}).count(),0);
  const calls=await page.evaluate(()=>window.consultasResumo);assert(calls.every(u=>u.includes('&card_id=in.(')));assert(calls.length>=2);
  assert.deepEqual(await page.evaluate(()=>window.escritasTeste.filter(u=>!u.includes('/rpc/integracao_crm_delta'))),[]);assert.deepEqual(errors,[]);
  console.log(`PASS Comercial ${width}px: timeout não bloqueia funil/ficha; aviso e recuperação; filtros; sem gravações`);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

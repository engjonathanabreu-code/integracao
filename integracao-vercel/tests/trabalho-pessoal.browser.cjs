const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});try{
 for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const origin=process.env.BROWSER_TEST_ORIGIN||'http://127.0.0.1:5173';
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.routeWebSocket(/.*/,ws=>{if(new URL(ws.url()).host===new URL(origin).host)ws.connectToServer();else ws.close();});
 await page.goto((process.env.BROWSER_TEST_ORIGIN||'http://127.0.0.1:5173')+'/tests/trabalho-pessoal.html');
 for(const perfil of ['comercial','topografia','projeto','posprotocolo','juridico','financeiro','consulta','diretoria']){
 await page.getByLabel('Perfil',{exact:true}).selectOption(perfil);
 await page.getByText('Conferir levantamento',{exact:false}).waitFor();
 assert.equal(await page.getByText('META ALHEIA',{exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Abrir campo offline',exact:true}).count(),perfil==='topografia'?1:0);
 await page.getByRole('button',{name:/^Preparar entrega:/}).click();
 const preparo=await page.getByLabel('Preparo de entrega',{exact:true}).inputValue();
 assert.match(preparo,/Conferir levantamento/);assert.match(preparo,/SUGESTÕES, NÃO EXIGÊNCIAS/);
 assert.doesNotMatch(preparo,/META ALHEIA/);
 await page.getByRole('button',{name:'Fechar preparo',exact:true}).click();
 }
 await page.getByRole('button',{name:/^Preparar entrega:/}).click();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}}));
 await page.getByRole('button',{name:'Copiar preparo',exact:true}).click();await page.getByRole('status').filter({hasText:'Não foi possível'}).waitFor();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.preparoCopiado=text}}}));
 await page.getByRole('button',{name:'Copiar preparo',exact:true}).click();await page.getByRole('status').filter({hasText:'Preparo copiado'}).waitFor();
 assert.match(await page.evaluate(()=>window.preparoCopiado),/não enviado/);
 await page.getByRole('button',{name:'Fechar preparo',exact:true}).click();
 await page.getByRole('button',{name:'Preparar resumo de trabalho',exact:true}).click();
 assert.match(await page.getByLabel('Resumo de trabalho',{exact:true}).inputValue(),/Conferir levantamento/);
 // No clipboard permission granted: verify deterministic failure path then success via fixture-only stub.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}}));
 await page.getByRole('button',{name:'Copiar resumo',exact:true}).click();await page.getByRole('status').filter({hasText:'Não foi possível'}).waitFor();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiado=text}}}));
 await page.getByRole('button',{name:'Copiar resumo',exact:true}).click();await page.getByRole('status').filter({hasText:'Resumo copiado'}).waitFor();
 assert.match(await page.evaluate(()=>window.copiado),/não enviado/);
 await page.getByRole('button',{name:/^Abrir meta:/}).first().click();
 const rotaMeta=JSON.parse(await page.locator('output').textContent());
 assert.equal(rotaMeta.pag,'metas');assert.ok(rotaMeta.id);
 await page.getByRole('button',{name:'Abrir Metas para revisar',exact:true}).click();assert.equal(await page.locator('output').textContent(),'{"pag":"metas"}');
 await page.getByLabel('Perfil',{exact:true}).selectOption('topografia');await page.getByRole('button',{name:'Abrir campo offline',exact:true}).click();assert.equal(await page.locator('output').textContent(),'{"pag":"campoOffline","aba":"topografia"}');
 await page.getByRole('button',{name:/^Preparar entrega:/}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.screenshot({path:(process.env.BROWSER_TEST_OUTPUT||'/tmp')+'/trabalho-pessoal-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
 await page.getByRole('button',{name:'Fechar resumo',exact:true}).click();assert.equal(await page.getByLabel('Resumo de trabalho',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Preparar resumo de trabalho',exact:true}).click();await page.getByRole('button',{name:/^Preparar entrega:/}).click();await page.getByRole('button',{name:'Trocar usuário',exact:true}).click();await page.getByText('Nenhuma meta aberta atribuída nos dados carregados.').waitFor();assert.equal(await page.getByLabel('Resumo de trabalho',{exact:true}).count(),0);assert.equal(await page.getByLabel('Preparo de entrega',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);await page.close();
 }console.log('PASSOU: 8 perfis, desktop/mobile, resumo, copiar sucesso/falha, rotas e troca de usuário sem rede externa.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

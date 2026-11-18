const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_TEST_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_TEST_EXECUTABLE_PATH}:{})});
 try {
  for(const width of [390,1440])for(const modo of ['corrigido','workaround','homonimos']){
   const workaround=modo==='workaround';
   const page=await browser.newPage({viewport:{width,height:900}});
   page.setDefaultTimeout(15000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   if(workaround)await page.route('**/src/App.jsx*',async route=>{
    const response=await route.fetch(),body=await response.text();
    const catalogo=/const candidatos = nucleosParaCampoOffline\((\w+), \w+\.municipiosCarregados\)/;
    assert(catalogo.test(body));
    await route.fulfill({response,body:body.replace(catalogo,(_,db)=>`const candidatos = ${db}.nucleos.filter(n => ${db}.processos.some(p => p.nucleoId === n.id && ativo(p)))`)});
   });
   await page.goto((process.env.BROWSER_TEST_ORIGIN||'http://127.0.0.1:5186')+'/tests/browser.html?mobile');
   await page.evaluate(modo=>{
    const b=window.baseFixture,n=b.processos_kanban[0],c=b.fin_receb_clientes[0];
    b.profiles[0].tipo='Topografia';
    if(modo==='homonimos'){
     const copia={...n,id:'00000000-0000-4000-8000-000000000998',etapa_atual:'Comercial'};
     b.processos_kanban.push(copia);
     b.integracao_nucleos.push({colecao:'nucleos',registro_id:n.id,referencia_tabela:'processos_kanban',referencia_id:n.id,dados:{codigo:'GTB01_04',nomeIntegrado:'Piçarras 04',etapa:1,remessaId:b.fin_receb_remessas[0].id}});
    }
    b.integracao_moradores.push({colecao:'processos',registro_id:c.id,referencia_tabela:'fin_receb_clientes',referencia_id:c.id,dados:{nucleoId:n.id}});
    const fetchOriginal=window.fetch;
    window.fetch=(input,options)=>{
     const url=new URL(typeof input==='string'?input:input.url,location.href);
     if(url.pathname==='/api/resumo-moradores')return Promise.resolve(new Response(JSON.stringify({resumo:[]}),{headers:{'Content-Type':'application/json'}}));
     return fetchOriginal(input,options);
    };
   },modo);
   await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
   await page.getByLabel('Senha',{exact:true}).fill('fixture');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   if(width<600)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
   await page.getByRole('navigation').getByRole('button',{name:/Campo offline/}).click();
   if(workaround){
    await page.getByText('Nenhum núcleo encontrado.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Núcleo para pré-carregar').count(),0);
    if(width<600)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
    await page.getByRole('navigation').getByRole('button',{name:'Clientes',exact:true}).click();
    await page.getByText('Município teste',{exact:true}).first().click();
    await page.getByText(/NUI01/).first().click();
    await page.getByRole('heading',{name:/NUI01/}).waitFor();
    if(width<600)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
    await page.getByRole('navigation').getByRole('button',{name:/Campo offline/}).click();
   }
   const select=page.getByLabel('Núcleo para pré-carregar');
   await select.waitFor();
   assert.equal(await page.getByText('Nenhum núcleo pré-carregado ainda.',{exact:true}).count(),1);
   const search=page.getByLabel('Buscar núcleo por nome ou código');
   await search.fill('inexistente');await page.getByText('Nenhum núcleo encontrado.',{exact:true}).waitFor();
   await search.fill('Município teste');
   if(modo==='homonimos'){
    const antes=await page.evaluate(()=>JSON.stringify([window.baseFixture.processos_kanban,window.baseFixture.fin_receb_clientes,window.baseFixture.integracao_moradores,window.baseFixture.integracao_nucleos]));
    await select.selectOption('00000000-0000-4000-8000-000000000998');
    await page.getByRole('button',{name:'Pré-carregar',exact:true}).click();
    await page.getByText(/Este registro não tem moradores ativos vinculados/).waitFor();
    assert.equal(await select.locator('option[value="00000000-0000-4000-8000-000000000998"]').count(),0);
    assert.equal(await page.getByText('Nenhum núcleo pré-carregado ainda.',{exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>JSON.stringify([window.baseFixture.processos_kanban,window.baseFixture.fin_receb_clientes,window.baseFixture.integracao_moradores,window.baseFixture.integracao_nucleos])),antes);
    await search.fill('Piçarras');
   }
   const option=select.locator('option').filter({hasText:modo==='homonimos'?'Piçarras 04':'NUI01'});
   const value=await option.getAttribute('value');assert(value);
   await select.selectOption(value);
   await page.getByRole('button',{name:'Pré-carregar',exact:true}).click();
   await page.getByText('Morador Teste',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Núcleos no aparelho',exact:true}).click();
   await page.getByText('Todos os núcleos disponíveis já estão no aparelho.',{exact:true}).waitFor();
   await page.getByText('Simular sem internet',{exact:true}).click();
   assert.equal(await page.getByLabel('Simular sem internet').isChecked(),true);
   await page.getByText(/Precisa de internet para pré-carregar/).waitFor();
   assert.deepEqual(errors,[]);
   await page.close();
   console.log('PASS catálogo sem resumo, busca, pré-carga e offline',width,{modo});
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

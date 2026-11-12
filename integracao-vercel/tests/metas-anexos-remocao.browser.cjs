const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto('http://127.0.0.1:5178/tests/browser.html?mobile');
  await page.evaluate(()=>{baseFixture.profiles[0].tipo='Projetos';baseFixture.meta_setores[0].nome='Projeto';const d=new Date(),dia=d.getDay();d.setDate(d.getDate()-(dia===0?6:dia-1));baseFixture.metas[0].semana_inicio=d.toISOString().slice(0,10);baseFixture.metas[0].titulo='Meta de anexo fictício';});
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Metas',exact:true}).click();
  await page.locator('.meta-card-corpo').filter({hasText:'Meta de anexo fictício'}).first().click();await page.getByRole('dialog').waitFor();
  await page.evaluate(()=>{const buscar=window.fetch;window.fetch=(input,options)=>new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/conexao'?Promise.reject(new TypeError('offline fictício')):buscar(input,options);});
  await context.setOffline(true);await page.waitForFunction(async()=>!(await import('/src/conexao-rede.js')).temConexao());
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({name:'anexo-ficticio.txt',mimeType:'text/plain',buffer:Buffer.from('conteudo ficticio preservado')});
  await page.getByRole('button',{name:'Remover anexo-ficticio.txt',exact:true}).waitFor();
  const antes=await page.evaluate(async()=>{const {keys}=await window.storage.list('integracao-meta-arq-v1-');return {chave:keys[0],bytes:(await window.storage.get(keys[0])).value};});
  await page.getByRole('button',{name:'Remover anexo-ficticio.txt',exact:true}).click();
  await page.getByRole('dialog').getByText('Nenhum arquivo enviado.',{exact:true}).waitFor();
  const depois=await page.evaluate(async chave=>{try{return (await window.storage.get(chave)).value;}catch{return null;}},antes.chave);
  assert.equal(depois,antes.bytes,'remover metadado não apaga bytes referenciados por uma intenção anterior');
  const fila=await page.evaluate(async()=>{const conta=(await window.storage.get('integracao-ultima-conta')).value,{abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),f=abrirFilaIntencoes();try{return await f.listar(conta);}finally{await f.fechar();}});
  assert.ok(fila.some(i=>JSON.stringify(i.original).includes(antes.chave)),'original da intenção continua disponível');
  assert.equal(await page.evaluate(()=>baseFixture.meta_arquivos.length),0,'sem envio ao servidor offline');
  console.log(JSON.stringify({ok:true,handlerReal:true,indexedDBReal:true,remocaoSomenteMetadados:true,bytesEOriginaisPreservados:true,semDadosReais:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

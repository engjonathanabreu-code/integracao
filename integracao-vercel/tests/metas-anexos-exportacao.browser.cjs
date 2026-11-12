const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
  await page.goto('http://127.0.0.1:5178/tests/browser.html?mobile');
  await page.evaluate(()=>{baseFixture.profiles[0].tipo='Projetos';baseFixture.meta_setores[0].nome='Projeto';const d=new Date(),dia=d.getDay();d.setDate(d.getDate()-(dia===0?6:dia-1));baseFixture.metas[0].semana_inicio=d.toISOString().slice(0,10);baseFixture.metas[0].titulo='Meta de anexo fictício';});
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Metas',exact:true}).click();await page.locator('.meta-card-corpo').filter({hasText:'Meta de anexo fictício'}).first().click();
  await page.evaluate(()=>{const buscar=window.fetch;window.fetch=(input,options)=>new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/conexao'?Promise.reject(new TypeError('offline fictício')):buscar(input,options);});
  await context.setOffline(true);await page.waitForFunction(async()=>!(await import('/src/conexao-rede.js')).temConexao());
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({name:'anexo-ficticio.txt',mimeType:'text/plain',buffer:Buffer.from('conteudo ficticio preservado')});
  await page.getByRole('button',{name:'Remover anexo-ficticio.txt',exact:true}).waitFor();
  const original=await page.evaluate(async()=>{const {keys}=await window.storage.list('integracao-meta-arq-v1-');return {chave:keys[0],bytes:(await window.storage.get(keys[0])).value};});
  await page.getByRole('button',{name:'Remover anexo-ficticio.txt',exact:true}).click();await page.getByRole('dialog').getByText('Nenhum arquivo enviado.',{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).last().click();
  await page.evaluate(()=>{const buscar=window.fetch;window.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.pathname==='/api/conexao')return Promise.resolve(new Response('{}'));if(u.pathname.endsWith('/meta_checklist'))return Promise.resolve(new Response(JSON.stringify({message:'falha técnica fictícia'}),{status:503}));return buscar(input,options);};});
  await context.setOffline(false);await page.getByRole('button',{name:'Baixar cópia das alterações pendentes',exact:true}).waitFor();
  await page.evaluate(()=>{const blobs=new Map(),criar=URL.createObjectURL.bind(URL);window.copiasFicticias=[];URL.createObjectURL=b=>{const url=criar(b);blobs.set(url,b);return url;};const clicar=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){const blob=this.download&&blobs.get(this.href);if(!blob)return clicar.call(this);blob.text().then(texto=>window.copiasFicticias.push(JSON.parse(texto)));};});
  const exportar=async()=>{const n=await page.evaluate(()=>window.copiasFicticias.length);await page.getByRole('button',{name:'Baixar cópia das alterações pendentes',exact:true}).click();try{await page.waitForFunction(n=>window.copiasFicticias.length>n,n,{timeout:10000});}catch(e){console.error(await page.locator('[role=alert]').allTextContents());throw e;}return page.evaluate(n=>window.copiasFicticias[n],n);};
  const copia=await exportar();assert.equal(copia.recuperacaoAnexosMetas.completa,true);assert.equal(copia.recuperacaoAnexosMetas.arquivos[original.chave],original.bytes);assert.deepEqual(copia.recuperacaoAnexosMetas.ausentes,[]);
  await page.evaluate(()=>{const get=window.storage.get.bind(window.storage);window.storage.get=async(k,...args)=>{if(k.startsWith('integracao-meta-arq-v1-'))throw Error('falha de leitura fictícia');return get(k,...args);};});
  const parcial=await exportar();assert.equal(parcial.recuperacaoAnexosMetas.completa,false);assert.deepEqual(parcial.recuperacaoAnexosMetas.ausentes,[{chave:original.chave,codigo:'LEITURA_LOCAL_INDISPONIVEL'}]);
  await page.getByText(/Cópia parcial enviada para download/).waitFor();assert.equal(await page.evaluate(()=>baseFixture.meta_arquivos.length),0);
  assert.deepEqual(parcial.diario.intencoes.map(i=>i.original),copia.diario.intencoes.map(i=>i.original));
  console.log(JSON.stringify({ok:true,exportacaoReal:true,bytesAnexoRemovidoPreservados:true,copiaParcialSinalizada:true,originaisIntactos:true,semEnvioServidor:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

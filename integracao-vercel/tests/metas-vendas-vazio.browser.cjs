const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),erros=[];
  page.on('pageerror',e=>erros.push(e.message));
  await page.goto('http://127.0.0.1:5178/tests/browser.html?mobile');
  await page.evaluate(()=>{
   const b=window.baseFixture;b.profiles[0].tipo='Projetos';b.profiles[0].nome='Pessoa Projeto';b.meta_setores[0].nome='Projeto';
   const hoje=new Date(),dia=hoje.getDay();hoje.setDate(hoje.getDate()-(dia===0?6:dia-1));b.metas[0].semana_inicio=hoje.toISOString().slice(0,10);b.metas[0].titulo='Meta operacional fictícia';
  });
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('heading',{name:'Suas metas de vendas',exact:true}).waitFor();
  await page.getByText('Este quadro mostra metas comerciais de vendas. Nenhuma foi atribuída neste filtro.',{exact:true}).waitFor();
  const antes=await page.evaluate(()=>({metas:JSON.stringify(baseFixture.metas),responsaveis:JSON.stringify(baseFixture.meta_responsaveis),gravacoes:document.getElementById('diagnostico').textContent}));
  await page.getByRole('button',{name:'Ver metas operacionais',exact:true}).click();
  await page.getByRole('heading',{name:'Metas',exact:true}).first().waitFor();
  await page.getByText('Meta operacional fictícia',{exact:true}).first().waitFor();
  const depois=await page.evaluate(()=>({metas:JSON.stringify(baseFixture.metas),responsaveis:JSON.stringify(baseFixture.meta_responsaveis),gravacoes:document.getElementById('diagnostico').textContent}));
  assert.deepEqual(depois,antes,'navegação não altera nem recria metas');assert.deepEqual(erros,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'sem overflow horizontal');
  await context.close();
 }
 console.log(JSON.stringify({ok:true,perfilProjeto:true,desktopEMobile:true,metasComerciaisDistintas:true,rotaExistente:true,semGravacao:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 for(const tipo of ['Comercial','Administrador','Diretor Técnico','Diretor de Projetos','Atendimentos','Topografia','Projetos','Pós-protocolo','Jurídico','Financeiro','Consulta']){
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  await p.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:5182')+'/tests/browser.html?incompletos&tipo='+encodeURIComponent(tipo));
  await p.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('fixture');await p.getByRole('button',{name:'Entrar',exact:true}).click();
  await p.getByRole('button',{name:'Clientes',exact:true}).first().click();await p.getByPlaceholder('Buscar município ou prefixo').waitFor();
  assert.equal(await p.getByText('Município sem nome',{exact:true}).count(),2);
  await p.getByRole('row').filter({hasText:'Município teste'}).getByText('Município teste',{exact:true}).click();
  await p.getByRole('heading',{name:/Município teste/}).waitFor().catch(async e=>{console.log(await p.locator('body').innerText());throw e;});
  assert.equal(await p.getByText('Esta tela não abriu',{exact:true}).count(),0);
  await p.getByText('Município teste 01',{exact:true}).click();
  await p.getByText('Todos os moradores',{exact:true}).click().catch(async e=>{console.log(await p.locator('body').innerText());throw e;});
  await p.getByText('Morador sem código',{exact:true}).waitFor();
  assert.equal(await p.getByText('Esta tela não abriu',{exact:true}).count(),0);
  if(tipo==='Comercial')await p.screenshot({path:'/private/tmp/clientes-incompletos-municipio.png'});
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('Clientes, município e moradores com nomes/códigos ausentes: 11 perfis OK.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});

const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

async function abrir(page, mobile, tela) {
  if (mobile) await page.getByRole('button', {name:'Abrir menu'}).click();
  await page.getByRole('navigation').getByRole('button', {name:tela,exact:true}).click();
}

async function iniciar(browser, mobile) {
  const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1440,height:1000}});
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto((process.env.TEST_ORIGIN || 'http://127.0.0.1:5178') + '/tests/browser.html?busca&mobile');
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
  await page.getByLabel('Senha',{exact:true}).fill('fixture');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Atualizar dados',exact:true}).waitFor();
  return {context,page};
}

async function buscaGlobal(page) {
  await page.getByRole('button',{name:/Buscar cliente PF/}).click();
  return page.getByRole('combobox',{name:/Buscar cliente por nome, cônjuge ou código/});
}

async function testeBusca(page) {
  const busca = await buscaGlobal(page);
  await busca.fill('joao');
  await page.getByRole('option',{name:/João Avulso/}).waitFor();
  await busca.press('ArrowDown');
  assert.match(await page.getByRole('option',{selected:true}).innerText(),/João Avulso/);
  await page.evaluate(async()=>{
    const api = await import('/src/dados-compartilhados.js');
    const servidor = window.fetch;
    window.buscasTeste = 0;
    window.fetch = async(input,opcoes)=>{
      const url = new URL(typeof input==='string' ? input : input.url,location.href);
      const resposta = await servidor(input,opcoes);
      if (url.pathname.endsWith('/fin_receb_clientes') && url.searchParams.get('select')==='id,nome,codigo,municipio_id,remessa_id') {
        window.buscasTeste++;
        const linhas = await resposta.json();
        if(window.buscasTeste===1)await new Promise(r=>setTimeout(r,150));
        for(const row of linhas)if(row.codigo==='AVU_003')row.nome=window.buscasTeste===1?'João Antigo Transitório':'João da Revisão';
        return Response.json(linhas);
      }
      return resposta;
    };
    api.invalidarIndiceClientes();
    api.invalidarIndiceClientes();
    setTimeout(api.invalidarIndiceClientes,220);
  });
  await page.getByRole('option',{name:/João da Revisão/}).waitFor();
  assert.equal(await busca.inputValue(),'joao');
  assert.match(await page.getByRole('option',{selected:true}).innerText(),/João da Revisão/);
  assert.equal(await page.getByRole('option',{name:/João Antigo Transitório/}).count(),0);
  assert.equal(await page.evaluate(()=>window.buscasTeste),2);
  await page.getByRole('option',{name:/João da Silva/}).click();
  await page.getByRole('heading',{name:/João da Silva/}).waitFor();
}

async function testeCadastro(page,mobile) {
  const nome = page.getByLabel(/Nome completo/).first();
  await nome.fill('Rascunho do morador fictício');
  let avisos = 0;
  page.on('dialog',dialog=>{
    assert.match(dialog.message(),/Descartar o rascunho/);
    avisos++;
    if(avisos===1)void dialog.dismiss(); else void dialog.accept();
  });
  await abrir(page,mobile,'Início');
  assert.equal(await nome.inputValue(),'Rascunho do morador fictício');
  if (mobile && await page.getByRole('navigation').getByRole('button',{name:'Início',exact:true}).isVisible()) {
    await page.getByRole('navigation').getByRole('button',{name:'Início',exact:true}).click();
  } else {
    await abrir(page,mobile,'Início');
  }
  await page.getByRole('button',{name:/Buscar cliente PF/}).waitFor();
  assert.equal(avisos,2);
  page.removeAllListeners('dialog');
  const busca = await buscaGlobal(page);
  await busca.fill('tst01_001');
  await page.getByRole('option',{name:/João da Silva/}).click();
  assert.equal(await page.getByLabel(/Nome completo/).first().inputValue(),'João da Silva');
}

async function testeMeta(page,mobile) {
  await abrir(page,mobile,'Metas');
  await page.getByRole('button',{name:'Nova Meta',exact:true}).click();
  const dialogo = page.getByRole('dialog',{name:'Nova Meta'});
  const titulo = dialogo.getByLabel('Título da nova meta');
  await titulo.fill('Rascunho fictício da meta');
  let pedidos = 0;
  page.on('dialog',dialog=>{
    assert.match(dialog.message(),/Descartar o rascunho/);
    pedidos++;
    if(pedidos<3)void dialog.dismiss(); else void dialog.accept();
  });
  await titulo.press('Escape');
  assert.equal(await titulo.inputValue(),'Rascunho fictício da meta');
  await dialogo.getByRole('button',{name:'Fechar',exact:true}).click();
  assert.equal(await titulo.inputValue(),'Rascunho fictício da meta');
  await dialogo.getByRole('button',{name:'Voltar',exact:true}).click();
  await dialogo.waitFor({state:'hidden'});
  assert.equal(pedidos,3);
  await page.getByRole('button',{name:'Nova Meta',exact:true}).click();
  assert.equal(await titulo.inputValue(),'');
}

(async()=>{
  const browser = await chromium.launch({headless:true});
  try {
    for(const mobile of [false,true]) {
      const {context,page} = await iniciar(browser,mobile);
      await testeBusca(page);
      await testeCadastro(page,mobile);
      await testeMeta(page,mobile);
      console.log(mobile?'Móvel':'Desktop','busca revisada, seleção preservada, descarte explícito e formulário protegido.');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

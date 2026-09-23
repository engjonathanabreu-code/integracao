const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5193')+'/tests/browser.html?oficios');
 await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 async function nav(n){if(mobile)await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('navigation').getByRole('button',{name:n,exact:true}).click();}
 await nav('Metas');await page.getByRole('button',{name:'Ofícios',exact:true}).click();await page.getByRole('button',{name:'Gerar ofício',exact:true}).click();
 assert.equal(await page.getByLabel('Número do novo ofício',{exact:true}).inputValue(),'309');
 assert.doesNotMatch(await page.getByLabel('Destinatário / Prefeitura',{exact:true}).inputValue(),/Lontras/);
 assert.match(await page.getByLabel('Conteúdo do ofício',{exact:true}).inputValue(),/3\. Requerimentos/);
 await page.getByLabel('Ofício de referência',{exact:true}).fill('Ofício nº 88/2026');await page.getByLabel('Processo administrativo',{exact:true}).fill('123/2026');await page.getByLabel('Data do protocolo',{exact:true}).fill('2026-09-01');
 for(const [format,ext] of [['PDF','pdf'],['Word','docx']]){const wait=page.waitForEvent('download');await page.getByRole('button',{name:`Baixar ofício em ${format}`,exact:true}).click();await (await wait).saveAs(`/tmp/modelo-309-${mobile?'mobile':'desktop'}.${ext}`);}
 assert.equal(await page.evaluate(()=>window.oficiosTeste.length),0);
 await page.getByLabel('Conteúdo do ofício',{exact:true}).fill('Rascunho próprio preservado.');await page.getByRole('button',{name:'Fechar e guardar rascunho',exact:true}).click();
 await nav('Configurações');await page.getByRole('tab',{name:'Modelos e representantes',exact:true}).click();
 await page.getByLabel('Conteúdo padrão do ofício',{exact:true}).fill('1. Texto alterado nas configurações.');await page.getByLabel('Assinatura padrão do ofício',{exact:true}).fill('Assinatura configurada');await page.getByRole('button',{name:'Salvar modelo de ofício',exact:true}).click();
 await page.waitForFunction(()=>window.baseFixture.integracao_configuracoes.some(x=>x.registro_id==='modelosDoc'&&x.dados.valor.oficio?.assinatura==='Assinatura configurada'));
 await nav('Metas');await page.getByRole('button',{name:'Ofícios',exact:true}).click();await page.getByRole('button',{name:'Gerar ofício',exact:true}).click();
 assert.equal(await page.getByLabel('Conteúdo do ofício',{exact:true}).inputValue(),'Rascunho próprio preservado.');
 await page.getByRole('button',{name:'Aplicar modelo de Configurações',exact:true}).click();assert.equal(await page.getByLabel('Conteúdo do ofício',{exact:true}).inputValue(),'1. Texto alterado nas configurações.');assert.equal(await page.getByLabel('Nome e cargo para assinatura',{exact:true}).inputValue(),'Assinatura configurada');assert.equal(await page.getByLabel('Número do novo ofício',{exact:true}).inputValue(),'309');assert.equal(await page.getByLabel('Processo administrativo',{exact:true}).inputValue(),'123/2026');
 await page.screenshot({path:`/tmp/modelo-309-${mobile?'mobile':'desktop'}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();console.log('PASS',mobile?'mobile':'desktop','modelo, PDF/Word, configuração persistida, rascunho e numeração preservados');
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

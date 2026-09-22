const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
for(const width of [1440,390]){
 const p=await b.newPage({viewport:{width,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5178/tests/browser.html?crm');
 await p.evaluate(()=>{const fetchOriginal=window.fetch;window.crmTest={reads:0,writes:0,failWrite:true,failRead:false,active:0,max:0};window.fetch=async(input,options={})=>{const t=window.crmTest;if(String(input).includes('/integracao_crm_funil?')){t.reads++;t.active++;t.max=Math.max(t.max,t.active);try{if(t.reads===1||t.failRead)throw new DOMException('Fetch aborted','AbortError');await new Promise(r=>setTimeout(r,700));return await fetchOriginal(input,options);}finally{t.active--;}}if(String(input).includes('/rpc/integracao_crm_cadastrar_lead')){t.writes++;if(t.failWrite)throw new DOMException('Fetch aborted','AbortError');}return fetchOriginal(input,options);};});
 await p.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('fixture');await p.getByRole('button',{name:'Entrar',exact:true}).click();if(width<600)await p.getByRole('button',{name:'Abrir menu',exact:true}).click();await p.getByRole('button',{name:'CRM',exact:true}).click();
 await p.getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).waitFor();
 assert.equal(await p.getByRole('alert').count(),0);
 await p.evaluate(()=>{window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:'crm'}}));setTimeout(()=>window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:'crm'}})),500);});
 await p.waitForTimeout(2500);assert.equal(await p.evaluate(()=>window.crmTest.max),1);
 await p.getByRole('button',{name:'Cadastrar lead',exact:true}).click();const d=p.getByRole('dialog',{name:'Cadastrar lead',exact:true});await d.waitFor();
 assert.equal(await d.evaluate(el=>el.matches(':modal')),true);
 await d.getByLabel('Nome do lead').fill('Lead preservado');await d.getByLabel('Telefone',{exact:true}).fill('48999990000');await d.getByLabel('Município do lead').selectOption({index:1});await d.getByLabel('Responsável comercial',{exact:true}).selectOption({label:'Bia Comercial'});
 await d.getByRole('button',{name:'Salvar lead',exact:true}).click();await d.getByRole('alert').filter({hasText:'Seus campos foram preservados'}).waitFor();assert.equal(await d.getByLabel('Nome do lead').inputValue(),'Lead preservado');assert.equal(await p.evaluate(()=>window.crmTest.writes),1);
 const box=await d.boundingBox();assert.ok(box.width<=width-20);assert.equal(await d.evaluate(el=>el.scrollWidth>el.clientWidth),false);await d.screenshot({path:`/tmp/crm-modal-${width}.png`});
 await p.evaluate(()=>window.crmTest.failWrite=false);await d.getByRole('button',{name:'Salvar lead',exact:true}).click();await d.waitFor({state:'detached'});await p.getByText(/Lead cadastrado para Bia Comercial/).waitFor();
 await p.getByRole('button',{name:'Cadastrar lead',exact:true}).click();await d.waitFor();await p.keyboard.press('Escape');await d.waitFor({state:'detached'});
 await p.evaluate(()=>{window.crmTest.failRead=true;window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:'crm'}}));});await p.getByRole('alert').filter({hasText:'dados já exibidos foram preservados'}).waitFor();await p.getByRole('button',{name:'Abrir ficha de Morador Teste',exact:true}).waitFor();
 assert.deepEqual(errors,[]);await p.close();
}console.log('CRM: recuperação de leitura, cargas serializadas, modal desktop/mobile, erro sem perder campos, salvar e Escape OK');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

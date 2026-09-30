const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {for(const tipo of (process.env.TEST_PERFIS?.split(',')||['Administrador','Diretor de Projetos','Pós-protocolo','Comercial','Consulta'])) {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5184/tests/browser.html?protocolados&mobile&tipo='+encodeURIComponent(tipo));
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Processos',exact:true}).first().click();
  await page.getByRole('button',{name:'Processos Internos',exact:true}).waitFor();
  assert.equal(await page.locator('.quadro-col').count(),8);
  await page.getByRole('button',{name:'Processos Protocolados',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.quadro-col').length===7);
  const titles=await page.locator('.quadro-col .cabeca-coluna').allTextContents();
  assert(titles[0].includes('Parecer Social'));assert(titles[6].includes('CRF'));
  await page.getByText('Etapa a definir (1)',{exact:true}).click();await page.locator('.cartao').filter({hasText:'NUI02'}).waitFor();
  await page.locator('.cartao').filter({hasText:'NUI01'}).press('Enter');
  const pos=['Administrador','Diretor de Projetos','Pós-protocolo'].includes(tipo);
  assert.equal(await page.getByRole('button',{name:'Notificações',exact:true}).count(),pos?1:0);
  assert.equal(await page.getByRole('button',{name:'Novo andamento',exact:true}).count(),pos?1:0);
  if(pos){
   await page.getByRole('button',{name:'Notificações',exact:true}).click();
   await page.waitForFunction(()=>window.baseFixture.processos_kanban[0].etapa_prefeitura==='Notificações');
   assert.equal(await page.evaluate(()=>window.baseFixture.processos_kanban[0].etapa_atual),'Protocolo');
   await page.getByText('Configuração do agente IA do Chatwoot',{exact:true}).click();
   await page.getByLabel('Autorizar atendimento por IA neste núcleo',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Autorizar atendimento por IA neste núcleo',{exact:true}).isChecked(),false);
   await page.getByRole('button',{name:'Novo andamento',exact:true}).click();
   await page.getByLabel('O que contar ao morador',{exact:true}).fill('As notificações estão em preparação na prefeitura.');
   await page.getByLabel('Observação interna',{exact:true}).last().fill('Observação reservada da equipe para o histórico.');
   assert.equal(await page.getByLabel('Disponibilizar andamento ao agente IA do Chatwoot',{exact:true}).isChecked(),true);
   await page.getByRole('button',{name:'Registrar andamento',exact:true}).click();
   await page.waitForFunction(()=>window.baseFixture.processos_kanban_andamentos.length===1&&window.baseFixture.processos_kanban_observacoes.length===1);
   const b=await page.evaluate(()=>({a:window.baseFixture.processos_kanban_andamentos[0],h:window.baseFixture.processos_kanban_historico[0],n:window.baseFixture.processos_kanban[0]}));
   assert.equal(b.a.visivel_ia,true);assert.equal(b.a.status,'Notificações');assert.equal(b.h.fluxo,'prefeitura');assert.equal(b.n.pendencia,'');
   await page.getByText('Observação reservada da equipe para o histórico.',{exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'Fechar',exact:true}).last().click();
  if(tipo==='Administrador'){
   await page.screenshot({path:'/private/tmp/processos-protocolados-1440.png'});
   await page.setViewportSize({width:390,height:844});
   await page.waitForFunction(()=>document.querySelector('nav.nav').getBoundingClientRect().right<=0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log('Mobile medidas:',await page.evaluate(()=>Array.from(document.querySelectorAll('.contem.largo,[aria-label="Tipo de processo"],.cabeca,.quadro')).map(e=>({c:e.className,w:e.getBoundingClientRect().width,sw:e.scrollWidth,wrap:getComputedStyle(e).flexWrap}))));
   await page.screenshot({path:'/private/tmp/processos-protocolados-390.png'});
  }
  await page.getByRole('button',{name:'Processos Internos',exact:true}).click();
  assert.equal(await page.locator('.quadro-col').count(),8);
  assert.deepEqual(errors,[]);console.log(tipo+': abas, sete colunas, permissões'+(pos?', movimento, andamento IA, observação e histórico':''));
  await page.close();
 }} finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

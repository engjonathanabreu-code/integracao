const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
 try{for(const width of [1440,390,320])for(const ator of [1,70,71,72,73]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'||['blob:','data:'].includes(u.protocol)?r.continue():r.abort();});
  await page.goto('http://127.0.0.1:5178/tests/browser.html?crm&mobile');
  await page.evaluate(ator=>{
   const b=window.baseFixture,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
   b.profiles=b.profiles.filter(p=>![70,71,72,73].map(id).includes(p.id));
   const members=[70,71,72].map((n,i)=>({id:id(n),nome:'Comercial '+['A','B','C'][i]+' fictício',tipo:'Comercial',ativo:true,email:'teste@example.invalid'}));
   b.profiles.push(...members,{id:id(73),nome:'Comercial excluído fictício',tipo:'Comercial',ativo:true});
   if(ator!==1){b.profiles=b.profiles.filter(p=>p.id!==id(ator));b.profiles[0]={...members.find(p=>p.id===id(ator))||{id:id(73),nome:'Comercial excluído fictício',tipo:'Comercial',ativo:true},email:'teste@example.invalid'};}
   b.integracao_funil_comerciais=members.map(p=>({id:p.id,habilitado:true}));
   const legacy={versao:1,cidades:[{id:'legado',nome:'Cidade legada fictícia',uf:'RS',etapa:'nuvens',etiquetas:['Campo anterior preservado']}],nucleos:[],historico:[{id:'h-antigo',data:'2026-10-01T12:00:00Z',autor:'Admin fictício',acao:{tipo:'cidade',nome:'Cidade legada fictícia',etapa:'nuvens'}}]};
   b.integracao_configuracoes.push({colecao:'config',registro_id:'funilInstitucional',dados:{valor:structuredClone(legacy)}});
   b.integracao_funil_nuvem=[{id:'compartilhada',dados:legacy,revisao:0}];
   b.integracao_funis_institucionais=members.map((p,i)=>({id:p.id,revisao:1,dados:{versao:1,cidades:[{id:'cp'+i+'a',nome:'Município '+['A','B','C'][i]+' um fictício',uf:'SC',etapa:'prospeccao'},{id:'cp'+i+'b',nome:'Município '+['A','B','C'][i]+' dois fictício',uf:'SC',etapa:'prospeccao'},{id:'cc'+i,nome:'Município '+['A','B','C'][i]+' com núcleos fictício',uf:'SC',etapa:'carteiras'}],nucleos:['reserva','preparacao','venda'].map((c,k)=>({nucleoId:'n'+i+k,cidadeId:'cc'+i,nome:'Núcleo '+['A','B','C'][i]+' '+c+' fictício',carteira:c})),historico:[]}}));
   window.antesFunis=structuredClone({legacy:b.integracao_configuracoes,profiles:b.profiles,clientes:b.fin_receb_clientes,nucleos:b.processos_kanban,flows:b.integracao_funis_institucionais});
  },ator);
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('navigation').waitFor();
  if(width<600)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'CRM',exact:true}).click();await page.getByRole('button',{name:'CRM Institucional',exact:true}).click();
  if(ator===73){await page.getByText('Seu usuário não está habilitado para um funil individual.',{exact:true}).waitFor();assert.equal(await page.locator('.fi-painel').count(),0);}
  else{
   const cloud=page.getByRole('region',{name:'Nuvem institucional compartilhada',exact:true});await cloud.waitFor();assert.equal(await cloud.locator('.fi-nuvem .fi-card').count(),1);assert.equal(await cloud.getByText('Responsável',{exact:true}).count(),0);assert.equal(await page.getByText(/Legado sem responsável/).count(),0);
   const flow=page.getByRole('region',{name:ator===1?'Fluxo institucional — Consolidado dos comerciais':'Fluxo institucional — Comercial '+['A','B','C'][ator-70]+' fictício',exact:true});await flow.waitFor();
   assert.equal(await flow.locator('.fi-etapa').count(),4);assert.equal(await flow.locator('.fi-etapa .fi-card').count(),ator===1?15:5);
   assert.match(await flow.getByRole('region',{name:'Prospecção municipal',exact:true}).innerText(),ator===1?/6\/12 municípios/:/2\/4 municípios/);
   const metrics=await flow.locator('.fi-etapa .fi-card').evaluateAll(xs=>xs.map(x=>({height:x.getBoundingClientRect().height,width:x.getBoundingClientRect().width,actionsInside:[...x.querySelectorAll('.fi-card-acoes .btn')].every(b=>{const r=b.getBoundingClientRect(),c=x.getBoundingClientRect();return r.y>=c.y&&r.bottom<=c.bottom;})})));assert.equal(new Set(metrics.map(x=>x.height)).size,1);assert.equal(new Set(metrics.map(x=>x.width)).size,1);assert(metrics.every(x=>x.actionsInside));
   if(ator===1){
    const select=page.getByLabel('Filtrar funil por comercial',{exact:true});assert.equal(await select.locator('option').count(),4);
    for(const [n,name] of [[70,'A'],[71,'B'],[72,'C']]){await select.selectOption('00000000-0000-4000-8000-'+String(n).padStart(12,'0'));const selected=page.getByRole('region',{name:'Fluxo institucional — Comercial '+name+' fictício',exact:true});await selected.waitFor();assert.equal(await selected.locator('.fi-etapa .fi-card').count(),5);assert.match(await selected.getByRole('region',{name:'Prospecção municipal',exact:true}).innerText(),/2\/4 municípios/);assert.equal(await selected.locator('select').count(),0);assert.equal(await cloud.locator('.fi-nuvem .fi-card').count(),1);}
    await select.selectOption('todos');await flow.waitFor();
   }else{
    assert.equal(await page.getByLabel('Filtrar funil por comercial',{exact:true}).count(),0);
    for(const name of ['A','B','C'].filter(n=>n!==['A','B','C'][ator-70]))assert.equal(await flow.getByText(new RegExp('Município '+name+' ')).count(),0);
   }
   fs.mkdirSync('../../qa-evidence/funis-comerciais',{recursive:true});if(ator===1||ator===70)await page.locator('.crm-institucionais').screenshot({style:'.topo-janela{visibility:hidden}',path:`../../qa-evidence/funis-comerciais/${ator===1?'admin':'comercial'}-${width}.png`});
   if(ator===70){
    await cloud.locator('.fi-nuvem .fi-card').getByRole('button',{name:'Detalhes',exact:true}).click();const d=page.getByRole('dialog',{name:'Detalhes do registro institucional',exact:true});await d.waitFor();assert(await d.getByRole('button',{name:'Iniciar Prospecção',exact:true}).isDisabled());assert.match(await d.innerText(),/Campo anterior preservado/);await d.getByLabel('Responsável pela Prospecção',{exact:true}).selectOption('00000000-0000-4000-8000-000000000071');
    await page.evaluate(()=>window.baseFixture.integracao_funil_nuvem[0].revisao++);await d.getByRole('button',{name:'Iniciar Prospecção',exact:true}).click();await d.getByRole('alert').waitFor();assert.match(await d.getByRole('alert').innerText(),/Nuvem mudou/);assert.equal(await page.evaluate(()=>window.baseFixture.integracao_funil_nuvem[0].dados.cidades.length),1);await d.getByRole('button',{name:'Fechar detalhes do registro',exact:true}).click();await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
    await cloud.locator('.fi-nuvem .fi-card').getByRole('button',{name:'Detalhes',exact:true}).click();await d.getByLabel('Responsável pela Prospecção',{exact:true}).selectOption('00000000-0000-4000-8000-000000000071');await d.getByRole('button',{name:'Iniciar Prospecção',exact:true}).click();await page.waitForFunction(()=>window.baseFixture.integracao_funil_nuvem[0].dados.cidades.length===0);await d.getByRole('button',{name:'Fechar detalhes do registro',exact:true}).click();
    assert.equal(await flow.locator('.fi-etapa .fi-card').count(),5);assert(await page.evaluate(()=>{const b=window.baseFixture;return b.integracao_funis_institucionais.find(f=>f.id.endsWith('071')).dados.cidades.some(c=>c.id==='legado')&&!b.integracao_funis_institucionais.find(f=>f.id.endsWith('070')).dados.cidades.some(c=>c.id==='legado');}));
    assert(await page.evaluate(()=>JSON.stringify(window.baseFixture.integracao_funis_institucionais.find(f=>f.id.endsWith('072')))===JSON.stringify(window.antesFunis.flows.find(f=>f.id.endsWith('072')))));
   }
  }
  assert(await page.evaluate(()=>{const b=window.baseFixture,a=window.antesFunis;return ['profiles'].every(k=>JSON.stringify(b[k])===JSON.stringify(a[k]))&&JSON.stringify(b.fin_receb_clientes)===JSON.stringify(a.clientes)&&JSON.stringify(b.processos_kanban)===JSON.stringify(a.nucleos)&&JSON.stringify(b.integracao_configuracoes)===JSON.stringify(a.legacy);}));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);report.push({width,ator,sharedCloud:true,threeParticipants:true,isolatedFlows:true,adminSumAndFilters:true,explicitAssignment:true,legacyPreserved:true,cas:ator===70,unchangedCoreRecords:true,errors});console.log(JSON.stringify(report.at(-1)));await page.close();
 }}finally{await browser.close();}fs.writeFileSync('../../qa-evidence/funis-comerciais/roles-visual-qa.json',JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});

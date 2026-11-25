// Onda 1 do pente fino: o essencial visível em navegador, contra a fixture isolada.
// Sem dados reais nem rede. Capturas em BROWSER_TEST_OUTPUT (pente-fino-*.png).
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
const ORIGEM=process.env.TEST_ORIGIN||'http://127.0.0.1:5178';
(async()=>{const browser=await chromium.launch({headless:true});try{
 const entrar=async(page)=>{await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('navigation').waitFor();};
 // Metas do cenário: uma vencida há exatamente 5 dias (com item de checklist) e uma no prazo.
 const semearMetas=()=>{const b=window.baseFixture,dia=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const s=new Date();s.setDate(s.getDate()-((s.getDay()+6)%7));const semana=`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`;
  Object.assign(b.metas[0],{titulo:'Meta vencida fictícia',prazo:dia(-5),semana_inicio:semana,status:'Em andamento'});
  b.metas.push({...b.metas[0],id:'00000000-0000-4000-8000-000000000072',titulo:'Meta no prazo fictícia',prazo:dia(10)});
  b.meta_responsaveis.push({meta_id:'00000000-0000-4000-8000-000000000072',usuario_id:b.profiles[0].id});
  b.meta_checklist.push({id:'00000000-0000-4000-8000-000000000073',meta_id:b.metas[0].id,titulo:'Item fictício do checklist',concluido:false});
  b.integracao_notificacoes=[];};
 const visaoAtual=async(page,mobile)=>{if(mobile)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'Metas',exact:true}).click();await page.getByRole('button',{name:'Visão atual de Metas',exact:true}).click();await page.locator('.meta-card').first().waitFor();};
 const cartao=(page,titulo)=>page.locator('.meta-card').filter({hasText:titulo}).first();

 // 1, 2 e USO-M2: cartão de meta, confirmações do detalhe e aviso único de meta vencida.
 {const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(ORIGEM+'/tests/browser.html');await page.evaluate(semearMetas);await entrar(page);await visaoAtual(page,false);
  const vencida=cartao(page,'Meta vencida fictícia'),noPrazo=cartao(page,'Meta no prazo fictícia');
  assert.equal(await vencida.locator('.selo-status-meta').innerText(),'Atrasada há 5 dias');assert.match(await vencida.getAttribute('class'),/\batrasada\b/);
  assert.equal(await noPrazo.locator('.selo-status-meta').innerText(),'Em andamento');assert.doesNotMatch(await noPrazo.getAttribute('class'),/\batrasada\b/);
  await page.screenshot({path:'pente-fino-1-cartao-meta.png'});
  // USO-M2: uma meta vencida = um aviso, gravado uma única vez.
  await page.getByRole('button',{name:'Notificações, 1 não lidas',exact:true}).waitFor();
  await page.waitForFunction(()=>window.baseFixture.integracao_notificacoes.length===1);await page.waitForTimeout(2500);
  const avisos=await page.evaluate(()=>window.baseFixture.integracao_notificacoes.map(n=>n.dados.titulo));assert.deepEqual(avisos,['Meta vencida: Meta vencida fictícia']);
  await page.getByRole('button',{name:'Notificações, 1 não lidas',exact:true}).click();await page.getByRole('dialog',{name:'Notificações',exact:true}).getByText('Meta vencida: Meta vencida fictícia').first().waitFor();await page.screenshot({path:'pente-fino-7-aviso-meta-vencida.png'});await page.keyboard.press('Escape');
  // 2a: a lixeira do checklist pergunta antes de remover; "Voltar" preserva o item.
  await vencida.locator('.meta-card-corpo').click();await page.getByRole('button',{name:'Remover Item fictício do checklist',exact:true}).click();
  const remover=page.getByRole('dialog',{name:'Remover este item do checklist?',exact:true});await remover.waitFor();assert.match(await remover.innerText(),/"Item fictício do checklist" sairá do checklist da meta/);
  await remover.getByRole('button',{name:'Remover item',exact:true}).waitFor();await page.screenshot({path:'pente-fino-2a-confirma-checklist.png'});
  await remover.getByRole('button',{name:'Voltar',exact:true}).click();await remover.waitFor({state:'detached'});await page.getByRole('button',{name:'Remover Item fictício do checklist',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.baseFixture.meta_checklist.length),1);
  // 2b: "Arquivar" exige motivo (mínimo de 10 caracteres) antes de liberar o botão.
  await page.getByRole('button',{name:'Arquivar',exact:true}).click();const arquivar=page.getByRole('dialog',{name:'Arquivar esta meta?',exact:true});await arquivar.waitFor();
  const confirmar=arquivar.getByRole('button',{name:'Arquivar meta',exact:true});assert.equal(await confirmar.isDisabled(),true);await arquivar.getByLabel('Motivo',{exact:true}).fill('123456789');assert.equal(await confirmar.isDisabled(),true);
  await page.screenshot({path:'pente-fino-2b-arquivar-motivo.png'});await arquivar.getByLabel('Motivo',{exact:true}).fill('Motivo fictício de teste');assert.equal(await confirmar.isDisabled(),false);
  await arquivar.getByRole('button',{name:'Voltar',exact:true}).click();assert.equal(await page.evaluate(()=>window.baseFixture.metas.length),2);assert.deepEqual(erros,[]);await page.close();}

 // 3: em 390 px o formulário de meta fica em uma coluna e as ações ficam visíveis sem rolar.
 {const page=await browser.newPage({viewport:{width:390,height:844}}),erros=[];page.on('pageerror',e=>erros.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(ORIGEM+'/tests/browser.html?mobile');await page.evaluate(semearMetas);await entrar(page);await visaoAtual(page,true);
  await page.getByRole('button',{name:'Nova Meta',exact:true}).click();const modal=page.getByRole('dialog',{name:'Nova Meta',exact:true});await modal.waitFor();
  const medidas=await modal.evaluate(el=>{const campos=[...el.querySelectorAll('.meta-formulario input:not([type=checkbox]):not([type=hidden]),.meta-formulario select,.meta-formulario textarea')].filter(c=>c.offsetParent).map(c=>c.getBoundingClientRect());
   const lado=campos.some((a,i)=>campos.some((b,j)=>i<j&&a.top<b.bottom-4&&b.top<a.bottom-4&&(a.right<=b.left||b.right<=a.left)));
   const r=el.querySelector('.modal-rodape').getBoundingClientRect(),botoes=[...el.querySelectorAll('.modal-rodape button')].map(b=>({nome:b.innerText.trim(),r:b.getBoundingClientRect()}));
   const janela=el.querySelector('.modal').getBoundingClientRect();
   return {folgaSobRodape:Math.round(janela.bottom-r.bottom),campos:campos.length,lado,rodapeTopo:r.top,rodapeBase:r.bottom,botoes:botoes.map(b=>({nome:b.nome,visivel:b.r.top>=0&&b.r.bottom<=innerHeight&&b.r.left>=0&&b.r.right<=innerWidth,altura:b.r.height})),rolagemHorizontal:document.documentElement.scrollWidth>innerWidth,rolavel:el.querySelector('.modal').scrollHeight>el.querySelector('.modal').clientHeight};});
  console.log('formulario-390',JSON.stringify(medidas));
  assert.ok(medidas.campos>=4);assert.equal(medidas.lado,false,'nenhum campo ao lado de outro');assert.ok(medidas.rolavel,'o formulário é mais alto que a tela, então o rodapé precisa ser fixo');
  assert.deepEqual(medidas.botoes.map(b=>b.nome),['Voltar','Salvar']);assert.ok(medidas.botoes.every(b=>b.visivel),'ações visíveis sem rolar');assert.ok(medidas.rodapeBase<=844);assert.ok(Math.abs(medidas.folgaSobRodape)<=1,'o rodapé encosta na base da janela, sem faixa de conteúdo por baixo');assert.equal(medidas.rolagemHorizontal,false);
  await page.screenshot({path:'pente-fino-3-formulario-meta-390.png'});assert.deepEqual(erros,[]);await page.close();}

 // 4, 5 e 6: ficha do cliente (descartar), contrato bloqueado e valor "15.000".
 {const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(ORIGEM+'/tests/browser.html');
  // O painel de diagnóstico da fixture fica sobre a barra de salvar; ele não existe no aplicativo.
  await page.addStyleTag({content:'#diagnostico{display:none!important}'});
  // Cadastro incompleto de propósito: sem RG, profissão, nome da mãe e endereço.
  await page.evaluate(()=>{const b=window.baseFixture,c=b.fin_receb_clientes[0];for(const m of b.metas)m.prazo='2099-12-31';c.cpf_cnpj='52998224725';b.integracao_moradores.push({colecao:'processos',registro_id:c.id,referencia_id:c.id,referencia_tabela:'fin_receb_clientes',dados:{nucleoId:b.processos_kanban[0].id,etapa:1,requerente:{estadoCivil:'Solteiro(a)'},comercial:{modalidade:'À vista'}}});});
  await entrar(page);await page.getByRole('button',{name:/Buscar cliente PF/}).click();await page.getByRole('combobox',{name:'Buscar cliente por nome, cônjuge ou código'}).fill('Morador');await page.getByRole('option',{name:/Morador Teste/}).click();await page.getByRole('heading',{name:/Morador Teste/}).waitFor();
  // 4: "Descartar" pergunta antes de desfazer a edição.
  await page.getByRole('tab',{name:/Cadastro/}).click();const profissao=page.getByLabel('Profissão',{exact:true}).first();await profissao.fill('Profissão fictícia');
  await page.getByText('1 alteração não salva no cadastro',{exact:true}).waitFor();await page.getByRole('button',{name:'Descartar',exact:true}).click();
  const descarte=page.getByRole('dialog',{name:'Descartar as alterações da ficha?',exact:true});await descarte.waitFor();assert.match(await descarte.innerText(),/1 alteração não salva será perdida/);assert.equal(await profissao.inputValue(),'Profissão fictícia');
  await page.screenshot({path:'pente-fino-4-descartar-confirma.png'});
  await descarte.getByRole('button',{name:'Voltar',exact:true}).click();assert.equal(await profissao.inputValue(),'Profissão fictícia','Voltar mantém a edição');
  await page.getByRole('button',{name:'Descartar',exact:true}).click();await descarte.getByRole('button',{name:'Descartar 1 alteração',exact:true}).click();await page.getByText('1 alteração não salva no cadastro',{exact:true}).waitFor({state:'detached'});assert.equal(await profissao.inputValue(),'');
  // 5: contrato com cadastro incompleto lista o que falta e não oferece "Ver e baixar".
  await page.getByRole('tab',{name:/Comercial/}).click();const contrato=page.locator('.card').filter({has:page.locator('strong',{hasText:'Contrato de prestação de serviços'})}).last();await contrato.waitFor();
  const faltas=await contrato.innerText();console.log('contrato-bloqueado',JSON.stringify(faltas));
  for(const falta of ['Falta preencher:','Profissão do requerente principal','RG do requerente principal','Nome da mãe do requerente principal','Endereço do requerente (rua, número, bairro, município, UF, CEP)','Valor total do contrato'])assert.ok(faltas.includes(falta),`lista "${falta}"`);
  assert.equal(await contrato.getByRole('button',{name:'Ver e baixar'}).count(),0);await contrato.scrollIntoViewIfNeeded();await page.screenshot({path:'pente-fino-5-contrato-bloqueado.png'});
  // 6: "15.000" é quinze mil reais.
  const total=page.getByLabel('Valor total (R$)',{exact:true}).first();await total.fill('15.000');const resumo=page.locator('.faixa-especifica').filter({hasText:'será pago à vista'}).first();
  assert.match(await resumo.innerText(),/R\$\s15\.000,00 \(quinze mil reais\)/);await total.scrollIntoViewIfNeeded();await page.screenshot({path:'pente-fino-6-valor-15000.png'});
  assert.deepEqual(erros,[]);await page.close();}
 console.log('Onda 1: cartão de meta, confirmações, formulário em 390 px, descarte da ficha, contrato bloqueado e valor 15.000: OK');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

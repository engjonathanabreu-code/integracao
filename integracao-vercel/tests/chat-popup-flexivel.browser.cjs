const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});const errors=[];let casos=0;try{
 for(const largura of [1440,390]){
  for(const perfil of ['Administrador','Comercial','Topografia','Projetos','Jurídico','Financeiro','Consulta']){
   const p=await b.newPage({viewport:{width:largura,height:1000}});p.on('pageerror',e=>errors.push(e.message));
   await entrar(p,`chat&mobile&chatPerfil=${encodeURIComponent(perfil)}`);const janela=p.getByRole('dialog',{name:'Conversa com Ana Teste'});await janela.waitFor();await janela.getByText('Você pode revisar os documentos do núcleo?',{exact:true}).waitFor();
   await janela.getByRole('button',{name:'Fechar a janela',exact:true}).click();await janela.waitFor({state:'hidden'});
   await p.evaluate(()=>{window.baseFixture.erp_mensagens.push({id:crypto.randomUUID(),conversa_id:window.baseFixture.erp_conversas[0].id,autor_id:window.baseFixture.erp_conversas[0].participantes[1],texto:'Mensagem nova sem presença online',created_at:new Date(Date.now()+1000).toISOString()});window.simularRevisao('chat');});
   await janela.waitFor();await janela.getByText('Mensagem nova sem presença online',{exact:true}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(largura===390&&perfil==='Consulta')await p.screenshot({path:'/private/tmp/chat-popup-consulta-mobile.png'});casos++;await p.close();
  }
  const p=await b.newPage({viewport:{width:largura,height:1000}});p.on('pageerror',e=>errors.push(e.message));await entrar(p,'ponto&mobile');if(largura===390)await p.getByRole('button',{name:'Abrir menu'}).click();await p.getByRole('button',{name:'Configurações',exact:true}).click();await p.getByRole('tab',{name:'Folha Ponto',exact:true}).click();await p.getByText('Vínculo e jornada de Equipe Teste',{exact:true}).click();await p.getByRole('button',{name:'Configurar CLT / Contrato'}).click();
  await p.getByRole('checkbox',{name:/Horário flexível/}).check();assert.equal(await p.getByLabel('Entrada prevista').count(),0);assert.equal(await p.getByLabel('Saída prevista').count(),0);await p.getByLabel('Carga de Sex (horas e minutos)').fill('06:30');await p.getByRole('button',{name:'Salvar vínculo e jornada'}).click();await p.getByText(/Horário flexível · Seg 08:00.*Sex 06:30/).waitFor();
  await p.getByRole('button',{name:'Configurar CLT / Contrato'}).click();assert.equal(await p.getByLabel('Carga de Sex (horas e minutos)').inputValue(),'06:30');await p.getByLabel('Carga de Seg (horas e minutos)').fill('24:01');await p.getByRole('button',{name:'Salvar vínculo e jornada'}).click();await p.getByRole('alert').getByText(/até 24 horas/).waitFor();await p.getByLabel('Carga de Seg (horas e minutos)').fill('08:00');if(largura===390)await p.screenshot({path:'/private/tmp/ponto-flexivel-mobile.png'});
  await p.getByLabel('Vínculo',{exact:true}).selectOption('Contrato');assert.equal(await p.getByRole('checkbox',{name:/Horário flexível/}).count(),0);await p.getByLabel('Entrada prevista').waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));casos++;await p.close();
 }
 assert.deepEqual(errors,[]);console.log(`${casos} verificações: popup nos sete perfis, mensagens durante a sessão e CLT flexível em desktop/celular: OK`);
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
async function entrar(p,query){await p.goto(`http://127.0.0.1:5182/tests/browser.html?${query}`);await p.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('fixture');await p.getByRole('button',{name:'Entrar',exact:true}).click();}

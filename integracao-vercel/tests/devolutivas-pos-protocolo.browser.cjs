const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();
  const origem=process.env.BASE_URL||'http://127.0.0.1:5189';
  await page.goto(`${origem}/tests/browser.html?calendario&financeiroTeste=${encodeURIComponent('Pós-protocolo')}`);
  const id=await page.evaluate(()=>{
   const b=window.baseFixture,m=b.metas[0];
   m.titulo='Devolutiva de outro autor';m.prazo='2026-11-28';m.created_by=b.profiles.find(p=>p.id!==b.profiles[0].id).id;
   m.associacao_tipo='processo';m.associacao_id=b.processos_kanban[0].id;
   b.meta_responsaveis=b.meta_responsaveis.filter(r=>r.meta_id!==m.id);
   b.integracao_metas.push({colecao:'metas',registro_id:m.id,referencia_tabela:'metas',referencia_id:m.id,dados:{devolutiva:{origem:'Prefeitura',chegada:'2026-11-15',prazo:'2026-12-01',textoOriginal:'Original fictício',analiseIA:{etapa1:{resumo:'Resumo preservável',itens:[]}}}}});
   window.analisesDevolutiva=0;
   const fetch=window.fetch;
   window.fetch=(input,options)=>{
    if(String(input)==='/api/ia'){window.analisesDevolutiva++;return Promise.reject(Error('IA não é parte deste envio'));}
    return fetch(input,options);
   };
   return m.id;
  });
  await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
  await page.getByLabel('Senha',{exact:true}).fill('fixture');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Metas',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Nova Meta',exact:true}).count(),0);
  await page.getByRole('button',{name:'Devolutivas',exact:true}).click();
  await page.getByText('Devolutiva de outro autor',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Atribuir / editar meta',exact:true}).count(),0);
  await page.getByRole('button',{name:'Editar devolutiva',exact:true}).click();
  const editar=page.getByRole('dialog',{name:'Editar devolutiva',exact:true});
  await editar.getByLabel('Prazo final (opcional)',{exact:true}).fill('2026-12-21');
  await editar.locator('#dcarq').setInputFiles({name:'html-disfarcado.pdf',mimeType:'text/html',buffer:Buffer.from('<b>fixture</b>')});
  await editar.getByText('Selecione PDF ou imagem.',{exact:true}).waitFor();
  await editar.locator('#dcarq').setInputFiles(Array.from({length:6},(_,i)=>({name:`excesso-${i}.pdf`,mimeType:'application/pdf',buffer:Buffer.from('%PDF-fixture')})));
  await editar.getByText('Cada devolutiva permite até 5 arquivos.',{exact:true}).waitFor();
  await editar.locator('#dcarq').setInputFiles({name:'retorno-ficticio.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%fixture')});
  await editar.getByRole('button',{name:'Salvar',exact:true}).click();
  await editar.waitFor({state:'hidden'});
  await page.getByText(/Prazo da devolutiva: 21\/12\/2026/).waitFor();
  const salvo=await page.evaluate(id=>{
   const base=window.baseFixture,d=base.integracao_metas.find(r=>r.registro_id===id).dados.devolutiva;
   return {prazo:d.prazo,prazoMeta:base.metas.find(m=>m.id===id).prazo,analise:d.analiseIA.etapa1.resumo,anexos:base.meta_arquivos.filter(a=>a.meta_id===id&&a.nome==='retorno-ficticio.pdf').length,ia:window.analisesDevolutiva};
  },id);
  assert.deepEqual(salvo,{prazo:'2026-12-21',prazoMeta:'2026-11-28',analise:'Resumo preservável',anexos:1,ia:0});
  await page.getByRole('button',{name:'Cadastrar devolutiva',exact:true}).click();
  const cadastro=page.getByRole('dialog',{name:'Cadastrar devolutiva',exact:true});
  await cadastro.getByRole('listbox',{name:'Município (obrigatório)'}).getByRole('option').first().click();
  await cadastro.getByRole('listbox',{name:'Núcleo (obrigatório)'}).getByRole('option').first().click();
  await cadastro.getByLabel('Texto da devolutiva',{exact:true}).fill('Cadastro fictício sem IA');
  await cadastro.getByRole('button',{name:'Salvar',exact:true}).click();
  await cadastro.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.baseFixture.integracao_metas.filter(r=>r.dados.devolutiva?.textoOriginal==='Cadastro fictício sem IA').length),1);
  assert.equal(await page.evaluate(()=>window.analisesDevolutiva),0);
  console.log('PASS perfil Pós-protocolo edita/anexa de forma seletiva, sem IA ou gerência geral; novo cadastro persistido.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

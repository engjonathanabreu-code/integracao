// Real UI flow against the isolated fixture. No production data or network writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5187')+'/tests/browser.html'+(mobile?'?mobile':''));
 await page.getByLabel('E-mail',{exact:true}).waitFor();
 await page.evaluate(()=>{const b=window.baseFixture,c=b.fin_receb_clientes[0];c.cpf_cnpj='52998224725';b.integracao_moradores.push({colecao:'processos',registro_id:c.id,referencia_id:c.id,referencia_tabela:'fin_receb_clientes',dados:{nucleoId:b.processos_kanban[0].id,etapa:4,requerente:{profissao:'Autônomo',estadoCivil:'Solteiro(a)',rg:'1234567'},social:{rendaFamiliar:'2400',modalidade:'REURB-S'},endereco:{logradouro:'Rua das Flores',numero:'123',bairro:'Centro',municipio:'Município teste',uf:'SC',cep:'89000000'},comercial:{modalidade:'À vista',valorTotal:'2400'},distrato:{registradoEm:'2026-09-22',tipo:'sem_acerto',motivo:'Encerramento de teste',comarca:'Município teste'},qualificacaoRequerente:{quali_compromisso:'Morador Teste, CPF 529.982.247-25'},compromisso:{itens:{agua:true},prazos:{agua:'90'}}}});});
 await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('button',{name:/Buscar cliente PF/}).click();await page.getByRole('combobox',{name:'Buscar cliente por nome ou código'}).fill('Morador');await page.getByRole('option',{name:/Morador Teste/}).click();
 await page.getByRole('heading',{name:/Morador Teste/}).waitFor();await page.getByRole('tab',{name:/Comercial/}).click();
 for(const nome of ['Declaração de renda','Contrato de prestação de serviços','Distrato do contrato']){
  await page.locator('.card').filter({has:page.locator('strong',{hasText:nome})}).last().getByRole('button',{name:'Ver e baixar'}).click();
  const modal=page.getByRole('dialog',{name:nome,exact:true});await modal.getByTitle(`Prévia de ${nome}`).waitFor();
  for(const formato of ['PDF','Word']){
   const downloadPromise=page.waitForEvent('download');await modal.getByRole('button',{name:`Baixar ${formato}`,exact:true}).click();const file=await downloadPromise;const ext=formato==='PDF'?'pdf':'docx';assert.ok(file.suggestedFilename().endsWith('.'+ext));
   const path=`/tmp/integracao-documentos-qa/ui-${mobile?'mobile':'desktop'}-${file.suggestedFilename()}`;await file.saveAs(path);const bytes=await fs.readFile(path);assert.equal(bytes.subarray(0,formato==='PDF'?5:2).toString(),formato==='PDF'?'%PDF-':'PK');
  }
  await modal.getByRole('button',{name:'Fechar',exact:true}).last().click();
 }
 await page.getByRole('button',{name:'Gerar termo',exact:true}).click();const termo=page.getByRole('dialog',{name:'Termo de compromisso',exact:true});const dl=page.waitForEvent('download');await termo.getByRole('button',{name:'Baixar PDF',exact:true}).click();assert.ok((await dl).suggestedFilename().endsWith('.pdf'));await termo.getByRole('button',{name:'Fechar',exact:true}).last().click();
 await page.getByText('Histórico de documentos (7)',{exact:true}).waitFor();
 await page.screenshot({path:`/tmp/integracao-documentos-qa/comercial-${mobile?'mobile':'desktop'}.png`,fullPage:true});assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log('PASS',mobile?'mobile':'desktop','renda, contrato, distrato, termo; Word/PDF; sem erros');await page.close();
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

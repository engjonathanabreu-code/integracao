const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),JSZip=require('jszip');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
   page.setDefaultTimeout(15000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto((process.env.TEST_URL||'http://127.0.0.1:5188')+'/tests/browser.html'+(mobile?'?mobile':''));
   await page.getByLabel('E-mail',{exact:true}).waitFor();
   await page.evaluate(()=>{const b=window.baseFixture,c=b.fin_receb_clientes[0];c.cpf_cnpj='52998224725';c.valor_global=7500;c.valor_entrada=700;c.numero_parcelas=10;c.valor_parcela=680;b.integracao_moradores.push({colecao:'processos',registro_id:c.id,referencia_id:c.id,referencia_tabela:'fin_receb_clientes',dados:{nucleoId:b.processos_kanban[0].id,etapa:4,requerente:{profissao:'Autônomo',estadoCivil:'Solteiro(a)',rg:'1234567',mae:'Mãe de Teste'},endereco:{logradouro:'Rua de Teste',numero:'123',bairro:'Centro',municipio:'Município teste',uf:'SC',cep:'89000000'},comercial:{modalidade:'Entrada e parcelas'}}});});
   const finAntes=await page.evaluate(()=>structuredClone(window.baseFixture.fin_receb_clientes[0]));
   await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
   await page.getByLabel('Senha',{exact:true}).fill('fixture');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   await page.getByRole('button',{name:/Buscar cliente PF/}).click();
   await page.getByRole('combobox',{name:'Buscar cliente por nome, cônjuge ou código'}).fill('Morador');
   await page.getByRole('option',{name:/Morador Teste/}).click();
   await page.getByRole('tab',{name:/Comercial/}).click();
   await page.getByLabel('Forma de venda',{exact:true}).selectOption('Com Entrada Parcelada');
   await page.getByLabel('Valor total (R$)',{exact:true}).fill('3.500,00');
   await page.getByLabel('Parcelas da entrada',{exact:true}).selectOption('2');
   await page.getByLabel('1ª parcela da entrada (R$)',{exact:true}).fill('200,01');
   await page.getByLabel('2ª parcela da entrada (R$)',{exact:true}).fill('299,99');
   await page.getByLabel('Vencimento da 1ª parcela da entrada',{exact:true}).fill('2026-11-30');
   await page.getByLabel('Vencimento da 2ª parcela da entrada',{exact:true}).fill('2026-12-10');
   await page.getByLabel('Parcelas do saldo',{exact:true}).fill('7');
   await page.getByLabel('Primeiro vencimento do saldo',{exact:true}).fill('2027-01-15');
   await page.getByLabel('Dia de vencimento do saldo',{exact:true}).fill('15');
   assert.equal(await page.getByLabel('Valor da parcela do saldo (R$)',{exact:true}).inputValue(),'428,57');
   const venda=page.locator('section').filter({has:page.getByLabel('Forma de venda',{exact:true})});
   await venda.getByRole('button',{name:'Salvar',exact:true}).click();
   await page.waitForFunction(()=>window.baseFixture.integracao_moradores.some(r=>r.dados.planoEntradaParcelada?.parcelasEntrada.length===2));
   assert.deepEqual(await page.evaluate(()=>window.baseFixture.fin_receb_clientes[0]),finAntes);
   await page.locator('.card').filter({has:page.locator('strong',{hasText:'Contrato de prestação de serviços'})}).last().getByRole('button',{name:'Ver e baixar'}).click();
   const modal=page.getByRole('dialog',{name:'Contrato de prestação de serviços',exact:true});
   await modal.getByTitle('Prévia de Contrato de prestação de serviços').waitFor();
   const download=page.waitForEvent('download');
   await modal.getByRole('button',{name:'Baixar Word',exact:true}).click();
   const arquivo=await download;
   const zip=await JSZip.loadAsync(await fs.readFile(await arquivo.path()));
   const xml=await zip.file('word/document.xml').async('string');
   const texto=xml.replace(/<[^>]+>/g,' ');
   for(const v of ['200,01','299,99','3.000,00','428,57','428,58','30/11/2026','10/12/2026','15/01/2027'])assert.ok(texto.includes(v),v);
   assert.deepEqual(errors,[]);
   console.log('PASS',mobile?'mobile':'desktop');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

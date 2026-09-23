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

 const venda=()=>page.locator('section').filter({has:page.getByLabel('Forma de venda',{exact:true})});
 await page.getByLabel('Forma de venda',{exact:true}).selectOption('Entrada e parcelas');
 await page.getByLabel('Valor total (R$)',{exact:true}).fill('3500,00');
 await page.getByLabel('Entrada (R$)',{exact:true}).fill('500,01');
 await page.getByLabel('Parcelas',{exact:true}).fill('20');
 await page.getByLabel('Dia de vencimento',{exact:true}).fill('15');
 assert.equal(await page.getByLabel('Valor da parcela (R$)',{exact:true}).inputValue(),'149,99');
 await venda().getByRole('button',{name:'Salvar',exact:true}).click();
 await page.waitForFunction(()=>window.baseFixture.fin_receb_clientes.some(r=>Number(r.valor_entrada)===500.01)).catch(async e=>{console.log(JSON.stringify(await page.evaluate(()=>window.baseFixture.fin_receb_clientes)));throw e;});
 await page.getByRole('button',{name:'Ver a regra do núcleo',exact:true}).click();
 await page.getByLabel('Valor total (R$)',{exact:true}).fill('4000,00');
 await page.getByLabel('Forma de venda',{exact:true}).selectOption('Entrada e parcelas');
 await page.getByLabel('Informar entrada em',{exact:true}).selectOption('percentual');
 await page.getByLabel('Entrada (%)',{exact:true}).fill('10');
 await page.getByLabel('Parcelas',{exact:true}).fill('12');
 assert.equal(await page.getByLabel('Valor da parcela (R$)',{exact:true}).inputValue(),'300,00');
 await venda().getByRole('button',{name:'Salvar',exact:true}).click();
 await page.waitForFunction(()=>window.baseFixture.integracao_nucleos.some(r=>r.dados.comercial?.entrada==='400,00'));
 if(mobile)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
 await page.getByRole('button',{name:'Início',exact:true}).click();
 await page.getByRole('button',{name:/Buscar cliente PF/}).click();
 await page.getByRole('combobox',{name:'Buscar cliente por nome ou código'}).fill('Morador');await page.getByRole('option',{name:/Morador Teste/}).click();
 await page.getByRole('tab',{name:/Comercial/}).click();
 assert.equal(await page.getByLabel('Entrada (R$)',{exact:true}).inputValue(),'500,01');
 await page.locator('.card').filter({has:page.locator('strong',{hasText:'Contrato de prestação de serviços'})}).last().getByRole('button',{name:'Ver e baixar'}).click();
 const modal=page.getByRole('dialog',{name:'Contrato de prestação de serviços',exact:true});
 await modal.getByTitle('Prévia de Contrato de prestação de serviços').waitFor();
 const download=page.waitForEvent('download');await modal.getByRole('button',{name:'Baixar PDF',exact:true}).click();await(await download).saveAs('/tmp/contrato-referencia/final-'+(mobile?'mobile':'desktop')+'.pdf');
 await page.screenshot({path:'/tmp/contrato-referencia/tela-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS',mobile?'mobile':'desktop','entrada em reais e %, persistência, condição própria, PDF');await page.close();
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

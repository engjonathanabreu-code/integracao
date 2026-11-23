const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const JSZip=require('jszip');
async function extrair(download){
 const arquivo=await fs.readFile(await download.path());
 const zip=await JSZip.loadAsync(arquivo);
 return (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g,' ');
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  for(const mobile of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
   const erros=[];page.on('pageerror',e=>erros.push(e.message));page.setDefaultTimeout(15000);
   await page.goto((process.env.TEST_URL||'http://127.0.0.1:5187')+'/tests/browser.html'+(mobile?'?mobile':''));
   await page.getByLabel('E-mail',{exact:true}).waitFor();
   await page.evaluate(()=>{
    const b=window.baseFixture,c=b.fin_receb_clientes[0];c.cpf_cnpj='52998224725';
    b.integracao_moradores.push({colecao:'processos',registro_id:c.id,referencia_id:c.id,referencia_tabela:'fin_receb_clientes',dados:{
     nucleoId:b.processos_kanban[0].id,etapa:4,requerente:{estadoCivil:'Casado(a)',profissao:'Autônomo'},
     conjuge:{nome:'Conjugue Teste',cpf:'11144477735',profissao:'Professora',beneficiario:'nao'},
     corequerentes:[{id:'outro-teste',tipo:'normal',pessoa:{nome:'Pessoa Requerente B',cpf:'12345678909'}}],
     endereco:{logradouro:'Rua Fictícia',numero:'12'},social:{rendaFamiliar:'2400',modalidade:'REURB-S'}
    }});
   });
   await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');
   await page.getByLabel('Senha',{exact:true}).fill('fixture');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   await page.getByRole('button',{name:/Buscar cliente PF/}).click();
   await page.getByRole('combobox',{name:'Buscar cliente por nome, cônjuge ou código'}).fill('Morador');
   await page.getByRole('option',{name:/Morador Teste/}).click();
   await page.getByRole('tab',{name:/Comercial/}).click();
   for(const [nome,op,esperado,cpf] of [
    ['Declaração de renda','conjuge','Conjugue Teste','111.444.777-35'],
    ['Termo de responsabilidade pela veracidade das informações','corequerentes:outro-teste','Pessoa Requerente B','123.456.789-09'],
   ]){
    await page.getByLabel(`Declarante para ${nome}`,{exact:true}).selectOption(op);
    const card=page.locator('.card').filter({has:page.getByText(nome,{exact:true})}).last();
    await card.getByRole('button',{name:'Ver e baixar'}).click();
    const modal=page.getByRole('dialog',{name:nome,exact:true});
    await modal.getByTitle(`Prévia de ${nome}`).waitFor();
    const dl=page.waitForEvent('download');await modal.getByRole('button',{name:'Baixar Word',exact:true}).click();
    const texto=await extrair(await dl);
    assert.ok(texto.includes(esperado));assert.ok(texto.includes(cpf));assert.ok(!texto.includes('529.982.247-25'));
    assert.ok(!texto.includes('Morador Teste'));
    if(op==='conjuge')assert.ok(texto.includes('2.400,00'));
    else assert.ok(texto.includes('VERACIDADE DAS INFORMAÇÕES'));
    await modal.getByRole('button',{name:'Fechar',exact:true}).last().click();
   }
   assert.deepEqual(erros,[]);await page.close();
   console.log('PASS',mobile?'mobile':'desktop','declaração do cônjuge e termo do requerente escolhido');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const b=await chromium.launch({headless:true});try{
 const p=await b.newPage();p.on('dialog',d=>d.accept());await p.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:5178')+'/tests/browser.html?sincronizacao');
 await p.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('fixture');await p.getByRole('button',{name:'Entrar',exact:true}).click();
 await p.getByRole('button',{name:'Clientes',exact:true}).click();await p.getByRole('button',{name:'Novo município',exact:true}).click();await p.getByLabel('Nome',{exact:true}).fill('Município Exportação');await p.getByRole('button',{name:'Salvar município',exact:true}).click();await p.getByRole('button',{name:'Retomar tentativas automáticas'}).waitFor();
 const antes=await p.evaluate(async()=>{const owner=(await window.storage.get('integracao-ultima-conta')).value,{abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),fila=abrirFilaIntencoes();try{return await fila.listar(owner);}finally{await fila.fechar();}});
 await p.evaluate(()=>{const set=window.storage.set.bind(window.storage);window.storage.set=async(k,...args)=>{if(k.includes('-revisao-'))throw new DOMException('quota simulada','QuotaExceededError');return set(k,...args);};});
 const aguardar=p.waitForEvent('download',{timeout:8000});await p.getByRole('button',{name:'Baixar cópia das alterações pendentes'}).click();const download=await aguardar;
 const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.ok(JSON.stringify(backup).includes('Município Exportação'));assert.deepEqual(backup.diario.intencoes.map(i=>i.original),antes.map(i=>i.original));
 assert.equal(await p.evaluate(()=>window.baseFixture.fin_receb_municipios.some(m=>m.nome==='Município Exportação')),false);
 await p.getByText(/cópia interna.*não pôde ser atualizada/i).waitFor();const depois=await p.evaluate(async()=>{const owner=(await window.storage.get('integracao-ultima-conta')).value,{abrirFilaIntencoes}=await import('/src/fila-intencoes.js'),f=abrirFilaIntencoes();try{return await f.listar(owner);}finally{await f.fechar();}});assert.deepEqual(depois,antes);
 console.log('Exportação real com quota: download completo, originais preservados e nenhum cadastro reenviado.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

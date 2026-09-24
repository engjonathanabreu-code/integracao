const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true}:{channel:'chrome',headless:true});try{const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:5178/tests/browser.html?crm');await p.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('fixture');await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.getByRole('button',{name:'CRM',exact:true}).click();
// Lead sem CPF nem município: somente o nome é exigido antes do Contrato, mas a cidade do lead precisa ser escolhida.
const lead=p.locator('article.crm-cliente-card',{hasText:'Lead de demonstração'}).first();await lead.getByRole('button',{name:'Editar',exact:true}).click();
const f=p.getByRole('form',{name:'Editar Lead de demonstração'});await f.getByText('Até a etapa Contrato apenas o nome é obrigatório').waitFor();
await f.getByLabel('Nome',{exact:true}).fill('Lead editado');await f.getByLabel('CPF (opcional)').fill('529.982.247-24');await f.getByLabel('Cidade').selectOption({index:1});await f.getByRole('button',{name:'Salvar alterações'}).click();await f.getByText('CPF inválido, confira os dígitos').waitFor();
await f.getByLabel('CPF (opcional)').fill('52998224725');await f.screenshot({path:'/tmp/crm-editar-card.png'});await f.getByRole('button',{name:'Salvar alterações'}).click();
await p.getByText('Dados de Lead editado atualizados.').waitFor();const editado=p.locator('article.crm-cliente-card',{hasText:'Lead editado'}).first();await editado.getByText('529.982.247-25').waitFor();
// Cliente já cadastrado: o município acompanha a remessa e não é editado aqui.
await p.locator('article.crm-cliente-card',{hasText:'Morador Teste'}).first().getByRole('button',{name:'Editar',exact:true}).click();const g=p.getByRole('form',{name:'Editar Morador Teste'});assert.equal(await g.getByLabel('Cidade').isDisabled(),true);await g.getByLabel('Telefone').fill('');await g.getByRole('button',{name:'Salvar alterações'}).click();await p.getByText('Dados de Morador Teste atualizados.').waitFor();
// Visão reduzida oculta os botões, mas mantém o lápis de edição.
await p.getByRole('button',{name:'Reduzido',exact:true}).click();await p.getByRole('button',{name:'Editar Lead editado'}).click();await p.getByRole('form',{name:'Editar Lead editado'}).waitFor();await p.screenshot({path:'/tmp/crm-editar-reduzido.png'});
assert.deepEqual(errors,[]);console.log('crm editar card ok');}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});

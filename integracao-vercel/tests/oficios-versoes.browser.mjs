import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {banco,admin,arquivo,rpc,como} from './oficios-db-fixture.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const db=await banco(),ano=new Date().getFullYear();
const dados=await arquivo(db,42,`${ano}-01-10`);const original=await rpc(db,admin,dados);
await db.exec(readFileSync(new URL('../supabase/migrations/20261026184153_oficios_versoes.sql',import.meta.url),'utf8'));
const files=new Map([[dados.caminho,Buffer.from('Conteúdo original v1')]]),pedidos=[],erros=[],assinados=[];
let perderResposta=false,perderAntes=false,segurar=false,liberar;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:1000}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  const json=(d,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(d)});
  if(url.pathname.startsWith('/storage/v1/object/')){
   const path=decodeURIComponent(url.pathname.split('integracao-oficios/')[1]);
   if(url.pathname.includes('/sign/')){assinados.push(path);return json({signedURL:`/fixture/${encodeURIComponent(path)}`});}
   assert.equal(req.headers()['x-upsert'],'false');assert.ok(!files.has(path),'não sobrescreve arquivo');
   files.set(path,req.postDataBuffer());await db.query("insert into storage.objects values('integracao-oficios',$1)",[path]);return json({});
  }
  if(url.pathname.startsWith('/storage/v1/fixture/'))return route.fulfill({status:200,contentType:'text/plain; charset=utf-8',body:files.get(decodeURIComponent(url.pathname.split('/fixture/')[1]))});
  if(url.pathname.startsWith('/rest/v1/')){
   try{
    const offset=Number(url.searchParams.get('offset')||0);
    switch(url.pathname.split('/').at(-1)){
     case 'integracao_oficios_sequencias':return json((await db.query('select * from integracao_oficios_sequencias where ano=$1',[ano])).rows);
     case 'integracao_oficios':{
      assert.equal(url.searchParams.get('versoes.order'),'versao.desc');assert.equal(url.searchParams.get('versoes.limit'),'1');
      return json((await db.query(`select to_jsonb(o)||jsonb_build_object('versoes',(select jsonb_agg(v) from (select * from integracao_oficios_versoes where oficio_id=o.id order by versao desc limit 1) v)) r from integracao_oficios o where ano=$1 order by numero desc limit 500 offset $2`,[ano,offset])).rows.map(x=>x.r));
     }
     case 'integracao_oficios_versoes':return json((await db.query('select to_jsonb(v) r from integracao_oficios_versoes v where oficio_id=$1 order by versao desc limit 500 offset $2',[original.id,offset])).rows.map(x=>x.r));
     case 'integracao_oficios_operar':{
      const {p_acao,p_dados}=req.postDataJSON();assert.equal(p_acao,'atualizar');pedidos.push(p_dados);
      if(perderAntes){perderAntes=false;return route.abort('failed');}
      if(segurar)await new Promise(r=>{liberar=r;});
      const [r]=await como(db,admin,'select integracao_oficios_operar($1,$2) r',[p_acao,JSON.stringify(p_dados)]);
      if(perderResposta){perderResposta=false;return route.abort('failed');}return json(r.r);
     }
    }
   }catch(e){return json({message:e.message,code:e.code},400);}
  }
  if(url.hostname==='127.0.0.1')return route.continue();
  throw Error('Rede externa bloqueada: '+url.origin+url.pathname);
 });
 const page=await context.newPage();page.on('pageerror',e=>erros.push(e.message));
 const url=`${process.env.TEST_URL||'http://127.0.0.1:5191'}/tests/oficios-versoes.browser.html`;
 const quantidade=async()=>Number((await db.query('select count(*) n from integracao_oficios_versoes')).rows[0].n);
 await page.goto(url);await page.getByText('v1 · atual',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Atualizar ofício',exact:true}).click();
 await page.getByLabel('Resumo / novas informações').fill('Cancelado sem salvar');
 await page.getByRole('button',{name:'Cancelar atualização'}).click();assert.equal(await quantidade(),1);
 await page.getByRole('button',{name:'Atualizar ofício',exact:true}).click();
 await page.getByLabel('Resumo / novas informações').fill('Novas informações v2 preservando o conteúdo anterior.');
 // Cliques repetidos durante o mesmo pedido não criam duplicata.
 segurar=true;await page.getByRole('button',{name:'Salvar v2',exact:true}).click();await page.waitForFunction(()=>document.querySelector('button.btn-primario')?.textContent);
 assert.equal(await page.getByRole('button',{name:'Salvando…'}).isDisabled(),true);
 while(!liberar)await new Promise(r=>setTimeout(r,10));
 perderResposta=true;segurar=false;liberar();
 await page.getByRole('button',{name:'Tentar salvar novamente'}).waitFor();assert.equal(await quantidade(),2);
 await page.getByRole('button',{name:'Tentar salvar novamente'}).click();
 await page.getByText('v2 · atual',{exact:true}).waitFor();assert.equal(await quantidade(),2);assert.equal(pedidos.length,2);assert.equal(pedidos[0].pedido,pedidos[1].pedido);
 assert.equal(await page.locator('.oficio-item').getByText('Prefeitura Teste · Não enviado',{exact:true}).count(),1);
 await page.reload();await page.getByText('v2 · atual',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Atualizar ofício',exact:true}).click();
 await page.getByLabel('Resumo / novas informações').fill('Informações v3 e arquivo novo.');
 await page.getByLabel('Novo arquivo (opcional)').setInputFiles({name:'v3.txt',mimeType:'text/plain',buffer:Buffer.from('Conteúdo exclusivo da v3')});
 await page.getByText('Novo arquivo anexado. Confira as informações antes de salvar.').waitFor();
 perderAntes=true;perderResposta=true;await page.getByRole('button',{name:'Salvar v3',exact:true}).click();
 await page.getByRole('button',{name:'Tentar salvar novamente'}).waitFor();assert.equal(await quantidade(),2);
 await page.reload();await page.getByText('v2 · atual',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Atualizar ofício',exact:true}).click();
 await page.getByText('Há um pedido sem confirmação. Repita o mesmo pedido para conferir o resultado.').waitFor();
 assert.equal(await page.getByLabel('Resumo / novas informações').inputValue(),'Informações v3 e arquivo novo.');
 await page.getByRole('button',{name:'Tentar salvar novamente'}).click();
 await page.getByRole('button',{name:'Tentar salvar novamente'}).waitFor();assert.equal(await quantidade(),3);
 assert.equal(pedidos.at(-1).pedido,pedidos.at(-2).pedido);
 // Resposta perdida: recarregar mostra v3 e um novo clique não repete o pedido anterior.
 await page.reload();await page.getByText('v3 · atual',{exact:true}).waitFor();assert.equal(await quantidade(),3);
 await page.getByRole('button',{name:'Histórico de versões'}).click();
 const history=page.getByRole('region',{name:'Histórico do ofício'});
 await history.getByRole('button',{name:'Abrir arquivo da v3'}).waitFor();
 let popup=page.waitForEvent('popup');await history.getByRole('button',{name:'Abrir arquivo da v3'}).click();let opened=await popup;await opened.waitForLoadState();assert.match(await opened.locator('body').innerText(),/Conteúdo exclusivo da v3/);await opened.close();
 await history.getByLabel('Versão consultada').selectOption(original.id);
 assert.equal(await history.getByText(original.resumo,{exact:true}).count(),1);assert.match(await history.innerText(),/Enviado em 10\/01/);
 popup=page.waitForEvent('popup');await history.getByRole('button',{name:'Abrir arquivo da v1'}).click();opened=await popup;await opened.waitForLoadState();assert.match(await opened.locator('body').innerText(),/Conteúdo original v1/);await opened.close();
 assert.equal(assinados[0],pedidos.at(-1).caminho);assert.equal(assinados[1],original.caminho);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/oficios-versoes-mobile.png',fullPage:true});
 await page.goto(url+'?leitor');await page.getByText('v3 · atual',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Atualizar ofício',exact:true}).count(),0);
 assert.equal((await db.query('select to_jsonb(o) r from integracao_oficios o')).rows[0].r.resumo,original.resumo);
 assert.deepEqual(erros,[]);console.log('PASS: UI real → transporte → SQL, v1/v2/v3, cancelamento, clique repetido, resposta perdida/reload, histórico, arquivos privados e mobile. Rede externa bloqueada.');
}finally{await browser.close();await db.close();}

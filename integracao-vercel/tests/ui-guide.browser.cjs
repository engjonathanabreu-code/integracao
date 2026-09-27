const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output='tests/ui-guide-review';fs.mkdirSync(output,{recursive:true});

async function audit(page,screen,theme,width){
 await page.waitForTimeout(200);
 const result=await page.evaluate(()=>{
  const rgb=c=>(c.match(/[\d.]+/g)||[]).map(Number);
  const blend=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
  const bg=e=>{if(!e)return [255,255,255];const c=rgb(getComputedStyle(e).backgroundColor);return blend(c,bg(e.parentElement));};
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const results=[];
  document.querySelectorAll('button,.inp,.aba,.tag').forEach(e=>{
   const r=e.getBoundingClientRect(),s=getComputedStyle(e);
   if(e.disabled||!e.textContent.trim()||r.width===0||r.height===0||r.right<0||r.left>innerWidth||s.visibility==='hidden'||s.display==='none'||e.closest('[hidden]'))return;
   const a=lum(rgb(s.color)),b=lum(bg(e)),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   if(ratio<4.45)results.push({label:e.textContent.trim().slice(0,80),class:e.className,ratio:Math.round(ratio*100)/100,fg:s.color,bg:bg(e)});
  });
  return {overflow:document.documentElement.scrollWidth>innerWidth+1,overflowElements:[...document.querySelectorAll('.contem>*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({class:e.className,width:e.getBoundingClientRect().width})),lowContrast:results};
 });
 await page.screenshot({path:`${output}/${width}-${screen}-${theme}.png`,fullPage:false});
 return {screen,theme,width,...result};
}

(async()=>{
const b=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});const reports=[];
try{
for(const width of [1440,390]){
 const p=await b.newPage({viewport:{width,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
 await p.goto('http://127.0.0.1:5179/tests/browser.html?crm&mobile');
 await p.getByLabel('E-mail',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Escuro',exact:true}).click();
 assert.ok(await p.locator('.rb.escuro').count());reports.push(await audit(p,'login','escuro',width));
 await p.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await p.getByLabel('Senha',{exact:true}).fill('fixture');await p.getByRole('button',{name:'Entrar',exact:true}).click();
 await p.getByRole('navigation').waitFor({state:'attached'});
 await p.evaluate(()=>{
  const original=window.fetch;window.fetch=async(u,o={})=>{
   if(String(u)==='/api/agentes'){const body=JSON.parse(o.body);return Response.json(body.modo==='acoes'?{acoes:Array.from({length:10},(_,i)=>`${i+1}. **Revisar documentação**\nContexto: **NUI ${i+1} · São José**\nPrazo sugerido: **7 dias**\nResponsável: **Ana Souza**`).join('\n\n')}:{setor:body.setor,painel:{setor:body.setor,parado_dias:body.paradoDias,metas:{abertas:12,vencidas:3},nucleos:{total:7},andamentos:{}}});}
   return original(u,o);
  };
 });
 const nav=async(name)=>{await p.evaluate(()=>scrollTo(0,0));const menu=p.getByRole('button',{name:'Abrir menu',exact:true});if(await menu.isVisible())await menu.click();await p.getByRole('navigation').getByRole('button',{name,exact:true}).click();if(width<900)await p.waitForFunction(()=>document.querySelector('nav.nav').getBoundingClientRect().right<=1);};
 for(const screen of ['Início','Clientes','CRM','Processos','Metas','Planos de trabalho','Calendário','Marketing','Financeiro','Chat','Agentes IA','Configurações']){
  await nav(screen);await p.waitForTimeout(150);
  for(const theme of ['Claro','Escuro']){
   await p.getByRole('button',{name:theme,exact:true}).first().click();
   reports.push(await audit(p,screen.replaceAll(' ','-'),theme.toLowerCase(),width));
  }
  if(screen==='CRM'){
   for(const submenu of ['Metas','Clientes institucionais','Dashboard comercial','Arquivo do CRM']){
    await p.locator('.crm-nav').getByRole('button',{name:submenu,exact:true}).click();await p.waitForTimeout(100);
    reports.push(await audit(p,'CRM-'+submenu.replaceAll(' ','-'),'escuro',width));
   }
   await p.locator('.crm-nav').getByRole('button',{name:'Funil comercial',exact:true}).click();
   await p.getByRole('button',{name:'Cadastrar lead',exact:true}).click();
   await p.getByRole('dialog').waitFor();reports.push(await audit(p,'CRM-modal','escuro',width));
   await p.getByRole('button',{name:'Fechar cadastro',exact:true}).click();
  }
 }
 assert.deepEqual(errors,[]);await p.close();
}
fs.writeFileSync(`${output}/report.json`,JSON.stringify(reports,null,2));
console.log(JSON.stringify({screens:reports.length,issues:reports.filter(x=>x.overflow||x.lowContrast.length)},null,2));
assert.ok(reports.every(r=>!r.overflow),'sem transbordamento da página');
assert.ok(reports.every(r=>!r.lowContrast.length),'contraste dos botões, abas e campos');
}finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

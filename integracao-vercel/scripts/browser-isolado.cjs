// Every browser test shares one local-only transport policy.
const pw=require(process.env.BROWSER_TEST_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const origin=process.env.BROWSER_TEST_ORIGIN;
if(!origin||!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Origem local de testes inválida.');
const chromium=Object.create(pw.chromium);
chromium.launch=async options=>{
 const {channel,chromiumSandbox,executablePath,...opts}=options||{};
 const browser=await pw.chromium.launch(opts);
 const patchPage=p=>{
  const goto=p.goto.bind(p);p.goto=(url,o)=>goto(String(url).replace(/^http:\/\/(127\.0\.0\.1|localhost):\d+/,origin),o);
  const screenshot=p.screenshot.bind(p);p.screenshot=o=>{const dir=process.env.BROWSER_TEST_OUTPUT;if(o?.path&&dir){fs.mkdirSync(dir,{recursive:true});o={...o,path:path.join(dir,path.basename(o.path))};}return screenshot(o);};return p;
 };
 const newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const c=await newContext(options);
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await c.routeWebSocket(/.*/,ws=>{if(new URL(ws.url()).host===new URL(origin).host)ws.connectToServer();else ws.close();});
  const newPage=c.newPage.bind(c);c.newPage=async()=>patchPage(await newPage());return c;
 };
 browser.newPage=async options=>(await browser.newContext(options)).newPage();return browser;
};
module.exports={...pw,chromium};

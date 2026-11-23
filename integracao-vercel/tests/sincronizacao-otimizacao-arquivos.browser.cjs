const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();await context.route('**/tests/qa-arquivos.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Upload parcial sintético</title>'}));
 const page=await context.newPage();await page.goto('http://127.0.0.1:5178/tests/qa-arquivos.html');
 const r=await page.evaluate(async()=>{
  const {fixture,blank}=await import('/tests/fixture.js'),dados=await import('/src/dados-compartilhados.js'),a=await import('/src/arquivos-compartilhados.js'),q=await import('/src/fila-intencoes.js');
  const state=dados.projetar(fixture(),blank()),actor=state.db.usuarios[0],persistidos=new Map(),storage={get:async k=>persistidos.get(k)||null,set:async(k,v)=>persistidos.set(k,v)};
  const objetos=new Map(),uploads=[],commits=[],falhas=[];let requests=0,tempo=1000000,quebrar=true;
  const fetchAnterior=window.fetch;dados.definirSessao({user:{id:actor.erpRef},access_token:'arquivo-fixture',expires_in:3600});
  window.fetch=async(input,opts={})=>{
   const url=String(input);requests++;
   if(url.includes('/rest/v1/rpc/erp_collab_directory'))return Response.json(state.base.profiles);
   if(!url.includes('/storage/v1/object/'))throw Error('Rede não prevista bloqueada');
   const path=url.split('/integracao/')[1];
   if(opts.method==='POST'){
    const value=new TextDecoder().decode(opts.body);uploads.push({path,value,upsert:opts.headers['x-upsert']});
    if(quebrar&&value==='foto B original'){quebrar=false;falhas.push(path);return Response.json({message:'Falha temporária sintética'},{status:503});}
    if(objetos.has(path))return Response.json({error:'Duplicate'},{status:409});
    objetos.set(path,value);return Response.json({});
   }
   return new Response(objetos.get(path),{status:objetos.has(path)?200:404});
  };
  const fila=q.abrirFilaIntencoes({nome:'qa-parcial-'+crypto.randomUUID(),agora:()=>tempo,aleatorio:()=>0});
  try{
   await a.abrirArquivos(actor,state.base,storage);await a.agendarArquivo('integracao-foto-v4-a','foto A original');await a.agendarArquivo('integracao-foto-v4-b','foto B original');
   const arquivos=a.capturarArquivos(),original=await fila.enfileirar({conta:actor.erpRef,id:'fotos',unidade:'pacote-fotos',modulo:'arquivos',recursos:['arquivo:a','arquivo:b'],operacoes:[],preparar:true,base:{},intencao:{edicoes:[],arquivos}});
   await fila.enfileirar({conta:actor.erpRef,id:'meta-independente',unidade:'outra-meta',modulo:'metas',operacoes:[{table:'metas',key:{id:'outra-meta'},changes:{titulo:'independente'}}],base:{},intencao:{edicoes:[]}});
   const recibos={};const cb={conta:actor.erpRef,dono:'qa',sessaoAtual:()=>true,
    preparar:async item=>{const p=await a.prepararArmazenamento(state,state.db,item.original.intencao.arquivos);return {operacoes:p.operations,sent:p.sent};},
    consultarRecibo:async i=>recibos[i.pedido]||null,
    enviar:async i=>{commits.push(i.id);if(i.id==='fotos')for(const op of i.payload)state.base.integracao_arquivos.push({...op.key,...op.changes});return recibos[i.pedido]={aliases:{}};},
    reler:async i=>{if(i.id==='fotos')await a.confirmarArquivos(i.preparado.sent,state.base);}
   };
   let codigo;try{await q.processarIntencao(fila,cb);}catch(e){codigo=e.status||e.code;}
   const parcial=(await fila.listar(actor.erpRef)).find(i=>i.id==='fotos'),antes={codigo,objetos:objetos.size,commits:commits.length,arquivos:a.capturarArquivos(),semPayload:!parcial.payload,semRecibo:!parcial.recibo,originalIgual:JSON.stringify(parcial.original)===JSON.stringify(original.original),checksumIgual:parcial.checksum===original.checksum};
   const independente=await q.processarIntencao(fila,cb);tempo+=120000;const final=await q.processarIntencao(fila,cb);
   return {antes,independente:{id:independente.id,estado:independente.estado},depois:{estado:final.estado,objetos:objetos.size,commits,pendenciaArquivo:a.arquivosPendentes(),originalIgual:JSON.stringify(final.original)===JSON.stringify(original.original),checksumIgual:final.checksum===original.checksum,pacoteMesmo:JSON.stringify(final.original.intencao.arquivos)===JSON.stringify(arquivos),pedidos:(await fila.listar(actor.erpRef)).length},uploads,originalArquivos:arquivos,requests,falhas};
  }finally{await fila.fechar();a.fecharArquivos();dados.definirSessao(null);window.fetch=fetchAnterior;}
 });
 assert.equal(r.antes.codigo,503);assert.equal(r.antes.objetos,1);assert.equal(r.antes.commits,0);assert.deepEqual(r.antes.arquivos,r.originalArquivos);assert.equal(r.antes.semPayload,true);assert.equal(r.antes.semRecibo,true);assert.equal(r.antes.originalIgual,true);assert.equal(r.antes.checksumIgual,true);
 assert.deepEqual(r.independente,{id:'meta-independente',estado:'confirmado'});assert.deepEqual(r.depois,{estado:'confirmado',objetos:2,commits:['meta-independente','fotos'],pendenciaArquivo:false,originalIgual:true,checksumIgual:true,pacoteMesmo:true,pedidos:2});
 assert.equal(r.uploads.length,4);assert.equal(r.uploads[0].path,r.uploads[2].path);assert.equal(r.uploads[1].path,r.uploads[3].path);assert.ok(r.uploads.every(u=>u.upsert==='false'));assert.equal(r.falhas.length,1);
 console.log(JSON.stringify({ok:true,casos:1,uploadParcial:true,originalBytesVersaoChecksumPreservados:true,semGravacaoAntesPreparacaoCompleta:true,independenteAvanca:true,mesmosObjetosImutaveis:true,recuperacaoGranular:false}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

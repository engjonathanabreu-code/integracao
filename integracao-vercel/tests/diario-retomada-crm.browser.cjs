const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true});try{
 const c=await b.newContext();await c.route('**/tests/retomada-crm-core.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Retomada CRM isolada</title>'}));
 const p=await c.newPage();await p.goto('http://127.0.0.1:5178/tests/retomada-crm-core.html');
 const r=await p.evaluate(async()=>{
  const {abrirFilaIntencoes}=await import('/src/fila-intencoes.js');
  const {criarDiarioCompartilhado}=await import('/src/diario-compartilhado.js');
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),conta=id(1),pedido=id(2),processo=id(3),audit=id(4);
  const a={id:processo,requerente:{statusCRM:'Cliente novo',nome:'Fixture'}};
  const b={...a,requerente:{...a.requerente,statusCRM:'Cliente Ativo'}};
  const log={id:audit,processoId:processo,usuarioId:'erp_'+conta,acao:'Cadastro alterado'};
  const edicoes=[{colecao:'processos',id:processo,antes:{existe:true,valor:a},depois:{existe:true,valor:b}},
   {colecao:'auditoria',id:audit,antes:{existe:false},depois:{existe:true,valor:log}}];
  const ops=[{table:'integracao_moradores',key:{colecao:'processos',registro_id:processo},expected:{dados:a},changes:{dados:b}},
   {table:'integracao_auditoria',key:{colecao:'auditoria',registro_id:audit},insert:true,changes:{criado_por:conta,dados:log}}];
  let remoto={processos:[a],auditoria:[]},recibo=null,envios=0;
  const f=abrirFilaIntencoes({nome:'retomada-crm-sintetica'});
  const d=criarDiarioCompartilhado({conta,ativo:()=>true,fila:f,carregar:async()=>({db:structuredClone(remoto)}),
   consultarRecibo:async item=>item.id===pedido?recibo:envios?{aliases:{}}:null,
   preparar:async (anterior,depois)=>({operacoes:ops,sent:{},antes:anterior.db,depois}),
   enviar:async (_ops,p)=>{if(p===pedido)throw Error('pedido recusado nunca deve ser reusado');envios++;remoto={processos:[{...b,campoConcorrente:'preservar'}],auditoria:[log]};return {aliases:{}};},
   confirmar:async()=>{},atualizou:()=>{}});
  try{
   await f.enfileirar({conta,id:pedido,unidade:'cadastro',modulo:'processos',operacoes:ops,base:{},intencao:{edicoes,arquivos:{}},preparar:true});
   let i=await f.reservar(conta,{dono:'origem',somenteId:pedido});
   i=await f.fixarPayload(i,ops,{sent:{},antes:{processos:[a],auditoria:[]},depois:{processos:[b],auditoria:[log]}});i=await f.registrarEnvio(i);await f.registrarFalha(i,{status:400,code:'P0001'});
   const antes=(await f.listar(conta))[0];
   const cmd={pedido,revisao:antes.checksum,validar:async()=>{},verificar:()=>{}};
   const revisaoErrada=(await d.retomarRecusaCrm({...cmd,revisao:'a'.repeat(64)}))===null;
   recibo={aliases:{}};const comRecibo=(await d.retomarRecusaCrm(cmd))===null;recibo=null;
   remoto={processos:[{...a,requerente:{...a.requerente,statusCRM:'Outro status'}}],auditoria:[]};
   const comConflito=(await d.retomarRecusaCrm(cmd))===null;remoto={processos:[{...a,campoConcorrente:'preservar'}],auditoria:[]};
   let recusado=false,n=0;try{await d.retomarRecusaCrm({...cmd,validar:async()=>{if(++n===3)throw Error('sessão revogada');}});}catch{recusado=true;}
   const semToque=(await f.listar(conta)).length===1;
   const novo=await d.retomarRecusaCrm(cmd);
   if(!novo)throw Error('A retomada legítima deveria criar um pedido');
   const unico=(await d.retomarRecusaCrm(cmd))===null;
   const dadosPreservados=novo.original.intencao.edicoes.find(e=>e.colecao==='processos').depois.valor.campoConcorrente==='preservar';
   await d.executar({id:novo.id,validar:async()=>{},verificar:()=>{}});
   const lista=await f.listar(conta);
   return {revisaoErrada,comRecibo,comConflito,recusado,semToque,unico,dadosPreservados,envios,
     antigo:lista.find(x=>x.id===pedido)?.estado,novo:lista.find(x=>x.id===novo.id)?.estado,
     origPreservado:JSON.stringify(lista.find(x=>x.id===pedido)?.original)===JSON.stringify(antes.original)};
  }finally{d.fechar();}
 });
 assert.deepEqual(r,{revisaoErrada:true,comRecibo:true,comConflito:true,recusado:true,semToque:true,unico:true,dadosPreservados:true,envios:1,antigo:'substituido',novo:'confirmado',origPreservado:true});
 console.log(JSON.stringify({ok:true,casos:9,indexedDBReal:true,...r}));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});

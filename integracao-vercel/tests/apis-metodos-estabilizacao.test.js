import test from 'node:test';import assert from 'node:assert/strict';
const rotas=['agente-pessoal','agentes','andamento-integracao','calendario-emails','calendario-ics','calendario-resumo','chatwoot-integracao','claude','conexao','contatos-nucleo','crm-chatwoot-sincronizar','financeiro-documentos','financeiro-lembretes','ia','identificar-integracao','ler-matricula','oficios-analisar','oficios-gerar','resumo-moradores'];
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;},end(){return this;}});
for(const rota of rotas)test(`${rota}: método não suportado é recusado antes de qualquer efeito`,async()=>{
 const original=global.fetch;let chamadas=0;global.fetch=async()=>{chamadas++;throw Error('Rede externa proibida neste teste');};
 try{const {default:handler}=await import(`../api/${rota}.js`),res=response();await handler({method:'TRACE',headers:{},query:{},body:{}},res);assert.equal(res.code,405);assert.equal(chamadas,0);}finally{global.fetch=original;}
});
for(const [rota,method] of [['calendario-emails','POST'],['calendario-resumo','GET'],['resumo-moradores','POST'],['financeiro-documentos','POST'],['ler-matricula','POST'],['oficios-analisar','POST'],['oficios-gerar','POST'],['crm-chatwoot-sincronizar','POST']])test(`${rota}: falta de autenticação não consulta nem envia`,async()=>{
 const original=global.fetch;let chamadas=0;global.fetch=async()=>{chamadas++;throw Error('Rede externa proibida neste teste');};
 try{const {default:handler}=await import(`../api/${rota}.js`),res=response();await handler({method,headers:{},query:{},body:{}},res);assert.equal(res.code,401);assert.equal(chamadas,0);assert.match(res.headers['Cache-Control'],/no-store/);}finally{global.fetch=original;}
});

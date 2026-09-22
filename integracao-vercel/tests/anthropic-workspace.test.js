import test from 'node:test';import assert from 'node:assert/strict';
import {cabecalhosAnthropic,erroAnthropic} from '../server/anthropic.js';
import handler from '../api/claude.js';
test('cabeçalhos suportam chaves com workspace e chaves já vinculadas',()=>{
 const old=process.env.ANTHROPIC_WORKSPACE_ID;
 try{delete process.env.ANTHROPIC_WORKSPACE_ID;assert.ok(!('anthropic-workspace-id' in cabecalhosAnthropic()));process.env.ANTHROPIC_WORKSPACE_ID=' wrkspc_teste ';assert.equal(cabecalhosAnthropic()['anthropic-workspace-id'],'wrkspc_teste');}finally{if(old===undefined)delete process.env.ANTHROPIC_WORKSPACE_ID;else process.env.ANTHROPIC_WORKSPACE_ID=old;}
});
test('proxy envia o workspace ao provedor e traduz erro de configuração sem perder contexto',async()=>{
 const original=global.fetch,key=process.env.ANTHROPIC_API_KEY,workspace=process.env.ANTHROPIC_WORKSPACE_ID;
 process.env.ANTHROPIC_API_KEY='test-only';process.env.ANTHROPIC_WORKSPACE_ID='wrkspc_teste';let captured;
 global.fetch=async(url,options)=>{captured={url,...options};return Response.json({content:[{type:'text',text:'Resposta de teste'}]});};
 const req={method:'POST',headers:{origin:'https://integracao.example',host:'integracao.example'},body:{messages:[{role:'user',content:'Documento fictício'}],max_tokens:100}};
 const invoke=async()=>{const res={status(n){this.code=n;return this},json(v){this.data=v;return this},setHeader(){}};await handler(req,res);return res;};
 try{assert.equal((await invoke()).code,200);assert.equal(captured.headers['anthropic-workspace-id'],'wrkspc_teste');assert.equal(JSON.parse(captured.body).messages[0].content,'Documento fictício');
 global.fetch=async()=>Response.json({error:{message:'This API key is not scoped to a workspace; add the anthropic-workspace-id header.'}},{status:400});const res=await invoke();assert.equal(res.code,400);assert.match(res.data.erro,/workspace/);assert.match(res.data.erro,/não foram apagados/);assert.ok(!res.data.erro.includes('test-only'));
 }finally{global.fetch=original;for(const [k,v] of [['ANTHROPIC_API_KEY',key],['ANTHROPIC_WORKSPACE_ID',workspace]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

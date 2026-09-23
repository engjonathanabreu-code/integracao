import test from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/crm-chatwoot-sincronizar.js';
import {eventoChatwoot} from '../api/chatwoot-integracao.js';
const id='00000000-0000-4000-8000-000000000001';
const invoke=async(body={},token='Bearer test')=>{const res={setHeader(){},status(c){this.code=c;return this},json(d){this.body=d;return this}};await handler({method:'POST',headers:{authorization:token},body},res);return res;};
test('sincronização Chatwoot exige diretor antes de consultar histórico ou escrever',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async url=>{calls++;return Response.json(url.includes('/auth/')?{id}:[{ativo:true,tipo:'Comercial'}]);};
 try{assert.equal((await invoke({},'')).code,401);assert.equal(calls,0);assert.equal((await invoke()).code,403);assert.equal(calls,2);}finally{global.fetch=original;}
});
test('sincronização pagina histórico vinculado, conserva ID do remetente e só faz GET no Chatwoot',async()=>{
 const original=global.fetch,env={...process.env};Object.assign(process.env,{CHATWOOT_INTEGRACAO_API_TOKEN:'test-only',CRM_INTEGRACAO_SUPABASE_URL:'https://db.invalid',CRM_INTEGRACAO_SERVICE_ROLE_KEY:'test-only'});const eventos=[],chat=[];
 global.fetch=async(url,opts={})=>{
 if(url.includes('/auth/'))return Response.json({id});if(url.includes('/profiles?'))return Response.json([{ativo:true,tipo:'Diretor de Projetos'}]);
 if(url.startsWith('https://db.invalid')&&url.includes('/rpc/')){eventos.push(JSON.parse(opts.body).evento);return Response.json(id);}
 if(url.startsWith('https://db.invalid'))return Response.json(url.includes('id=gt.')?[]:[{id,conversa_id:4,contato_id:8}]);
 chat.push(opts.method||'GET');if(url.endsWith('/conversations/4'))return Response.json({meta:{sender:{id:8,name:'Contato'},assignee:{id:99}}});
 return Response.json({payload:url.includes('before=')?[]:[{id:10,sender_type:'User',sender_id:20,sender:{name:'Pessoa'},message_type:1,created_at:1790160000,content:'Resposta'}]});
 };
 try{const r=await invoke();assert.equal(r.code,200);assert.equal(r.body.mensagens,1);assert.deepEqual(r.body.cursor,{id,before:'10'});assert.equal(eventos[0].autor_chatwoot_id,'20');assert.equal(eventos[0].autor_tipo,'user');assert.equal(eventos[0].agente_id,'99');const next=await invoke({cursor:r.body.cursor});assert.equal(next.body.cursor,null);assert.ok(chat.every(x=>x==='GET'));assert.equal((await invoke({cursor:{id:'inválido'}})).code,400);}finally{global.fetch=original;for(const k of ['CHATWOOT_INTEGRACAO_API_TOKEN','CRM_INTEGRACAO_SUPABASE_URL','CRM_INTEGRACAO_SERVICE_ROLE_KEY'])if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
});
test('webhook separa remetente e responsável da conversa',()=>{const e=eventoChatwoot({event:'message_created',id:9,account:{id:1},conversation:{id:2,meta:{sender:{id:3},assignee:{id:4}}},sender:{id:5,type:'user',name:'Autor'},created_at:1790160000},'chat.test',1);assert.equal(e.autor_chatwoot_id,'5');assert.equal(e.agente_id,'4');assert.equal(e.autor_tipo,'user');});

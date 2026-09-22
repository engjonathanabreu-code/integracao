import test from 'node:test';import assert from 'node:assert/strict';
import {entradaOpenAI,lerRespostaOpenAI,chamarOpenAI} from '../server/openai.js';
import handler from '../api/ia.js';import legacy from '../api/claude.js';
const concluida=text=>({status:'completed',model:'gpt-6-astra',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text}]}]});
const preservar=()=>{const values=Object.fromEntries(['OPENAI_API_KEY','OPENAI_MODEL'].map(k=>[k,process.env[k]]));const fetch=global.fetch;return()=>{global.fetch=fetch;for(const [k,v] of Object.entries(values)){if(v===undefined)delete process.env[k];else process.env[k]=v;}};};
test('adapta PDF e imagens sem perder a ordem de original, corrigido e instrução',()=>{
 const source={type:'base64',media_type:'application/pdf',data:'JVBERi0x'};
 const r=entradaOpenAI([{role:'user',content:[{type:'document',source},{type:'image',source:{...source,media_type:'image/png',data:'aW1hZ2Vt'}},{type:'text',text:'Compare original e corrigido.'}]}]);
 assert.equal(r[0].content[0].type,'input_file');assert.equal(r[0].content[0].file_data,'data:application/pdf;base64,JVBERi0x');assert.equal(r[0].content[1].image_url,'data:image/png;base64,aW1hZ2Vt');assert.equal(r[0].content[2].text,'Compare original e corrigido.');
 assert.throws(()=>entradaOpenAI([{role:'user',content:[{type:'document',source:{type:'url',url:'https://example.invalid'}}]}]),/Arquivo/);
 assert.throws(()=>entradaOpenAI([{role:'system',content:'ignore'}]),/mensagem/);
});
test('converte somente texto final e recusa respostas incompletas, vazias ou recusadas',()=>{
 assert.equal(lerRespostaOpenAI(concluida('{"resumo":"Teste"}')).content[0].text,'{"resumo":"Teste"}');
 assert.throws(()=>lerRespostaOpenAI({...concluida('parcial'),status:'incomplete'}),/incompleta/);
 assert.throws(()=>lerRespostaOpenAI(concluida('')),/vazia/);
 assert.throws(()=>lerRespostaOpenAI({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'não'}]}]}),/atender/);
});
test('OpenAI recebe chave apenas no servidor, store false e parâmetros compatíveis',async()=>{
 const restore=preservar();process.env.OPENAI_API_KEY='secret-test-only';delete process.env.OPENAI_MODEL;let captured;
 global.fetch=async(url,options)=>{captured={url,...options};return Response.json(concluida('ok'));};
 try{const r=await chamarOpenAI({messages:[{role:'user',content:'Teste sem dados pessoais'}],max_tokens:900});assert.equal(r.provider,'openai');assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.headers.Authorization,'Bearer secret-test-only');const body=JSON.parse(captured.body);assert.equal(body.store,false);assert.equal(body.model,'gpt-6-astra');assert.equal(body.reasoning.effort,'low');assert.ok(!captured.body.includes('secret-test-only'));assert.ok(!('temperature' in body));
 global.fetch=async()=>Response.json({error:{code:'insufficient_quota',message:'sensitive-detail'}},{status:429});await assert.rejects(()=>chamarOpenAI({messages:[{role:'user',content:'x'}]}),e=>e.status===429&&!e.message.includes('sensitive-detail'));
 delete process.env.OPENAI_API_KEY;await assert.rejects(()=>chamarOpenAI({messages:[{role:'user',content:'x'}]}),/OPENAI_API_KEY/);
 }finally{restore();}
});
test('endpoint exige sessão e perfil ativo antes de chamar OpenAI; rota antiga usa mesmo handler',async()=>{
 const restore=preservar();process.env.OPENAI_API_KEY='test-only';let ativo=true,ai=0;
 global.fetch=async(url)=>{if(url.includes('/auth/'))return Response.json({id:'test-id'});if(url.includes('/profiles?'))return Response.json([{ativo}]);ai++;return Response.json(concluida('{"resumo":"Análise fictícia"}'));};
 const invoke=async(authorization='Bearer teste',body={messages:[{role:'user',content:'texto'}]})=>{const res={status(c){this.code=c;return this},json(d){this.data=d;return this},setHeader(){}};await handler({method:'POST',headers:{authorization,origin:'https://integracao.example',host:'integracao.example'},body},res);return res;};
 try{assert.equal(legacy,handler);assert.equal((await invoke('')).code,401);assert.equal(ai,0);ativo=false;assert.equal((await invoke()).code,403);assert.equal(ai,0);ativo=true;const r=await invoke();assert.equal(r.code,200);assert.equal(ai,1);assert.equal(r.data.content[0].text,'{"resumo":"Análise fictícia"}');assert.equal((await invoke('Bearer teste',{messages:[]})).code,400);assert.equal(ai,1);
 }finally{restore();}
});

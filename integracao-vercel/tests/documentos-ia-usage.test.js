import test from 'node:test';
import assert from 'node:assert/strict';
import {chamarOpenAI,configuracaoDocumentosIA,ErroIA} from '../server/openai.js';

const ENV=['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_DOCUMENT_MODEL','OPENAI_DOCUMENT_OCR_MODEL'];
const entrada={messages:[{role:'user',content:'conteudo-documental-privado'}],system:'instrucao-privada'};
const opcoes={purpose:'documentos_cliente',stage:'analise',onUsage:()=>{}};
const usage=(input=100,output=20,cached=40,reasoning=5)=>({
 input_tokens:input,output_tokens:output,total_tokens:input+output,
 input_tokens_details:{cached_tokens:cached},output_tokens_details:{reasoning_tokens:reasoning},
});
const concluida=(uso=usage())=>({status:'completed',model:'gpt-6-astra',usage:uso,output:[{type:'message',content:[{type:'output_text',text:'resultado'}]}]});
function preparar(t){
 const env=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));
 const fetch=global.fetch,info=console.info;
 t.after(()=>{global.fetch=fetch;console.info=info;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 for(const k of ENV)delete process.env[k];
 process.env.OPENAI_API_KEY='secret-test-only';
 // Nenhum teste pode cair na rede real, mesmo que uma fixture esteja ausente.
 global.fetch=async()=>{throw new Error('Fetch mockado não configurado.');};
}

test('config documental mantém fallback global e permite overrides separados somente pelo servidor',t=>{
 preparar(t);
 assert.deepEqual(configuracaoDocumentosIA(),{model:'gpt-6-astra',ocr_model:'gpt-6-astra',version:'documentos-cliente-v1'});
 process.env.OPENAI_MODEL=' gpt-6-global ';
 assert.deepEqual(configuracaoDocumentosIA(),{model:'gpt-6-global',ocr_model:'gpt-6-global',version:'documentos-cliente-v1'});
 process.env.OPENAI_DOCUMENT_MODEL=' gpt-6.1-sol ';
 assert.deepEqual(configuracaoDocumentosIA(),{model:'gpt-6.1-sol',ocr_model:'gpt-6.1-sol',version:'documentos-cliente-v1'});
 process.env.OPENAI_DOCUMENT_OCR_MODEL=' gpt-6-ocr ';
 assert.deepEqual(configuracaoDocumentosIA(),{model:'gpt-6.1-sol',ocr_model:'gpt-6-ocr',version:'documentos-cliente-v1'});
 assert.equal(process.env.OPENAI_DOCUMENT_MODEL,' gpt-6.1-sol ');
 process.env.OPENAI_DOCUMENT_MODEL=' ';
 assert.equal(configuracaoDocumentosIA().model,'gpt-6-global');
 assert.equal(configuracaoDocumentosIA().ocr_model,'gpt-6-ocr');
 process.env.OPENAI_DOCUMENT_OCR_MODEL=' ';
 assert.equal(configuracaoDocumentosIA().ocr_model,'gpt-6-global');
 assert.ok(!JSON.stringify(configuracaoDocumentosIA()).includes('secret-test-only'));
});

test('sucesso documental preserva usage original e informa contagens seguras',async t=>{
 preparar(t);process.env.OPENAI_DOCUMENT_MODEL='gpt-6.1-sol';
 const eventos=[],pedidos=[],uso={...usage(),extra_privado:'nao-registrar'};
 global.fetch=async(url,options)=>{pedidos.push(JSON.parse(options.body));return Response.json({...concluida(uso),model:'gpt-6.1-sol'});};
 const r=await chamarOpenAI(entrada,{...opcoes,onUsage:e=>eventos.push(e)});
 assert.equal(pedidos[0].model,'gpt-6.1-sol');assert.equal(pedidos[0].store,false);
 assert.deepEqual(r.usage,uso);
 assert.deepEqual(r.usage_total,{input_tokens:100,output_tokens:20,total_tokens:120,cached_tokens:40,reasoning_tokens:5,attempts:1});
 assert.deepEqual(r.usage_attempts,[{attempt:1,model:'gpt-6.1-sol',requested_model:'gpt-6.1-sol',stage:'analise',status:'completed',input_tokens:100,output_tokens:20,total_tokens:120,cached_tokens:40,reasoning_tokens:5}]);
 assert.deepEqual(eventos,r.usage_attempts);
 for(const segredo of ['conteudo-documental-privado','instrucao-privada','secret-test-only','nao-registrar'])assert.ok(!JSON.stringify(eventos).includes(segredo));
});

test('retry incomplete contabiliza ambas tentativas e mantém usage da última resposta',async t=>{
 preparar(t);const pedidos=[],eventos=[];
 global.fetch=async(url,options)=>{
  pedidos.push(JSON.parse(options.body));
  return Response.json(pedidos.length===1?{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:usage(90,10,30,8)}:concluida(usage(110,30,50,12)));
 };
 const r=await chamarOpenAI(entrada,{...opcoes,onUsage:e=>eventos.push(e)});
 assert.equal(pedidos.length,2);assert.equal(pedidos[1].max_output_tokens,pedidos[0].max_output_tokens*2);
 assert.equal(r.max_output_tokens,pedidos[1].max_output_tokens);
 assert.deepEqual(r.usage,usage(110,30,50,12));
 assert.deepEqual(r.usage_total,{input_tokens:200,output_tokens:40,total_tokens:240,cached_tokens:80,reasoning_tokens:20,attempts:2});
 assert.deepEqual(r.usage_attempts.map(e=>[e.attempt,e.status]),[[1,'incomplete'],[2,'completed']]);
 assert.deepEqual(eventos,r.usage_attempts);
});

test('falha HTTP contabiliza usage informado e não expõe detalhes brutos do erro',async t=>{
 preparar(t);const eventos=[];
 global.fetch=async()=>Response.json({usage:usage(15,3,0,2),error:{code:'insufficient_quota',message:'detalhe-privado'}},{status:429});
 await assert.rejects(()=>chamarOpenAI(entrada,{...opcoes,onUsage:e=>eventos.push(e)}),e=>{
  assert.ok(e instanceof ErroIA);assert.equal(e.status,429);assert.equal(e.model,'gpt-6-astra');
  assert.deepEqual(e.usage_total,{input_tokens:15,output_tokens:3,total_tokens:18,cached_tokens:0,reasoning_tokens:2,attempts:1});
  assert.equal(e.usage_attempts[0].status,'http_error');
  assert.ok(!JSON.stringify(e).includes('detalhe-privado'));assert.ok(!e.message.includes('detalhe-privado'));
  return true;
 });
 assert.equal(eventos.length,1);
});

test('erros transitórios continuam com até três tentativas, todas contabilizadas',async t=>{
 preparar(t);const eventos=[];let chamadas=0;
 global.fetch=async()=>{chamadas++;return Response.json({usage:usage(5,2,1,1),error:{code:'server_error'}},{status:503,headers:{'retry-after':'0'}});};
 await assert.rejects(()=>chamarOpenAI(entrada,{...opcoes,onUsage:e=>eventos.push(e)}),e=>{
  assert.equal(e.status,503);
  assert.deepEqual(e.usage_total,{input_tokens:15,output_tokens:6,total_tokens:21,cached_tokens:3,reasoning_tokens:3,attempts:3});
  assert.deepEqual(e.usage_attempts.map(x=>x.status),['http_error','http_error','http_error']);
  return true;
 });
 assert.equal(chamadas,3);assert.equal(eventos.length,3);
});

test('falha de rede após incomplete preserva uso conhecido e tentativa desconhecida',async t=>{
 preparar(t);let chamadas=0;
 global.fetch=async()=>{if(++chamadas===1)return Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:usage(11,7,3,5)});throw new Error('detalhe-conexao-privado');};
 await assert.rejects(()=>chamarOpenAI(entrada,opcoes),e=>{
  assert.equal(e.status,503);
  assert.deepEqual(e.usage_total,{input_tokens:11,output_tokens:7,total_tokens:18,cached_tokens:3,reasoning_tokens:5,attempts:2});
  assert.deepEqual(e.usage_attempts[1],{attempt:2,model:'gpt-6-astra',requested_model:'gpt-6-astra',stage:'analise',status:'connection_error',input_tokens:null,output_tokens:null,total_tokens:null,cached_tokens:null,reasoning_tokens:null});
  assert.ok(!JSON.stringify(e).includes('detalhe-conexao-privado'));return true;
 });
 assert.equal(chamadas,2);
});

test('timeout contabiliza tentativa sem inventar contagens ausentes',async t=>{
 preparar(t);global.fetch=async()=>{throw Object.assign(new Error('privado'),{name:'TimeoutError'});};
 await assert.rejects(()=>chamarOpenAI(entrada,opcoes),e=>e.status===504&&e.usage_total.attempts===1&&e.usage_attempts[0].status==='timeout'&&e.usage_attempts[0].total_tokens===null);
});

test('resposta recusada e incomplete sem retry conservam usage nos erros',async t=>{
 preparar(t);
 global.fetch=async()=>Response.json({...concluida(usage(12,4,2,1)),output:[{type:'message',content:[{type:'refusal',refusal:'texto-privado'}]}]});
 await assert.rejects(()=>chamarOpenAI(entrada,opcoes),e=>e.status===422&&e.usage_attempts[0].status==='refused'&&e.usage_total.total_tokens===16);
 global.fetch=async()=>Response.json({status:'incomplete',incomplete_details:{reason:'content_filter'},usage:usage(8,2,1,1)});
 await assert.rejects(()=>chamarOpenAI(entrada,opcoes),e=>e.status===422&&e.usage_attempts[0].status==='incomplete'&&e.usage_total.total_tokens===10);
});

test('OCR usa override do servidor e herda modelo documental quando não há override',async t=>{
 preparar(t);process.env.OPENAI_MODEL='gpt-6-global';process.env.OPENAI_DOCUMENT_MODEL='gpt-6.1-sol';
 const modelos=[];global.fetch=async(url,options)=>{modelos.push(JSON.parse(options.body).model);return Response.json(concluida());};
 await chamarOpenAI(entrada,{...opcoes,stage:'ocr'});
 process.env.OPENAI_DOCUMENT_OCR_MODEL='gpt-6-ocr';
 await chamarOpenAI({...entrada,model:'nao-usar-cliente'},{...opcoes,stage:'ocr',model:'nao-usar-opcao'});
 assert.deepEqual(modelos,['gpt-6.1-sol','gpt-6-ocr']);
});

test('chamadas genéricas ignoram propósito/modelo no payload e preservam modelo global e retorno',async t=>{
 preparar(t);process.env.OPENAI_MODEL='gpt-6-global';process.env.OPENAI_DOCUMENT_MODEL='gpt-6.1-sol';process.env.OPENAI_DOCUMENT_OCR_MODEL='gpt-6-ocr';
 const pedidos=[],logs=[];console.info=(...v)=>logs.push(v);
 global.fetch=async(url,options)=>{pedidos.push(JSON.parse(options.body));return Response.json(concluida());};
 const r=await chamarOpenAI({...entrada,purpose:'documentos_cliente',stage:'ocr',model:'modelo-cliente'});
 assert.equal(pedidos[0].model,'gpt-6-global');assert.deepEqual(r.usage,usage());
 assert.ok(!('usage_total' in r));assert.ok(!('usage_attempts' in r));assert.deepEqual(logs,[]);
 let chamouCallback=false;
 await chamarOpenAI(entrada,{purpose:'outro',stage:'ocr',onUsage:()=>{chamouCallback=true;}});
 assert.equal(pedidos[1].model,'gpt-6-global');assert.equal(chamouCallback,false);
 global.fetch=async()=>Response.json({error:{code:'insufficient_quota'}},{status:429});
 await assert.rejects(()=>chamarOpenAI(entrada),e=>e.status===429&&!('usage_total' in e)&&!('usage_attempts' in e));
 assert.deepEqual(logs,[]);
});

test('telemetria padrão usa somente metadados permitidos; callback com falha não altera resultado',async t=>{
 preparar(t);const logs=[];console.info=(...v)=>logs.push(v);
 global.fetch=async()=>Response.json(concluida());
 await chamarOpenAI(entrada,{purpose:'documentos_cliente',stage:'analise'});
 assert.equal(logs.length,1);assert.equal(logs[0][0],'[documentos_ia_usage]');
 assert.deepEqual(Object.keys(logs[0][1]).sort(),['attempt','model','requested_model','stage','status','input_tokens','output_tokens','total_tokens','cached_tokens','reasoning_tokens'].sort());
 assert.ok(!JSON.stringify(logs).includes('privad'));assert.ok(!JSON.stringify(logs).includes('secret-test-only'));
 assert.equal((await chamarOpenAI(entrada,{...opcoes,onUsage:()=>{throw new Error('logger quebrado');}})).content[0].text,'resultado');
 assert.equal((await chamarOpenAI(entrada,{...opcoes,onUsage:async()=>{throw new Error('logger async quebrado');}})).content[0].text,'resultado');
});

test('telemetria ignora contagens inválidas e campos de texto no usage do provedor',async t=>{
 preparar(t);const eventos=[];
 global.fetch=async()=>Response.json(concluida({input_tokens:'segredo',output_tokens:-1,total_tokens:0.5,input_tokens_details:{cached_tokens:{text:'privado'}},output_tokens_details:{reasoning_tokens:true},outro:'conteudo'}));
 const r=await chamarOpenAI(entrada,{...opcoes,onUsage:e=>eventos.push(e)});
 for(const campo of ['input_tokens','output_tokens','total_tokens','cached_tokens','reasoning_tokens']){assert.equal(r.usage_attempts[0][campo],null);assert.equal(r.usage_total[campo],0);}
 assert.ok(!JSON.stringify(eventos).includes('segredo'));assert.ok(!JSON.stringify(eventos).includes('privado'));
});

test('etapa documental desconhecida é rejeitada antes de qualquer chamada',async t=>{
 preparar(t);let chamadas=0;global.fetch=async()=>{chamadas++;return Response.json(concluida());};
 await assert.rejects(()=>chamarOpenAI(entrada,{...opcoes,stage:'desconhecida'}),e=>e.status===400);
 assert.equal(chamadas,0);
});

test('resposta malformada conserva uso no erro documental seguro',async t=>{
 preparar(t);global.fetch=async()=>Response.json({...concluida(usage(7,3,1,1)),output:{conteudo:'privado'}});
 await assert.rejects(()=>chamarOpenAI(entrada,opcoes),e=>{
  assert.ok(e instanceof ErroIA);assert.equal(e.status,503);assert.equal(e.usage_total.total_tokens,10);
  assert.equal(e.usage_total.attempts,1);assert.ok(!JSON.stringify(e).includes('privado'));return true;
 });
});

test('validação antes de enviar registra zero tentativas e não escreve telemetria',async t=>{
 preparar(t);const eventos=[];
 await assert.rejects(()=>chamarOpenAI({messages:[]},{...opcoes,onUsage:e=>eventos.push(e)}),e=>e.status===400&&e.usage_total.attempts===0&&e.usage_attempts.length===0);
 assert.deepEqual(eventos,[]);
});

test('telemetria distingue modelo solicitado, modelo retornado e etapa documental',async t=>{
 preparar(t);process.env.OPENAI_DOCUMENT_MODEL='gpt-6.1-sol';
 global.fetch=async()=>Response.json({...concluida(),model:'gpt-6.1-sol-2026-09-01'});
 const r=await chamarOpenAI(entrada,{...opcoes,stage:'ocr'});
 assert.equal(r.usage_attempts[0].model,'gpt-6.1-sol-2026-09-01');
 assert.equal(r.usage_attempts[0].requested_model,'gpt-6.1-sol');assert.equal(r.usage_attempts[0].stage,'ocr');
 global.fetch=async()=>Response.json({...concluida(),model:'gpt-6.1-sol-2026-09-01',status:'incomplete',incomplete_details:{reason:'content_filter'}});
 await assert.rejects(()=>chamarOpenAI(entrada,opcoes),e=>e.model==='gpt-6.1-sol-2026-09-01'&&e.usage_attempts[0].requested_model==='gpt-6.1-sol');
});

test('modelo bruto inválido não alcança telemetria ou erro seguro',async t=>{
 preparar(t);process.env.OPENAI_DOCUMENT_MODEL='gpt-6.1-sol';const eventos=[];
 global.fetch=async()=>Response.json({status:'failed',model:'texto privado\nconteudo de documento',usage:usage()});
 await assert.rejects(()=>chamarOpenAI(entrada,{...opcoes,onUsage:e=>eventos.push(e)}),e=>e.model==='gpt-6.1-sol');
 assert.equal(eventos[0].model,'gpt-6.1-sol');assert.ok(!JSON.stringify(eventos).includes('privado'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/agentes.js';

const response=()=>({headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
const pedido=body=>({method:'POST',headers:{authorization:'Bearer diretor-fixture'},body});
const openai=texto=>Response.json({status:'completed',model:'modelo-teste',output:[{type:'message',content:[{type:'output_text',text:texto}]}]});

test('função ausente no banco é indisponibilidade, não falsa negação ao Diretor',async()=>{
 await comFetch(()=>Response.json({code:'PGRST202'},{status:404}),async vistos=>{
  const res=response();await handler(pedido({modo:'setor',setor:'topografia'}),res);
  assert.equal(res.code,503);assert.match(res.body.erro,/atualização no banco/);
  assert.ok(vistos.every(v=>!v.url.includes('openai')));
 });
});

async function comFetch(responder,fn){
 const old=global.fetch,oldKey=process.env.OPENAI_API_KEY,vistos=[];
 process.env.OPENAI_API_KEY='chave-teste';
 global.fetch=async(url,o)=>{const corpo=JSON.parse(o.body);vistos.push({url:String(url),auth:o.headers.Authorization,corpo});return responder(String(url),corpo);};
 try{await fn(vistos);}finally{global.fetch=old;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
}

test('o panorama do setor vem do banco, com o token de quem pede e sem chamar a IA',async()=>{
 await comFetch(url=>Response.json({setor:'geral',rota:url.split('/').pop()}),async vistos=>{
  const res=response();await handler(pedido({modo:'setor',setor:'geral',paradoDias:60}),res);
  assert.equal(res.code,200);
  assert.equal(res.body.painel.rota,'integracao_agente_setor');
  assert.equal(res.body.comercial.rota,'integracao_agente_comercial');
  assert.ok(vistos.every(v=>v.auth==='Bearer diretor-fixture'));
  assert.ok(!vistos.some(v=>v.url.includes('openai')));
  assert.deepEqual(vistos.find(v=>v.url.endsWith('integracao_agente_setor')).corpo,{p_setor:'geral',p_parado_dias:60,p_limite:12});
 });
});

test('setor desconhecido e conversa sem pergunta são recusados antes do banco',async()=>{
 await comFetch(()=>Response.json({}),async vistos=>{
  for(const body of [{modo:'setor',setor:'financeiro'},{modo:'conversa',setor:'geral',mensagens:[]},{modo:'conversa',mensagens:[{papel:'diretoria',texto:'oi'}]}]){
   const res=response();await handler(pedido(body),res);assert.equal(res.code,400);
  }
  assert.equal(vistos.length,0);
 });
});

test('a conversa busca os andamentos do que foi citado e devolve quem foi consultado',async()=>{
 await comFetch((url,corpo)=>{
  if(url.includes('openai'))return openai('O NUI03 está parado há 97 dias.');
  if(url.endsWith('integracao_agente_andamentos'))return Response.json({encontrados:[{nucleo:'NUI03',municipio:'Ibirama/SC',andamentos:[]}],recentes:[]});
  return Response.json({});
 },async vistos=>{
  const res=response();
  await handler(pedido({modo:'conversa',setor:'topografia',mensagens:[{papel:'diretoria',texto:'Como está o NUI03 de Ibirama?'}]}),res);
  assert.equal(res.code,200);
  assert.equal(res.body.resposta,'O NUI03 está parado há 97 dias.');
  assert.deepEqual(res.body.consultados,['NUI03 (Ibirama/SC)']);
  assert.equal(vistos.find(v=>v.url.endsWith('integracao_agente_andamentos')).corpo.p_texto,'Como está o NUI03 de Ibirama?');
  assert.ok(vistos.some(v=>v.url.endsWith('integracao_agente_setor')));
  const prompt=JSON.stringify(vistos.find(v=>v.url.includes('openai')).corpo);
  assert.ok(prompt.includes('Mensagem da diretoria: Como está o NUI03 de Ibirama?'));
 });
});

test('as sugestões de meta chegam validadas e a resposta ilegível vira erro claro',async()=>{
 let texto='{"sugestoes":[{"titulo":"Destravar o NUI03","motivo":"97 dias parado","prazo_dias":10,"checklist":["a","b"]}]}';
 await comFetch(url=>url.includes('openai')?openai(texto):Response.json({setor:'topografia'}),async()=>{
  const res=response();await handler(pedido({modo:'sugestoes',setor:'topografia'}),res);
  assert.equal(res.code,200);
  assert.equal(res.body.sugestoes[0].titulo,'Destravar o NUI03');
  texto='não sei';
  const ruim=response();await handler(pedido({modo:'sugestoes',setor:'topografia'}),ruim);
  assert.equal(ruim.code,502);
  assert.match(ruim.body.erro,/sugestões legíveis/);
 });
});

test('quem não é da diretoria recebe 403 também nos modos novos',async()=>{
 await comFetch(()=>Response.json({code:'42501',message:'Painel disponível apenas para a diretoria'},{status:400}),async()=>{
  for(const body of [{modo:'setor'},{modo:'conversa',mensagens:[{papel:'diretoria',texto:'como estamos?'}]},{modo:'sugestoes'}]){
   const res=response();await handler(pedido(body),res);assert.equal(res.code,403);
  }
 });
});

test('ações prioritárias usam andamentos recentes e urgências com autorização do Diretor', async () => {
 await comFetch(url => url.includes('openai') ? openai('1. Revisar o memorial do NUI03 hoje.') : Response.json({setor:'topografia',hoje:'2026-09-26',metas:{pendencias:[{titulo:'Memorial NUI03',prazo:'2026-09-25',dias_atraso:1,status:'Em andamento',responsaveis:'Ana'}]},andamentos:{recentes:[{data:'2026-09-26',nucleo:'NUI03',municipio:'Ibirama',situacao:'Aguardando revisão',observacao:'Memorial corrigido recebido'}]}}), async vistos => {
  const res=response(); await handler(pedido({modo:'acoes',setor:'topografia'}),res);
  assert.equal(res.code,200); assert.match(res.body.acoes,/Revisar o memorial/);
  const ia=JSON.stringify(vistos.find(v=>v.url.includes('openai')).corpo);
  assert.match(ia,/Memorial corrigido recebido/); assert.match(ia,/1 dias de atraso/); assert.match(ia,/não recomende refazer/);
  assert.equal(vistos[0].auth,'Bearer diretor-fixture');
 });
});

test('ações não chamam IA quando o banco recusa o usuário', async () => {
 await comFetch(()=>Response.json({code:'42501'},{status:403}), async vistos=>{
  const res=response(); await handler(pedido({modo:'acoes',setor:'topografia'}),res);
  assert.equal(res.code,403); assert.ok(vistos.every(v=>!v.url.includes('openai')));
 });
});

test('estratégia técnica persistida orienta sugestões de novas metas',async()=>{
 await comFetch(url=>url.endsWith('integracao_agente_estrategias_ler')?Response.json({tecnico:'Priorizar prefeituras paradas há 60 dias'}):url.includes('openai')?openai(JSON.stringify({sugestoes:[{titulo:'Contatar prefeitura',motivo:'Parada',prazo_dias:7,checklist:['Conferir','Contatar']}]})):Response.json({}),async vistos=>{
 const res=response();await handler(pedido({modo:'sugestoes',setor:'topografia'}),res);
 assert.equal(res.code,200);assert.match(JSON.stringify(vistos.find(x=>x.url.includes('openai')).corpo),/Priorizar prefeituras paradas há 60 dias/);
 assert.equal(vistos.find(x=>x.url.endsWith('integracao_agente_estrategias_ler')).auth,'Bearer diretor-fixture');
 });
});

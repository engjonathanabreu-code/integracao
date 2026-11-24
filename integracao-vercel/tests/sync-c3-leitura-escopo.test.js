// Reprodução C3 (dono da correção: A3): leitura por escopo, concorrência limitada e repetição de GET.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as leitura from '../src/leitura-intencoes.js';
import {definirSessao,lerBase} from '../src/dados-compartilhados.js';
import {buscarREST} from '../src/transporte-rest.js';
import {tabelasProprias} from '../src/persistencia-modulos.js';
import {uuid} from './apoio-sync-fila.js';

const M1=uuid(1),M2=uuid(2),M3=uuid(3),U1=uuid(11),U2=uuid(12),U3=uuid(13);
const entrar=()=>definirSessao({user:{id:uuid(900)},access_token:'token',refresh_token:'r',expires_in:3600});
const comFetch=async(fn,corpo)=>{const original=globalThis.fetch;globalThis.fetch=fn;entrar();try{return await corpo();}finally{globalThis.fetch=original;definirSessao(null);}};
const tabelaDe=url=>{const u=new URL(String(url));const p=u.pathname.replace(/^\/rest\/v1\//,'');return p;};
const fonte=readFileSync(new URL('../src/dados-compartilhados.js',import.meta.url),'utf8');
const TABLES=JSON.parse(fonte.match(/const TABLES = (\[[^\]]+\])/)[1].replace(/'/g,'"'));
const TODAS=[...new Set([...TABLES,...tabelasProprias,'integracao_arquivos','meta_arquivos','erp_exclusoes_chat','documentos','fin_receb_clientes','integracao_moradores'])];
const anteriorCompleto=extra=>({...Object.fromEntries(TODAS.map(t=>[t,[]])),_contagensClientes:{},...extra});
const edicaoMeta={colecao:'metas',id:M1,antes:{existe:true,valor:{id:M1,titulo:'a',responsaveis:['erp_'+U1]}},depois:{existe:true,valor:{id:M1,titulo:'b',responsaveis:['erp_'+U1,'erp_'+U2]}}};

test('C3: escopoDaIntencao mapeia edição de meta para os ids da meta e filhos; intenção desconhecida devolve null',()=>{
 assert.equal(typeof leitura.escopoDaIntencao,'function','C3 ausente: escopoDaIntencao não é exportada por leitura-intencoes.js');
 const escopo=leitura.escopoDaIntencao({edicoes:[edicaoMeta],arquivos:{}},{});
 assert.ok(escopo&&typeof escopo==='object','edição de meta deveria ter escopo');
 assert.ok(escopo.metas?.ids?.includes(M1),`escopo.metas sem o id da meta: ${JSON.stringify(escopo)}`);
 const filhos=Object.entries(escopo).filter(([t,e])=>t!=='metas'&&e?.coluna==='meta_id'&&e.ids?.includes(M1)).map(([t])=>t);
 assert.ok(filhos.includes('meta_responsaveis'),`filhos relevantes (meta_id) ausentes: ${JSON.stringify(escopo)}`);
 for(const [t,e] of Object.entries(escopo))assert.ok(typeof e.coluna==='string'&&Array.isArray(e.ids),`entrada inválida em ${t}`);
 const comAlias=leitura.escopoDaIntencao({edicoes:[{...edicaoMeta,id:'local-1'}],arquivos:{}},{'local-1':M3});
 assert.ok(comAlias?.metas?.ids?.includes(M3),'aliases do recibo devem mapear o id local para o canônico');
 assert.equal(leitura.escopoDaIntencao({edicoes:[{colecao:'colecao_desconhecida',id:'x',antes:{existe:false},depois:{existe:true,valor:{id:'x'}}}],arquivos:{}},{}),null);
});

test('C3: lerBase({escopo, anterior}) lê só linhas filtradas (in.(...)) e substitui/remove no anterior',async()=>{
 const caminhos=[];
 const escopo={metas:{coluna:'id',ids:[M1,M3]},meta_responsaveis:{coluna:'meta_id',ids:[M1,M3]}};
 const anterior=anteriorCompleto({
  metas:[{id:M1,titulo:'velho'},{id:M2,titulo:'fora do escopo'},{id:M3,titulo:'apagado no servidor'}],
  meta_responsaveis:[{meta_id:M1,usuario_id:U1},{meta_id:M2,usuario_id:U2},{meta_id:M3,usuario_id:U1}],
  processos_kanban:[{id:'pk',nome:'intocado'}],
 });
 const r=await comFetch(async url=>{
  const p=tabelaDe(url);caminhos.push(decodeURIComponent(String(url)));
  if(p==='metas')return Response.json([{id:M1,titulo:'novo'}]);
  if(p==='meta_responsaveis')return Response.json([{meta_id:M1,usuario_id:U3}]);
  return Response.json([]);
 },()=>lerBase({escopo,anterior}));
 const tabelasLidas=[...new Set(caminhos.map(c=>tabelaDe(c)).filter(p=>!p.startsWith('rpc/')))];
 const fora=tabelasLidas.filter(t=>!Object.hasOwn(escopo,t));
 assert.deepEqual(fora,[],`lerBase com escopo leu tabelas fora do escopo (${fora.length}): ${fora.slice(0,8).join(', ')}…`);
 for(const t of Object.keys(escopo)){
  const doEscopo=caminhos.filter(c=>tabelaDe(c)===t);
  assert.ok(doEscopo.length&&doEscopo.every(c=>c.includes('in.(')),`${t} não foi lida com filtro in.(…): ${doEscopo.join(' | ')}`);
 }
 const ordenar=xs=>[...xs].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 assert.deepEqual(ordenar(r.metas),ordenar([{id:M1,titulo:'novo'},{id:M2,titulo:'fora do escopo'}]));
 assert.deepEqual(ordenar(r.meta_responsaveis),ordenar([{meta_id:M1,usuario_id:U3},{meta_id:M2,usuario_id:U2}]));
 assert.deepEqual(r.processos_kanban,[{id:'pk',nome:'intocado'}]);
});

test('C3: lerBase limita a 6 leituras simultâneas',async()=>{
 let ativas=0,pico=0;
 await comFetch(async()=>{ativas++;pico=Math.max(pico,ativas);await new Promise(r=>setTimeout(r,5));ativas--;return Response.json([]);},()=>lerBase());
 assert.ok(pico<=6,`pico de ${pico} requisições simultâneas`);
});

test('C3: falha de uma tabela repete só essa tabela',async()=>{
 const contagem=new Map();let falhasMetas=0;
 const r=await comFetch(async url=>{
  const p=tabelaDe(url);contagem.set(p,(contagem.get(p)||0)+1);
  if(p==='metas'&&falhasMetas<2){falhasMetas++;return Response.json({message:'indisponível'},{status:503});}
  return Response.json(p==='metas'?[{id:M1}]:[]);
 },async()=>{try{return await lerBase();}catch(e){return e;}});
 assert.ok(!(r instanceof Error),`lerBase falhou inteira por uma tabela: ${r?.message}`);
 assert.deepEqual(r.metas,[{id:M1}]);
 const repetidas=[...contagem].filter(([p,n])=>p!=='metas'&&!p.startsWith('rpc/')&&n>1).map(([p])=>p);
 assert.deepEqual(repetidas,[],'tabelas sem falha foram relidas');
});

for(const [status,headers] of [[500,{}],[429,{'Retry-After':'0'}]]){
 test(`C3: buscarREST repete GET que recebe ${status} uma vez e devolve o sucesso`,async()=>{
  const original=globalThis.fetch;let n=0;
  try{
   globalThis.fetch=async()=>++n===1?Response.json({message:'falha temporária'},{status,headers}):Response.json([{id:1}]);
   let erro,r;try{r=await buscarREST('https://exemplo.test/rest/v1/metas');}catch(e){erro=e;}
   assert.equal(erro,undefined,`GET com ${status} não foi repetido: ${erro?.message}`);
   assert.deepEqual(r,[{id:1}]);assert.equal(n,2);
  }finally{globalThis.fetch=original;}
 });
}

test('[GUARDA] C3: buscarREST não repete POST que recebe 500',async()=>{
 const original=globalThis.fetch;let n=0;
 try{globalThis.fetch=async()=>{n++;return Response.json({message:'erro'},{status:500});};
  await assert.rejects(buscarREST('https://exemplo.test/rest/v1/rpc/x',{method:'POST',body:'{}'}));assert.equal(n,1);
 }finally{globalThis.fetch=original;}
});

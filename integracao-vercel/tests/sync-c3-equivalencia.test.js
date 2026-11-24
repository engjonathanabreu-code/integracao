// C3 (A3): a leitura por escopo sobre a base completa anterior projeta os
// registros da intenção exatamente como uma leitura completa do servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {escopoDaIntencao,tabelasCompletasDoEscopo} from '../src/leitura-intencoes.js';
import {definirSessao,lerBase,projetar,substituirEscopo} from '../src/dados-compartilhados.js';
import {recortarIntencao} from '../src/intencoes-edicao.js';
import {atualizarFichas} from '../src/sincronizacao-clientes.js';
import {tabelasProprias} from '../src/persistencia-modulos.js';
import {uuid} from './apoio-sync-fila.js';

const fonte=readFileSync(new URL('../src/dados-compartilhados.js',import.meta.url),'utf8');
const TABLES=JSON.parse(fonte.match(/const TABLES = (\[[^\]]+\])/)[1].replace(/'/g,'"'));
const TODAS=[...new Set([...TABLES,...tabelasProprias,'integracao_arquivos','meta_arquivos','erp_exclusoes_chat','documentos','fin_receb_clientes','integracao_moradores'])];
const ORDEM={meta_responsaveis:'meta_id,usuario_id',etapa_responsaveis:'etapa_id,usuario_id',erp_evento_respostas:'evento_id,usuario_id',integracao_complementos:'colecao,registro_id'};
const ordem=t=>ORDEM[t]||(tabelasProprias.includes(t)||t==='integracao_arquivos'?'colecao,registro_id':'id');
const U1=uuid(11),U2=uuid(12),U3=uuid(13),EU=uuid(900);
const M1=uuid(1),M2=uuid(2),M3=uuid(3),S1=uuid(21),S2=uuid(22),C1=uuid(31),C2=uuid(32),C3=uuid(33),K1=uuid(41),H1=uuid(51),A1=uuid(61),A2=uuid(62),E1=uuid(71),E2=uuid(72),O1=uuid(81),OC1=uuid(82);
const AUD=uuid(91),NOT=uuid(92);

const servidorInicial=()=>({
 profiles:[{id:U1,nome:'Ana',email:'a@x',tipo:'Analista',setor:'Projetos',ativo:true},{id:U2,nome:'Bia',email:'b@x',tipo:'Analista',setor:'Projetos',ativo:true},{id:U3,nome:'Caio',email:'c@x',tipo:'Administrador',setor:'Diretoria',ativo:true}],
 meta_setores:[{id:S1,nome:'Projetos',ativo:true},{id:S2,nome:'Topografia',ativo:true}],
 metas:[{id:M1,titulo:'Meta 1',observacoes:'',status:'pendente',setor_id:S1,associacao_tipo:'avulsa',created_by:U1,updated_at:'2026-11-01T00:00:00Z'},{id:M2,titulo:'Meta 2',status:'pendente',setor_id:S2,associacao_tipo:'avulsa',created_by:U2}],
 meta_responsaveis:[{meta_id:M1,usuario_id:U1},{meta_id:M2,usuario_id:U2}],
 meta_checklist:[{id:C1,meta_id:M1,titulo:'Item 1',concluido:false},{id:C3,meta_id:M2,titulo:'Outra',concluido:false}],
 meta_comentarios:[{id:K1,meta_id:M1,autor_id:U2,texto:'Oi',created_at:'2026-11-02T00:00:00Z'}],
 meta_historico:[],meta_arquivos:[],
 integracao_metas:[{colecao:'metas',registro_id:M1,dados:{nota:'local'}},{colecao:'checklist',registro_id:C1,dados:{peso:1}},{colecao:'metas',registro_id:M2,dados:{nota:'m2'}}],
 erp_agendas:[{id:A1,nome:'Geral',cor:'#111'},{id:A2,nome:'Campo',cor:'#222'}],
 erp_eventos:[{id:E1,titulo:'Reunião',descricao:'',inicio:'2026-11-20T10:00:00Z',fim:'2026-11-20T11:00:00Z',agenda_id:A1,participantes:[U1,U2],publico:false,cor:null,status:'ativo',created_by:U1},{id:E2,titulo:'Vistoria',descricao:'',inicio:'2026-11-21T10:00:00Z',fim:'2026-11-21T11:00:00Z',agenda_id:A2,participantes:[U3],publico:true,cor:null,status:'ativo',created_by:U3}],
 erp_evento_respostas:[{evento_id:E1,usuario_id:U2,resposta:'talvez'}],
 integracao_calendario:[{colecao:'eventos',registro_id:E1,dados:{lembrete:15}}],
 ordens_servico:[{id:O1,nome:'OS 1',municipio:'Joinville',estado:'SC',created_at:'2026-11-01T00:00:00Z'}],
 ordem_servico_comentarios:[],integracao_ordens_servico:[],
 integracao_auditoria:[],integracao_notificacoes:[],integracao_complementos:[],
});
const servidorCompleto=dados=>({...Object.fromEntries(TODAS.map(t=>[t,[]])),...dados});

function servidorFalso(db,chamadas){
 return async(url,options={})=>{
  const u=String(url),[caminho,busca='']=u.split('/rest/v1/')[1].split('?');
  chamadas.push(u);
  if(caminho==='rpc/integracao_atribuicoes_contrato_ler')return Response.json({regras:{}});
  if(caminho==='rpc/erp_collab_directory')return Response.json(db.profiles.map(({id,nome,tipo,setor})=>({id,nome,tipo,setor})));
  if(caminho==='rpc/integracao_contagens_clientes')return Response.json({});
  const tabela=caminho==='rpc/integracao_eventos'?'erp_eventos':caminho;
  let linhas=[...(db[tabela]||[])];const params={};
  for(const par of busca.split('&')){const i=par.indexOf('=');params[par.slice(0,i)]=par.slice(i+1);}
  for(const [k,v] of Object.entries(params)){
   if(!v.startsWith('in.('))continue;
   const valores=v.slice(4,-1).split(',').map(x=>decodeURIComponent(x).replace(/^"(.*)"$/,'$1').replace(/\\(.)/g,'$1'));
   linhas=linhas.filter(r=>valores.includes(String(r[k])));
  }
  const cols=decodeURIComponent(params.order||'id').split(',');
  linhas.sort((a,b)=>{for(const c of cols){const x=String(a[c]??''),y=String(b[c]??'');if(x!==y)return x<y?-1:1;}return 0;});
  const offset=Number(params.offset||0),limit=Number(params.limit||500);
  return Response.json(structuredClone(linhas.slice(offset,offset+limit)));
 };
}
async function comServidor(db,corpo){
 const original=globalThis.fetch,chamadas=[];globalThis.fetch=servidorFalso(db,chamadas);
 definirSessao({user:{id:EU},access_token:'t',refresh_token:'r',expires_in:3600});
 try{return {r:await corpo(),chamadas};}finally{globalThis.fetch=original;definirSessao(null);}
}
const LOCAL={};
// Build the cached server state the app keeps (server.current.base) from a full read.
async function estadoAnterior(antigo){const {r}=await comServidor(servidorCompleto(antigo),()=>lerBase());return projetar(r,LOCAL).base;}
const limpar=x=>JSON.parse(JSON.stringify(x));
async function compararEquivalencia(t,{antigo,novo,edicoes}){
 const anterior=await estadoAnterior(antigo);
 const escopo=escopoDaIntencao({edicoes},{});
 assert.ok(escopo,`${t}: intenção deveria ter escopo`);
 const servidor=servidorCompleto(novo);
 const porEscopo=await comServidor(servidor,()=>lerBase({escopo,tabelas:tabelasCompletasDoEscopo(escopo),anterior:structuredClone(anterior),semCache:true}));
 const completa=await comServidor(servidor,()=>lerBase({semCache:true}));
 const a=projetar(porEscopo.r,LOCAL),b=projetar(completa.r,LOCAL);
 assert.deepEqual(limpar(recortarIntencao(a.db,edicoes)),limpar(recortarIntencao(b.db,edicoes)),`${t}: registros da intenção divergem`);
 // Unchanged records outside the scope stay identical too.
 assert.deepEqual(limpar(a.db),limpar(b.db),`${t}: projeção completa diverge`);
 const chaves=new Set(edicoes.map(e=>e.id));
 const vinc=s=>limpar(s.bindings.filter(x=>chaves.has(x.id)||chaves.has(x.parent?.id)).map(({collection,id,table,key,row,map,parent})=>({collection,id,table,key,row,parent,map:Object.keys(map)})));
 assert.deepEqual(vinc(a),vinc(b),`${t}: vínculos de gravação divergem`);
 assert.ok(porEscopo.chamadas.length<completa.chamadas.length,`${t}: escopo não reduziu chamadas (${porEscopo.chamadas.length} vs ${completa.chamadas.length})`);
 for(const c of porEscopo.chamadas.filter(c=>!c.includes('/rpc/')||c.includes('integracao_eventos'))){
  const tabela=c.split('/rest/v1/')[1].split('?')[0].replace('rpc/integracao_eventos','erp_eventos');
  if(!tabelasCompletasDoEscopo(escopo).includes(tabela))assert.ok(c.includes('in.('),`${t}: ${tabela} lida sem filtro`);
 }
 return {a,b,escopo,porEscopo,completa};
}
const meta=(id,extra={})=>({id,titulo:'x',...extra});
const ed=(colecao,id,antes,depois)=>({colecao,id,antes:antes===undefined?{existe:false}:{existe:true,valor:antes},depois:depois===undefined?{existe:false}:{existe:true,valor:depois}});

test('equivalência Metas: edição com responsável, checklist de outra pessoa com complemento, comentário removido e histórico',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo);
 novo.metas[0]={...novo.metas[0],titulo:'Meta 1 revisada',updated_at:'2026-11-24T00:00:00Z'};
 novo.meta_responsaveis.push({meta_id:M1,usuario_id:U3});
 novo.meta_checklist.push({id:C2,meta_id:M1,titulo:'Item de outra pessoa',concluido:true});
 novo.integracao_metas.push({colecao:'checklist',registro_id:C2,dados:{peso:3}});
 novo.integracao_metas[0]={...novo.integracao_metas[0],dados:{nota:'nova'}};
 novo.meta_comentarios=[];
 novo.meta_historico.push({id:H1,meta_id:M1,acao:'editou',descricao:'título',autor_id:U1,created_at:'2026-11-24T00:00:00Z'});
 const edicoes=[ed('metas',M1,meta(M1,{titulo:'Meta 1',checklist:[{id:C1}]}),meta(M1,{titulo:'Meta 1 revisada',checklist:[{id:C1}]}))];
 const {a}=await compararEquivalencia('metas-edicao',{antigo,novo,edicoes});
 const m=a.db.metas.find(x=>x.id===M1);
 assert.equal(m.titulo,'Meta 1 revisada');assert.equal(m.comentarios.length,0);assert.equal(m.checklist.find(c=>c.id===C2)?.peso,3,'complemento do filho novo não foi lido');
 assert.equal(a.db.metas.find(x=>x.id===M2).titulo,'Meta 2');
});

test('equivalência Metas: criação com filhos, auditoria e notificação na mesma intenção',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo);
 novo.metas.push({id:M3,titulo:'Nova',status:'pendente',setor_id:S2,associacao_tipo:'avulsa',created_by:EU});
 novo.meta_responsaveis.push({meta_id:M3,usuario_id:U1});
 novo.meta_checklist.push({id:uuid(34),meta_id:M3,titulo:'Primeiro',concluido:false});
 novo.integracao_auditoria.push({colecao:'auditoria',registro_id:AUD,dados:{id:AUD,acao:'Meta criada'}});
 novo.integracao_notificacoes.push({colecao:'notificacoes',registro_id:NOT,dados:{id:NOT,para:'erp_'+U1,rota:{pag:'metas'}}});
 const edicoes=[ed('metas',M3,undefined,meta(M3,{titulo:'Nova'})),ed('auditoria',AUD,undefined,{id:AUD,acao:'Meta criada'}),ed('notificacoes',NOT,undefined,{id:NOT,rota:{pag:'metas'}})];
 const {a}=await compararEquivalencia('metas-criacao',{antigo,novo,edicoes});
 assert.equal(a.db.metas.find(x=>x.id===M3)?.checklist.length,1);
 assert.ok(a.db.auditoria.some(x=>x.id===AUD));assert.ok(a.db.notificacoes.some(x=>x.id===NOT));
});

test('equivalência Metas: remoção (ou ocultação por RLS) retira a meta e todos os filhos',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo);
 novo.metas=novo.metas.filter(m=>m.id!==M1);
 for(const t of ['meta_responsaveis','meta_checklist','meta_comentarios'])novo[t]=novo[t].filter(r=>r.meta_id!==M1);
 novo.integracao_metas=novo.integracao_metas.filter(r=>![M1,C1].includes(r.registro_id));
 const edicoes=[ed('metas',M1,meta(M1,{checklist:[{id:C1}]}),undefined)];
 const {a,porEscopo}=await compararEquivalencia('metas-remocao',{antigo,novo,edicoes});
 assert.equal(a.db.metas.some(x=>x.id===M1),false);
 assert.equal(porEscopo.r.meta_checklist.some(r=>r.meta_id===M1),false);
 assert.equal(porEscopo.r.integracao_metas.some(r=>r.registro_id===C1),false);
});

test('equivalência Calendário: edição de evento/respostas/complemento, agenda e cancelamento oculto',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo);
 novo.erp_eventos[0]={...novo.erp_eventos[0],titulo:'Reunião geral',participantes:[U1,U2,U3]};
 novo.erp_evento_respostas=[{evento_id:E1,usuario_id:U3,resposta:'sim'}];
 novo.integracao_calendario[0]={...novo.integracao_calendario[0],dados:{lembrete:30}};
 novo.erp_agendas[0]={...novo.erp_agendas[0],cor:'#f00'};
 novo.erp_eventos=novo.erp_eventos.filter(e=>e.id!==E2);
 const edicoes=[ed('eventos',E1,{id:E1,titulo:'Reunião'},{id:E1,titulo:'Reunião geral'}),ed('agendas',A1,{id:A1,cor:'#111'},{id:A1,cor:'#f00'}),ed('eventos',E2,{id:E2},{id:E2,status:'cancelado'})];
 const {a}=await compararEquivalencia('calendario',{antigo,novo,edicoes});
 const e=a.db.eventos.find(x=>x.id===E1);
 assert.equal(e.titulo,'Reunião geral');assert.deepEqual(Object.keys(e.respostas),['erp_'+U3]);assert.equal(e.lembrete,30);
 assert.equal(a.db.eventos.some(x=>x.id===E2),false);
});

test('equivalência Ordens de serviço: comentário novo e complemento',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo);
 novo.ordens_servico[0]={...novo.ordens_servico[0],observacoes:'atualizada'};
 novo.ordem_servico_comentarios.push({id:OC1,ordem_servico_id:O1,autor_id:U1,texto:'feito',created_at:'2026-11-24T00:00:00Z'});
 novo.integracao_ordens_servico.push({colecao:'ordensServico',registro_id:O1,dados:{prioridade:'alta'}});
 const edicoes=[ed('ordensServico',O1,{id:O1},{id:O1,observacoes:'atualizada'})];
 const {a}=await compararEquivalencia('os',{antigo,novo,edicoes});
 assert.equal(a.db.ordensServico.find(o=>o.id===O1).comentarios.length,1);
});

test('escopo devolve null para módulos sem recorte seguro, criação definida pelo servidor e coleção sem id',()=>{
 const nulos={
  processos:[ed('processos',uuid(5),{id:uuid(5)},{id:uuid(5),codigo:'1'})],
  nucleos:[ed('nucleos',uuid(6),{id:uuid(6)},{id:uuid(6),nome:'n'})],
  planos:[ed('planos',uuid(7),{id:uuid(7)},{id:uuid(7),titulo:'p'})],
  usuarios:[ed('usuarios','erp_'+U1,{id:'erp_'+U1},{id:'erp_'+U1,tema:'escuro'})],
  conversas:[ed('conversas',uuid(8),{id:uuid(8)},{id:uuid(8),titulo:'c'})],
  'evento novo':[ed('eventos','evento_local',undefined,{id:'evento_local',titulo:'novo'})],
  'agenda nova':[ed('agendas','agenda_local',undefined,{id:'agenda_local',nome:'nova'})],
  'config sem id':[{colecao:'regrasIA',antes:{existe:true,valor:[]},depois:{existe:true,valor:[{id:'r'}]}}],
  'mista com módulo não mapeado':[ed('metas',M1,meta(M1),meta(M1,{titulo:'y'})),ed('processos',uuid(5),{id:uuid(5)},{id:uuid(5),codigo:'2'})],
 };
 for(const [nome,edicoes] of Object.entries(nulos))assert.equal(escopoDaIntencao({edicoes},{}),null,nome);
 assert.equal(escopoDaIntencao({edicoes:[]},{}),null);
});

test('lerBase com escopo sem base anterior completa faz leitura completa',async()=>{
 const servidor=servidorCompleto(servidorInicial());
 const escopo={metas:{coluna:'id',ids:[M1]}};
 const parcial=await comServidor(servidor,()=>lerBase({escopo,anterior:{metas:[]}}));
 const completa=await comServidor(servidor,()=>lerBase());
 assert.equal(parcial.chamadas.length,completa.chamadas.length);
 assert.ok(parcial.chamadas.every(c=>!c.includes('in.(')));
 assert.equal(parcial.r.metas.length,2);
});

test('lerBase com escopo divide ids em lotes de até 100 e codifica valores',async()=>{
 const ids=Array.from({length:230},(_,i)=>uuid(1000+i)).concat(['a,b"c']);
 const servidor=servidorCompleto(servidorInicial());
 const anterior=await estadoAnterior(servidorInicial());
 const {chamadas}=await comServidor(servidor,()=>lerBase({escopo:{metas:{coluna:'id',ids}},anterior}));
 const lidas=chamadas.filter(c=>c.includes('/rest/v1/metas?'));
 assert.equal(lidas.length,3);
 assert.ok(lidas.every(c=>c.split('in.(')[1].split(')')[0].split(',').length<=100));
 assert.ok(lidas.some(c=>c.includes(encodeURIComponent('"a,b\\"c"'))));
});

test('substituirEscopo preserva a ordem fora do escopo e posiciona linhas novas pela ordem da leitura',()=>{
 const r=substituirEscopo('meta_checklist',[{id:'a',meta_id:'1'},{id:'c',meta_id:'2'},{id:'e',meta_id:'1'}],'meta_id',['1'],[{id:'b',meta_id:'1'},{id:'f',meta_id:'1'}]);
 assert.deepEqual(r.map(x=>x.id),['b','c','f']);
});

test('falha persistente de uma tabela no escopo continua lançando (nada é confirmado sem leitura)',async()=>{
 const anterior=await estadoAnterior(servidorInicial());
 const original=globalThis.fetch;let n=0;
 globalThis.fetch=async url=>{if(String(url).includes('/rest/v1/metas?')){n++;return Response.json({message:'fora'},{status:503});}return Response.json([]);};
 definirSessao({user:{id:EU},access_token:'t',refresh_token:'r',expires_in:3600});
 try{await assert.rejects(lerBase({escopo:{metas:{coluna:'id',ids:[M1]}},anterior}));assert.ok(n>=3&&n<=6,`tentativas: ${n}`);}
 finally{globalThis.fetch=original;definirSessao(null);}
});

test('fichas: falha isolada de um cadastro preserva os demais, mas o item dependente não é lido sem ela; sessão interrompe tudo',async()=>{
 const P1=uuid(101),P2=uuid(102);
 const anterior={fin_receb_clientes:[{id:P1,nome:'antigo'}],integracao_moradores:[],integracao_complementos:[]};
 const vazio=()=>({fin_receb_clientes:[],integracao_moradores:[],integracao_complementos:[]});
 const ler=async c=>{if(c.id===P1)throw Object.assign(new Error('fora'),{status:503});return {clientes:[{id:P2,nome:'novo'}],complementos:[]};};
 const base=vazio();
 await atualizarFichas(base,[{id:P1},{id:P2}],ler,{isolarFalhas:true,anterior});
 assert.deepEqual(base.fin_receb_clientes.map(c=>c.nome).sort(),['antigo','novo']);
 assert.deepEqual(base._falhasFichas.map(f=>[f.id,f.categoria]),[[P1,'transitoria']]);
 // The diary item path reads its own files without isolation: it cannot confirm.
 await assert.rejects(atualizarFichas(vazio(),[{id:P1}],ler,{anterior}),/fora/);
 const sessao=async()=>{throw Object.assign(new Error('expirada'),{status:401,code:'SESSAO_EXPIRADA'});};
 await assert.rejects(atualizarFichas(vazio(),[{id:P2}],sessao,{isolarFalhas:true,anterior}),/expirada/);
});

test('erro de permissão não é repetido',async()=>{
 const original=globalThis.fetch;let n=0;
 globalThis.fetch=async url=>{if(String(url).includes('/rest/v1/metas?')){n++;return Response.json({message:'negado',code:'42501'},{status:403});}return Response.json([]);};
 definirSessao({user:{id:EU},access_token:'t',refresh_token:'r',expires_in:3600});
 try{await assert.rejects(lerBase());assert.equal(n,1);}finally{globalThis.fetch=original;definirSessao(null);}
});

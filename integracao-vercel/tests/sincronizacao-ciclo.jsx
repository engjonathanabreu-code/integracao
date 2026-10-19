import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {fixture,blank,id} from './fixture.js';
import {projetar,copy,definirSessao} from '../src/dados-compartilhados.js';
import {useDadosCompartilhados} from '../src/use-dados-compartilhados.js';
import RevisaoConcorrencia from '../src/RevisaoConcorrencia.jsx';

// Isolated real-hook harness. Never forwards requests or credentials to an external host.
const scenario=new URLSearchParams(location.search).get('cenario')||'fantasma';
const tipo=new URLSearchParams(location.search).get('tipo')||'Comercial';
const storage={get:async k=>localStorage.getItem(k),set:async(k,v)=>localStorage.setItem(k,v)};
const initial=fixture();initial.profiles[0].tipo=tipo;
initial.integracao_moradores=[{colecao:'processos',registro_id:id(4),referencia_tabela:'fin_receb_clientes',referencia_id:id(4),criado_por:id(1),dados:{etapa:0,checks:{}}}];
if(scenario==='municipio-restaurado'){
 initial.integracao_moradores[0].dados.nucleoId=id(5);
 initial.fin_receb_clientes.push({...initial.fin_receb_clientes[0],id:id(44),codigo:'TST01_002',nome:'Outro cliente ativo'});
 initial.integracao_moradores.push({...initial.integracao_moradores[0],registro_id:id(44),referencia_id:id(44),dados:{etapa:0,nucleoId:id(5),checks:{}}});
}
if(scenario==='reserva-recusada'){
 initial.erp_agendas=[{id:id(40),nome:'Sala'}];
 initial.erp_eventos=[{id:id(41),titulo:'Reserva confirmada',agenda_id:id(40),inicio:'2026-10-15T13:00:00Z',fim:'2026-10-15T14:00:00Z',status:'ativo',participantes:[id(1)],created_by:id(1)}];
}
if(scenario==='meta-historico-ausente'){
 initial.erp_conversas=[{id:id(60),tipo:'grupo',titulo:'Equipe',participantes:[id(1)],created_by:id(1)}];
 initial.erp_mensagens=[{id:id(61),conversa_id:id(60),autor_id:id(1),texto:'Mensagem recebida durante a pendência',created_at:'2026-10-19T12:00:00Z'}];
}
let base=JSON.parse(localStorage.getItem('harness-server')||'null')||copy(initial);
let receipts=JSON.parse(localStorage.getItem('harness-receipts')||'{}');
const actor=projetar(initial,blank()).db.usuarios[0];
const ghost={id:id(99),_compartilhado:true,requerente:{rg:'rascunho antigo'},checks:{}};
const stats={writes:Number(localStorage.getItem('harness-writes')||0),posts:0,requests:[],readsAfterSave:0};
const flags={failReads:scenario==='falha-leitura'&&!localStorage.getItem('harness-recovered'),loseResponse:scenario==='resposta-perdida',deny:scenario==='permissao',conflict:scenario==='conflito'};
const saveServer=()=>{localStorage.setItem('harness-server',JSON.stringify(base));localStorage.setItem('harness-receipts',JSON.stringify(receipts));localStorage.setItem('harness-writes',String(stats.writes));};
const key='integracao-compartilhado-'+id(1);
if(!localStorage.getItem(key)){
 const state=projetar(initial,blank()),before=copy(state.db),after=copy(before);
 after.processos[0].etapa=1;
 if(scenario==='fantasma'){before.processos.push(copy(ghost));after.processos.push(copy(ghost));}
 let operations=[{table:'integracao_moradores',key:{colecao:'processos',registro_id:id(4)},expected:{dados:initial.integracao_moradores[0].dados},changes:{dados:{etapa:1,checks:{}}}}];
 if(scenario==='reserva-recusada'){const evento={...after.eventos[0],id:id(42),titulo:'Reserva pendente'};delete evento._compartilhado;after.eventos.push(evento);operations.push({action:'evento',tempId:evento.id,payload:{titulo:evento.titulo,agenda_id:id(40),inicio:evento.inicio,fim:evento.fim}});}
 if(scenario==='exclusao-recusada'){after.processos=[];operations=[{table:'fin_receb_clientes',key:{id:id(4)},expected:initial.fin_receb_clientes[0],remove:true}];}
 if(scenario==='meta-historico-ausente'){
  after.metas[0].status='Concluído';
  after.metas.push({...copy(after.metas[0]),id:id(70),erpId:undefined,_compartilhado:undefined,titulo:'Meta criada offline',status:'Em andamento',historico:[{id:id(71),acao:'criar',descricao:'Criação preservada'}]});
  operations.push({table:'meta_historico',key:{id:id(98)},insert:true,changes:{meta_id:id(99),meta_titulo:'Meta removida',acao:'alterar',autor_id:id(1)}});
 }
 localStorage.setItem(key,JSON.stringify({db:after,baseline:before,base:initial,pending:true,attempt:{id:crypto.randomUUID(),before,after,operations,sent:{}},municipios:[id(2)]}));
}
if(scenario==='concorrente-igual')base.integracao_moradores[0].dados.etapa=1;
if(scenario==='concorrente-divergente')base.integracao_moradores[0].dados.etapa=2;
if(scenario==='concorrente-independente')base.integracao_moradores[0].dados.checks={remoto:true};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 stats.requests.push(url.pathname);
 if(url.pathname==='/api/conexao')return response({ok:true});
 if(!url.hostname.endsWith('.supabase.co'))return response({message:'Rede externa bloqueada'},503);
 if(url.pathname.includes('/auth/'))return response({message:'Autenticação não utilizada no teste'},403);
 if(url.pathname.endsWith('/rpc/integracao_gravar')){
  stats.posts++;const {operacoes,pedido}=JSON.parse(options.body);
  if(receipts[pedido])return response(receipts[pedido]);
  if(scenario==='reserva-recusada'&&operacoes.some(o=>o.action==='evento'))return response({message:'O ativo já está reservado em uma das datas selecionadas',code:'P0001'},400);
  if(scenario==='exclusao-recusada'&&operacoes.some(o=>o.remove))return response({message:'Exclusão não autorizada',code:'P0001'},400);
  if(flags.deny)return response({message:'Sem permissão para gravar',code:'42501'},403);
  if(flags.conflict)return response({message:'Conflito real preservado',code:'PT409'},409);
  const next=copy(base);
  for(const op of operacoes){
   const rows=next[op.table]||=[];const matches=r=>Object.entries(op.key).every(([k,v])=>r[k]===v);
   const row=rows.find(matches);
   if(op.insert&&op.table==='meta_historico'&&!next.metas.some(m=>m.id===op.changes.meta_id))return response({message:'insert or update on table "meta_historico" violates foreign key constraint "meta_historico_meta_id_fkey"',code:'23503'},409);
   if(op.insert){if(row)return response({message:'Duplicação'},409);rows.push({...op.key,...op.changes});}
   else{
    if(!row)return response({message:'Registro ausente'},403);
    for(const [k,v] of Object.entries(op.expected||{}))if(JSON.stringify(row[k])!==JSON.stringify(v))return response({message:'Baseline desatualizada',code:'PT409'},409);
    if(op.remove)next[op.table]=rows.filter(r=>!matches(r));else Object.assign(row,op.changes);
   }
  }
  base=next;receipts[pedido]={aliases:{}};stats.writes++;saveServer();
  if(flags.loseResponse){flags.loseResponse=false;throw new TypeError('Resposta perdida após gravação');}
  return response(receipts[pedido]);
 }
 if(stats.writes&&flags.failReads)return response({message:'Leitura temporariamente indisponível'},503);
 if(stats.writes)stats.readsAfterSave++;
 if(url.pathname.endsWith('/rpc/integracao_contagens_clientes'))return response([]);
 if(url.pathname.endsWith('/rpc/erp_collab_directory'))return response(base.profiles);
 if(url.pathname.endsWith('/rpc/integracao_moradores_carga')){const {municipio}=JSON.parse(options.body);return response({clientes:base.fin_receb_clientes.filter(x=>x.municipio_id===municipio),complementos:base.integracao_moradores,total:1});}
 const table=url.pathname.endsWith('/rpc/integracao_eventos')?'erp_eventos':url.pathname.split('/').at(-1);
 let rows=base[table]||[];
 for(const k of ['id','colecao','registro_id','referencia_id']){const f=url.searchParams.get(k);if(f?.startsWith('eq.'))rows=rows.filter(r=>r[k]===f.slice(3));}
 return response(rows.slice(Number(url.searchParams.get('offset')||0),500));
};
// Prevent sockets from reaching real services while exercising the production hook.
window.WebSocket=class{static OPEN=1;constructor(){this.readyState=0;}close(){this.readyState=3;}send(){}};
function Harness(){
 const [db,setDb]=useState(blank()),[ready,setReady]=useState(false),[fatal,setFatal]=useState('');
 const sync=useDadosCompartilhados({setDb,storage,baseLimpa:blank});
 useEffect(()=>{definirSessao({user:{id:id(1)},access_token:'isolated-fixture',expires_in:3600});sync.open(actor,null).then(()=>setReady(true)).catch(e=>setFatal(e.message));},[]);
 window.syncHarness={stats,flags,db,sync,ready,base:()=>base,salvarServidor:saveServer,draft:()=>JSON.parse(localStorage.getItem(key)),recover:()=>{flags.failReads=false;localStorage.setItem('harness-recovered','1');window.dispatchEvent(new Event('online'));}};
 return <main><h1>Sincronização — {tipo}</h1><p id="status">{sync.status}</p><p id="error">{sync.error||fatal}</p>{sync.conflitos.length>0&&<RevisaoConcorrencia dados={db} conflitos={sync.conflitos} resolver={sync.resolverConflitos}/>}<p id="etapa">Etapa: {db.processos.find(x=>x.id===id(4))?.etapa}</p><p id="metas">Metas: {db.metas.map(m=>m.status).join(", ")}</p><p id="ghost">Ficha antiga: {db.processos.some(x=>x.id===id(99))?'presente':'ausente'}</p><button disabled={!ready} onClick={()=>sync.mutate(d=>{d.processos.find(x=>x.id===id(4)).etapa=2;return d;})}>Editar novamente</button><button onClick={()=>window.syncHarness.recover()}>Restaurar conexão</button></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);

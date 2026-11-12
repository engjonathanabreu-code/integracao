import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao,definirSessao} from '../src/dados-compartilhados.js';
import {useDadosCompartilhados} from '../src/use-dados-compartilhados.js';

// Two isolated account sessions read the same fixture server. No real records,
// credentials or network services participate in this test.
const primeira=new URLSearchParams(location.search).get('conta')!=='leitora';
const conta=primeira?id(1):id(2),pedido=id(91),chave='checklist-propagacao-servidor';
const inicial=fixture();
inicial.profiles=[{id:id(1),nome:'Pessoa A',tipo:'Projetos',ativo:true},{id:id(2),nome:'Pessoa B',tipo:'Projetos',ativo:true}];
inicial.meta_responsaveis.push({meta_id:id(7),usuario_id:id(2)});
inicial.meta_checklist=[{id:id(20),meta_id:id(7),titulo:'Checklist fictício',concluido:false,concluido_por:null,concluido_em:null,created_by:id(1),created_at:'2026-11-12T12:00:00+00:00'}];
const state=projetar(inicial,blank()),antes=state.db,depois=structuredClone(antes),actor=antes.usuarios.find(u=>u.erpRef===conta);
Object.assign(depois.metas[0].checklist[0],{concluido:true,concluido_por:'Pessoa A',concluido_em:'2026-11-12T16:15:36.123Z'});
const operacoes=prepararEdicao(antes,depois,state,antes.usuarios.find(u=>u.erpRef===id(1)));
function aplicar(base,ops){
 for(const op of ops){
  const rows=base[op.table]||=[],match=r=>Object.entries(op.key).every(([k,v])=>r[k]===v),row=rows.find(match);
  if(op.remove)base[op.table]=rows.filter(r=>!match(r));
  else if(row)Object.assign(row,op.changes);
  else rows.push({...op.key,...op.changes});
 }
}
if(!localStorage.getItem(chave)){
 const base=structuredClone(inicial);aplicar(base,operacoes);
 base.meta_checklist[0].concluido_em='2026-11-12T16:15:36.123+00:00';
 localStorage.setItem(chave,JSON.stringify({base,recibos:{[id(1)+':'+pedido]:{aliases:{}}},envios:[],gravacoes:1}));
}
const chaveRascunho='integracao-compartilhado-'+conta;
if(primeira&&!localStorage.getItem(chaveRascunho)){
 const segunda=structuredClone(depois);segunda.metas[0].titulo='Edição posterior da mesma meta';
 localStorage.setItem(chaveRascunho,JSON.stringify({db:segunda,baseline:antes,base:inicial,pending:true,attempt:{id:pedido,before:antes,after:depois,operations:operacoes,sent:{},confirmacao:{aliases:{}}}}));
}
const servidor=()=>JSON.parse(localStorage.getItem(chave));
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,options={})=>{
 const u=new URL(typeof input==='string'?input:input.url,location.href),s=servidor(),t=u.pathname.split('/').at(-1);
 if(!u.hostname.endsWith('.supabase.co'))return json({code:'REDE_BLOQUEADA'},503);
 if(t==='integracao_atribuicoes_contrato_ler')return json({regras:{},pendencias:[]});
 if(t==='integracao_consultar_pedido')return json(s.recibos[conta+':'+JSON.parse(options.body).pedido]||null);
 if(t==='integracao_gravar'){
  const {pedido,operacoes}=JSON.parse(options.body),key=conta+':'+pedido;s.envios.push({conta,pedido});
  if(!s.recibos[key]){aplicar(s.base,operacoes);s.recibos[key]={aliases:{}};s.gravacoes++;}
  localStorage.setItem(chave,JSON.stringify(s));return json(s.recibos[key]);
 }
 if(t==='erp_collab_directory')return json(s.base.profiles);
 if(t==='integracao_contagens_clientes')return json([]);
 const tabela=t==='integracao_eventos'?'erp_eventos':t;
 let rows=s.base[tabela]||[];
 for(const k of ['id','colecao','registro_id','referencia_id']){const filtro=u.searchParams.get(k);if(filtro?.startsWith('eq.'))rows=rows.filter(r=>r[k]===filtro.slice(3));}
 return json(rows.slice(Number(u.searchParams.get('offset')||0),500));
};
window.WebSocket=class{static OPEN=1;constructor(){this.readyState=0;}close(){this.readyState=3;}send(){}};
const storage={get:async k=>localStorage.getItem(k),set:async(k,v)=>localStorage.setItem(k,v)};
function Harness(){
 const [db,setDb]=useState(blank()),[ready,setReady]=useState(false),[fatal,setFatal]=useState('');
 const sync=useDadosCompartilhados({setDb,storage,baseLimpa:blank});
 useEffect(()=>{definirSessao({user:{id:conta},access_token:'fixture-sem-credencial-real',expires_in:3600});sync.open(actor,null).then(()=>setReady(true)).catch(e=>setFatal(e.message));return()=>sync.close();},[]);
 window.fluxoChecklist={db,sync,ready,servidor,pedido,conta};
 return <main><h1>Conta fictícia {primeira?'A':'B'}</h1><p>{fatal||sync.error}</p><p>{db.metas[0]?.titulo}</p></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);

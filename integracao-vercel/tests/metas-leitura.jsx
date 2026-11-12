import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {fixture,blank,id} from './fixture.js';
import {projetar,definirSessao} from '../src/dados-compartilhados.js';
import {useDadosCompartilhados} from '../src/use-dados-compartilhados.js';

// Real hook and IndexedDB, isolated fixture server. Never forwards credentials,
// requests or writes to a real service. Faults are armed after initial opening.
const base=fixture();
base.meta_checklist=[{id:id(20),meta_id:id(7),titulo:'Item preservado',concluido:false,concluido_em:null}];
const actor=projetar(base,blank()).db.usuarios[0],receipts={},stats={posts:0,uploads:0,requests:[],operations:[]};
const flags={chat503:false,checklist503:false,perfis403:false,contrato403:false,trocarSessao:false,falharLeituraAposRecibo:false};
const storage={get:async k=>localStorage.getItem(k),set:async(k,v)=>localStorage.setItem(k,v)};
const nativeFetch=window.fetch.bind(window),json=(v,status=200)=>Response.json(v,{status});
window.fetch=async(input,options={})=>{
 const raw=typeof input==='string'?input:input.url;
 if(raw.startsWith('data:'))return nativeFetch(input,options);
 const u=new URL(raw,location.href),t=u.pathname.split('/').at(-1);
 if(!u.hostname.endsWith('.supabase.co'))return json({code:'REDE_BLOQUEADA'},503);
 stats.requests.push({t,method:options.method||'GET'});
 if(u.pathname.includes('/storage/v1/object/documentos/')){stats.uploads++;return json({});}
 if(t==='erp_mensagens'&&flags.chat503)return json({code:'50300'},503);
 if(t==='meta_checklist'&&flags.checklist503)return json({code:'50300'},503);
 if(t==='profiles'&&flags.perfis403)return json({code:'42501'},403);
 if(t==='integracao_atribuicoes_contrato_ler'){
  if(flags.trocarSessao){flags.trocarSessao=false;definirSessao({user:{id:id(2)},access_token:'outra-conta-ficticia',expires_in:3600});}
  return flags.contrato403?json({code:'42501'},403):json({regras:{},pendencias:[]});
 }
 if(t==='erp_collab_directory')return json(base.profiles);
 if(t==='integracao_contagens_clientes')return json([]);
 if(t==='integracao_consultar_pedido')return json(receipts[JSON.parse(options.body).pedido]||null);
 if(t==='integracao_gravar'){
  stats.posts++;const {pedido,operacoes}=JSON.parse(options.body);stats.operations.push(operacoes);
  if(!receipts[pedido]){
   for(const op of operacoes){
    const rows=base[op.table]||=[],match=r=>Object.entries(op.key).every(([k,v])=>r[k]===v),row=rows.find(match);
    if(op.remove)base[op.table]=rows.filter(r=>!match(r));
    else if(row)Object.assign(row,op.changes);
    else rows.push({created_at:'2026-11-12T18:00:02.000+00:00',...op.key,...op.changes});
   }
   receipts[pedido]={aliases:{}};
  }
  if(flags.falharLeituraAposRecibo)flags.checklist503=true;
  return json(receipts[pedido]);
 }
 const rows=base[t==='integracao_eventos'?'erp_eventos':t]||[];
 return json(rows.slice(Number(u.searchParams.get('offset')||0),500));
};
window.WebSocket=class{static OPEN=1;constructor(){this.readyState=0;}close(){this.readyState=3;}send(){}};
function Harness(){
 const [db,setDb]=useState(blank()),[ready,setReady]=useState(false),[fatal,setFatal]=useState('');
 const sync=useDadosCompartilhados({setDb,storage,baseLimpa:blank});
 useEffect(()=>{definirSessao({user:{id:id(1)},access_token:'fixture-sem-credencial-real',expires_in:3600});sync.open(actor,null).then(()=>setReady(true)).catch(e=>setFatal(e.message));return()=>sync.close();},[]);
 window.metasLeitura={sync,db,ready,fatal,stats,flags,base,actor,receipts,storage,id};
 return <main><h1>Metas — leitura isolada</h1><p>{fatal||sync.error}</p><p>{db.metas[0]?.titulo}</p></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);

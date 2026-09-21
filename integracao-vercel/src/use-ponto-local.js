import {useEffect,useState} from 'react';
import {ponto,idPonto} from './ponto-api.js';
import {lerPontoLocal,gravarPontoLocal,enfileirarPonto,enviarFilaPonto,visaoPontoLocal} from './ponto-local.js';
const evento='integracao:ponto-local';
const exclusao=(id,fn)=>navigator.locks?navigator.locks.request(`ponto:${id}`,fn):Promise.reject(Error('Atualize o navegador para registrar o ponto com segurança neste aparelho.'));
function salvar(id,r){gravarPontoLocal(id,r);window.dispatchEvent(new Event(evento));}
export function usePontoLocal(usuario,{sincronizar=false}={}){
 const id=idPonto(usuario),[dados,setDados]=useState({estado:null,fila:[]}),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[online,setOnline]=useState(navigator.onLine);
 const ler=()=>{try{setDados(lerPontoLocal(id));}catch(e){setErro(e.message);}};
 useEffect(()=>{ler();const f=()=>{setOnline(navigator.onLine);if(navigator.onLine)setErro('');ler();};window.addEventListener(evento,f);window.addEventListener('storage',f);window.addEventListener('online',f);window.addEventListener('offline',f);return()=>{window.removeEventListener(evento,f);window.removeEventListener('storage',f);window.removeEventListener('online',f);window.removeEventListener('offline',f);};},[id]);
 const enviar=async()=>{
  if(!navigator.onLine)return;
  try{await exclusao(`envio:${id}`,async()=>{
   const r=await exclusao(id,()=>lerPontoLocal(id));
   await enviarFilaPonto(r,b=>ponto('bater_offline',{...b,usuario_id:id}),d=>exclusao(id,()=>{
    const atual=lerPontoLocal(id),confirmados=new Set(r.fila.filter(b=>!d.fila.some(x=>x.pedido===b.pedido)).map(b=>b.pedido));
    salvar(id,{...atual,estado:d.estado,fila:atual.fila.filter(b=>!confirmados.has(b.pedido))});
   }));
   const estado=await ponto('estado',{usuario_id:id});await exclusao(id,()=>salvar(id,{...lerPontoLocal(id),estado}));
  });setErro('');window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:'ponto'}}));}
  catch(e){setErro(e.message);window.dispatchEvent(new CustomEvent('integracao:ponto-erro',{detail:{id,erro:e.message}}));}
 };
 useEffect(()=>{const erroRecebido=e=>{if(e.detail.id===id)setErro(e.detail.erro);};window.addEventListener('integracao:ponto-erro',erroRecebido);return()=>window.removeEventListener('integracao:ponto-erro',erroRecebido);},[id]);
 useEffect(()=>{if(!sincronizar)return;let ativo=true,rodando=false;
  const tentar=async()=>{if(!ativo||rodando||!navigator.onLine)return;rodando=true;await enviar();rodando=false;};
  const mudanca=e=>{if(!e.detail?.modulo||e.detail.modulo==='ponto')tentar();};
  tentar();const timer=setInterval(tentar,30000);window.addEventListener('online',tentar);window.addEventListener('focus',tentar);window.addEventListener(evento,tentar);window.addEventListener('integracao:atualizacao',mudanca);
  return()=>{ativo=false;clearInterval(timer);window.removeEventListener('online',tentar);window.removeEventListener('focus',tentar);window.removeEventListener(evento,tentar);window.removeEventListener('integracao:atualizacao',mudanca);};
 },[id,sincronizar]);
 const bater=async()=>{const agora=new Date().toISOString(),offline=!navigator.onLine;setOcupado(true);setErro('');try{await exclusao(id,()=>salvar(id,enfileirarPonto(lerPontoLocal(id),{agora,offline})));}catch(e){setErro(e.message);}finally{setOcupado(false);}};
 return {dados,erro,ocupado,online,bater,enviar,...visaoPontoLocal(dados)};
}
export function SincronizadorPonto({usuario}){usePontoLocal(usuario,{sincronizar:true});return null;}

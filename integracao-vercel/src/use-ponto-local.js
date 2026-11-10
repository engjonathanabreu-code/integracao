import {useEffect,useState,useRef} from 'react';
import {ponto,idPonto} from './ponto-api.js';
import {lerPontoLocal,gravarPontoLocal,enfileirarPonto,visaoPontoLocal} from './ponto-local.js';
import {capturarSessao} from './dados-compartilhados.js';
import {sincronizarPonto} from './sincronizacao-ponto.js';
const evento='integracao:ponto-local';
const exclusao=(id,fn)=>navigator.locks?navigator.locks.request(`ponto:${id}`,fn):Promise.reject(Error('Atualize o navegador para registrar o ponto com segurança neste aparelho.'));
function salvar(id,r){gravarPontoLocal(id,r);window.dispatchEvent(new Event(evento));}
export function usePontoLocal(usuario,{sincronizar=false}={}){
 const id=idPonto(usuario),[dados,setDados]=useState({conta:id,estado:null,fila:[]}),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[online,setOnline]=useState(navigator.onLine);
 const ler=()=>{try{setDados({...lerPontoLocal(id),conta:id});}catch(e){setErro(e.message);}};
 useEffect(()=>{ler();const f=()=>{setOnline(navigator.onLine);if(navigator.onLine)setErro('');ler();};window.addEventListener(evento,f);window.addEventListener('storage',f);window.addEventListener('online',f);window.addEventListener('offline',f);return()=>{window.removeEventListener(evento,f);window.removeEventListener('storage',f);window.removeEventListener('online',f);window.removeEventListener('offline',f);};},[id]);
 const contexto=useRef(null);
 if(contexto.current?.id!==id)contexto.current={id,ativo:true};
 useEffect(()=>{const c=contexto.current;c.ativo=true;return()=>{c.ativo=false;};},[id]);
 const enviar=async(manual=true,inicial=false)=>{
  if(!navigator.onLine)return;
  const c=contexto.current,scope=capturarSessao();
  const conferir=()=>{scope.conferir();if(!c.ativo||contexto.current!==c)throw Object.assign(Error('A sessão mudou.'),{code:'SESSAO_ALTERADA'});};
  try{
   if(!navigator.locks)throw Error('Atualize o navegador para sincronizar o ponto com segurança.');
   const atualizado=await navigator.locks.request(`ponto:envio:${id}`,{ifAvailable:true},async lock=>{
    if(!lock)return;
    return sincronizarPonto({manual,inicial,visivel:document.visibilityState!=='hidden',conferir,
     ler:()=>exclusao(id,()=>{conferir();return lerPontoLocal(id);}),
     salvar:transformar=>exclusao(id,()=>{conferir();salvar(id,transformar(lerPontoLocal(id)));}),
     chamar:(acao,dados)=>{conferir();return ponto(acao,{...dados,usuario_id:id});}});
   });conferir();if(atualizado){setErro('');window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:'ponto',origem:'ponto-local'}}));}
  }catch(e){if(e.code==='SESSAO_ALTERADA'||!c.ativo||contexto.current!==c)return;setErro(e.message);window.dispatchEvent(new CustomEvent('integracao:ponto-erro',{detail:{id,erro:e.message}}));}
 };
 useEffect(()=>{const erroRecebido=e=>{if(e.detail.id===id)setErro(e.detail.erro);};window.addEventListener('integracao:ponto-erro',erroRecebido);return()=>window.removeEventListener('integracao:ponto-erro',erroRecebido);},[id]);
 useEffect(()=>{if(!sincronizar)return;let ativo=true,rodando=false;
  const tentar=async(inicial=false)=>{if(!ativo||rodando||!navigator.onLine)return;rodando=true;try{await enviar(false,inicial===true);}finally{rodando=false;}};
  const mudanca=e=>{if(e.detail?.origem==='ponto-local')return;if(!e.detail?.modulo||e.detail.modulo==='ponto')tentar();};
  tentar(true);const timer=setInterval(tentar,30000);window.addEventListener('online',tentar);window.addEventListener('focus',tentar);document.addEventListener('visibilitychange',tentar);window.addEventListener(evento,tentar);window.addEventListener('integracao:atualizacao',mudanca);
  return()=>{ativo=false;clearInterval(timer);window.removeEventListener('online',tentar);window.removeEventListener('focus',tentar);document.removeEventListener('visibilitychange',tentar);window.removeEventListener(evento,tentar);window.removeEventListener('integracao:atualizacao',mudanca);};
 },[id,sincronizar]);
 const bater=async()=>{const c=contexto.current,scope=capturarSessao();const atual=()=>c.ativo&&contexto.current===c;const agora=new Date().toISOString(),offline=!navigator.onLine;setOcupado(true);setErro('');try{await exclusao(id,()=>{if(scope.owner)scope.conferir();if(!atual())return;salvar(id,enfileirarPonto(lerPontoLocal(id),{agora,offline}));});}catch(e){if(atual())setErro(e.message);}finally{if(atual())setOcupado(false);}};
 const dadosAtuais=dados.conta===id?dados:{estado:null,fila:[]};
 return {dados:dadosAtuais,erro:dados.conta===id?erro:'',ocupado:dados.conta===id&&ocupado,online,bater,enviar,...visaoPontoLocal(dadosAtuais)};
}
export function SincronizadorPonto({usuario}){usePontoLocal(usuario,{sincronizar:true});return null;}

import {useEffect,useRef,useState} from 'react';
import {criarExecutorSuporte,atualizarSuporteComSeguranca} from './suporte-remoto-executor.js';
import {SUPORTE_REMOTO_HABILITADO} from './suporte-remoto-api.js';

export function IndicacaoSuporteRemoto(){
 return <aside role="note" aria-label="Suporte de sincronização" style={{padding:'6px 18px',fontSize:12}}>
  Suporte de sincronização: solicitações de Jonathan podem ser recebidas neste aplicativo. As ações são registradas e não acessam sua tela. Tentativas seguras não interrompem seu trabalho.
 </aside>;
}

export default function SuporteRemotoExecutor({usuario,sync}){
 const atual=useRef();atual.current={usuario,sync};
 const [aviso,setAviso]=useState(null),[ocupado,setOcupado]=useState(false);
 const owner=usuario?.erpRef;
 useEffect(()=>{
  setAviso(null);setOcupado(false);
  if(!SUPORTE_REMOTO_HABILITADO||!owner)return;
  const executor=criarExecutorSuporte({usuario:owner,sync:()=>atual.current.sync,ativo:()=>atual.current.usuario?.erpRef===owner,
   onAtualizacao:()=>{if(atual.current.usuario?.erpRef===owner)setAviso({owner,erro:false});}});
  const passo=()=>{executor.passo().catch(()=>{});};
  passo();const timer=setInterval(passo,30000);
  globalThis.window?.addEventListener('online',passo);globalThis.document?.addEventListener('visibilitychange',passo);
  return()=>{executor.fechar();clearInterval(timer);globalThis.window?.removeEventListener('online',passo);globalThis.document?.removeEventListener('visibilitychange',passo);};
 },[owner]);
 if(!SUPORTE_REMOTO_HABILITADO||!owner)return null;
 const atualizar=async()=>{
  if(ocupado)return;setOcupado(true);
  try{
   const ok=await atualizarSuporteComSeguranca({owner,sync:atual.current.sync});
   if(atual.current.usuario?.erpRef===owner&&!ok)setAviso({owner,erro:true});
  }catch{if(atual.current.usuario?.erpRef===owner)setAviso({owner,erro:true});}
  finally{setOcupado(false);}
 };
 return <><IndicacaoSuporteRemoto/>{aviso?.owner===owner&&<div role="status" style={{padding:'8px 18px'}}>
  <p>O suporte solicitou uma atualização do Integração. A tela será mantida enquanto houver edição, envio ou pendência sem recuperação confirmada.</p>
  {aviso.erro&&<p>Não foi possível confirmar um ponto seguro para atualizar. Termine as edições, confira as pendências e abra uma tela sem campos de edição antes de tentar novamente.</p>}
  <button className="btn btn-sm" disabled={ocupado} onClick={atualizar}>{ocupado?'Verificando…':'Verificar e atualizar'}</button>
  <button className="btn btn-sm" disabled={ocupado} onClick={()=>setAviso(null)}>Agora não</button>
 </div>}</>;
}

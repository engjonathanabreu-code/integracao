import {useEffect,useRef,useState} from 'react';
import {diaCivilEvento} from './calendario-ocorrencias.js';
import {avisosMetasVencidas,registrarAvisosMetasVencidas,INICIO_AVISOS_METAS_VENCIDAS} from './metas-uso.js';

// USO-M2 — percebe metas vencidas com a base já carregada do servidor e grava
// os avisos pelo `mutar` normal (sem entrada de auditoria: não é ação de pessoa).
// Cada aviso é tentado no máximo uma vez por sessão neste aparelho; se a
// gravação for recusada, não há nova tentativa em laço.
export function useAvisosMetasVencidas({db,usuario,mutar,pronto}){
 const demonstracao=import.meta.env?.VITE_DEMO==="1"||import.meta.env?.DEMO==="1";
 const tentados=useRef(new Set());
 const [dia,setDia]=useState(()=>diaCivilEvento(new Date()));
 useEffect(()=>{const t=setInterval(()=>setDia(diaCivilEvento(new Date())),15*60000);return()=>clearInterval(t);},[]);
 const metas=db?.metas,notificacoes=db?.notificacoes,conta=usuario?.id;
 useEffect(()=>{
  if(!pronto||!db||!usuario)return;
  const avisos=avisosMetasVencidas(db,usuario,dia,{prazoMinimo:demonstracao?undefined:INICIO_AVISOS_METAS_VENCIDAS}).filter(a=>!tentados.current.has(`${conta}|${a.id}`));
  if(!avisos.length)return;
  for(const a of avisos)tentados.current.add(`${conta}|${a.id}`);
  try{mutar(d=>registrarAvisosMetasVencidas(d,avisos));}
  catch{/* base ainda carregando: o aviso volta a ser avaliado na próxima sessão */}
 },[metas,notificacoes,conta,dia,pronto]); // eslint-disable-line
}

import {useEffect,useRef,useState} from 'react';
import {requisicao} from './dados-compartilhados.js';
import {resumoDiagnostico,instalacaoDiagnostico,coberturaDispositivos} from './diagnostico-sincronizacao.js';
const habilitado=import.meta.env.VITE_DIAGNOSTICO_SINCRONIZACAO==='1';
export default function DiagnosticoSincronizacao({sync,usuario,usuarios}){
 const atual=useRef();atual.current={sync,usuario};
 const [agora,setAgora]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setAgora(Date.now()),60000);return()=>clearInterval(t);},[]);
 const [relatos,setRelatos]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false);
 useEffect(()=>{
  setRelatos(null);setErro('');setOcupado(false);
  if(!habilitado)return;
  let ativo=true,enviando=false;
  const enviar=async()=>{
   const {sync:s,usuario:u}=atual.current;
   if(!ativo||enviando||!s.diagnosticoPronto()||!u.erpRef||globalThis.navigator?.onLine===false)return;
   enviando=true;
   try{await requisicao('integracao_sincronizacao_dispositivos?on_conflict=usuario_id,instalacao_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({usuario_id:u.erpRef,instalacao_id:instalacaoDiagnostico(),versao:import.meta.env.VITE_BUILD_ID||'sync-recovery-v1',resumo:resumoDiagnostico(s.pendencias||[])})});if(ativo)setErro('');}
   catch{if(ativo)setErro('Diagnóstico indisponível. Isso não informa o estado das filas de outros aparelhos.');}
   finally{enviando=false;}
  };
  enviar();const timer=setInterval(enviar,120000);return()=>{ativo=false;clearInterval(timer);};
 },[usuario.erpRef]);
 if(!habilitado||usuario.setor!=='diretoria')return null;
 const consultar=async()=>{const conta=usuario.erpRef;setOcupado(true);try{
  const rows=[];for(let offset=0;;offset+=500){const page=await requisicao(`integracao_sincronizacao_dispositivos?select=usuario_id,instalacao_id,versao,resumo,ultimo_contato&order=usuario_id,instalacao_id&limit=500&offset=${offset}`);if(atual.current.usuario.erpRef!==conta)return;rows.push(...page);if(page.length<500)break;}
  setRelatos(rows);setErro('');
 }catch{if(atual.current.usuario.erpRef===conta){setErro('Não foi possível consultar os relatos. Os estados continuam desconhecidos.');setRelatos(null);}}finally{if(atual.current.usuario.erpRef===conta)setOcupado(false);}};
 return <details style={{padding:'8px 18px'}}><summary>Diagnóstico dos dispositivos</summary><p>Relatos incluem somente versão, último contato e contagens por módulo e código de erro. Não acessam arquivos nem controlam aparelhos. Computadores ainda não registrados permanecem desconhecidos.</p>
  <button className="btn btn-sm" disabled={ocupado} onClick={consultar}>{ocupado?'Consultando…':'Consultar relatos'}</button>{erro&&<p role="status">{erro}</p>}
  {relatos&&<ul>{coberturaDispositivos(usuarios,relatos,agora).map((r,n)=><li key={r.instalacao_id||n}>{r.nome} · {r.instalacao_id?.slice(0,8)||'sem relato'} · {r.estado==='desconhecido'?'Estado desconhecido':'Relato recente'}{r.ultimo_contato&&<> · último contato {new Date(r.ultimo_contato).toLocaleString()} · versão {r.versao} · pendências no último relato: {r.resumo.reduce((n,x)=>n+x.quantidade,0)}<details><summary>Ver contagens</summary><ul>{r.resumo.map((g,i)=><li key={i}>{g.modulo} · {g.estado} · {g.codigo}: {g.quantidade}</li>)}</ul></details></>}</li>)}</ul>}
 </details>;
}

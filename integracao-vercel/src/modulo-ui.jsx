import {temEdicaoEmAndamento} from './protecao-edicao.js';
import {useEffect,useState,useRef} from 'react';
export function useModulo(carregar, dependencias=[], modulos=[]) {
  const [dados,setDados]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[versao,setVersao]=useState(0);
  const alvo=JSON.stringify(dependencias),anterior=useRef(null),executando=useRef(false),automatico=useRef(false),adiar=useRef(null);
  useEffect(()=>{let ativo=true;const background=automatico.current;automatico.current=false;if(anterior.current!==alvo){setDados(null);anterior.current=alvo;}setErro('');carregar().then(d=>{if(!ativo)return;if(background&&temEdicaoEmAndamento()){adiar.current?.();return;}setDados(d);}).catch(e=>{if(ativo)setErro(e.message);});return()=>{ativo=false;};},[...dependencias,versao]); // callers supply loader dependencies
  const canais=modulos.join(',');
  useEffect(()=>{if(!canais)return;let timer,pendente=false;
    const tentar=()=>{if(!pendente)return;if(executando.current||document.visibilityState==='hidden'||temEdicaoEmAndamento()){timer=setTimeout(tentar,1000);return;}pendente=false;automatico.current=true;setVersao(v=>v+1);};
    const receber=e=>{if(e.detail?.modulo&&!canais.split(',').includes(e.detail.modulo))return;pendente=true;clearTimeout(timer);timer=setTimeout(tentar,400);};
    adiar.current=()=>receber({detail:{}});window.addEventListener('integracao:atualizacao',receber);return()=>{adiar.current=null;clearTimeout(timer);window.removeEventListener('integracao:atualizacao',receber);};
  },[canais]);
  const executar=async fn=>{if(executando.current)return;executando.current=true;setOcupado(true);setErro('');try{await fn();setVersao(v=>v+1);return true;}catch(e){setErro(e.message);return false;}finally{executando.current=false;setOcupado(false);}};
  return {dados,erro,ocupado,executar,atualizar:()=>setVersao(v=>v+1)};
}
export function EstadoModulo({modulo}) {return <>{modulo.erro&&<div role="alert" className="crm-erro">{modulo.erro}<button className="btn btn-sm" onClick={modulo.atualizar}>Tentar novamente</button></div>}{!modulo.dados&&!modulo.erro&&<p role="status">Carregando…</p>}</>;}
export function CampoCRM({nome,children}) {return <label>{nome}{children}</label>;}

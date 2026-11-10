import {temEdicaoEmAndamento} from './protecao-edicao.js';
import RevisaoConcorrencia from './RevisaoConcorrencia.jsx';
import {useEffect,useState,useRef} from 'react';
export function useModulo(carregar, dependencias=[], modulos=[]) {
  const [dados,setDados]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[versao,setVersao]=useState(0);
  const [revisao,setRevisao]=useState(null);
  const alvo=JSON.stringify(dependencias),contexto=useRef(null);
  if(contexto.current?.alvo!==alvo)contexto.current={alvo,ativo:true,executando:false};
  useEffect(()=>{const c=contexto.current;c.ativo=true;return()=>{c.ativo=false;};},[alvo]);
  const anterior=useRef(null),executando=useRef(false),automatico=useRef(false),adiar=useRef(null),fila=useRef(Promise.resolve()),carregando=useRef(false);
  useEffect(()=>{executando.current=false;setOcupado(false);setRevisao(null);},[alvo]);
  useEffect(()=>{let ativo=true;const background=automatico.current;automatico.current=false;if(anterior.current!==alvo){setDados(null);anterior.current=alvo;}setErro('');fila.current=fila.current.catch(()=>{}).then(async()=>{if(!ativo)return;carregando.current=true;try{return await carregar();}finally{carregando.current=false;}}).then(d=>{if(!ativo)return;if(background&&temEdicaoEmAndamento()){adiar.current?.();return;}setDados(d);}).catch(e=>{if(ativo)setErro(e.message);});return()=>{ativo=false;};},[...dependencias,versao]); // callers supply loader dependencies
  const canais=modulos.join(',');
  useEffect(()=>{if(!canais)return;let timer,pendente=false;
    const tentar=()=>{if(!pendente)return;if(carregando.current||executando.current||document.visibilityState==='hidden'||temEdicaoEmAndamento()){timer=setTimeout(tentar,1000);return;}pendente=false;automatico.current=true;setVersao(v=>v+1);};
    const receber=e=>{if(e.detail?.modulo&&!canais.split(',').includes(e.detail.modulo))return;pendente=true;clearTimeout(timer);timer=setTimeout(tentar,400);};
    adiar.current=()=>receber({detail:{}});window.addEventListener('integracao:atualizacao',receber);return()=>{adiar.current=null;clearTimeout(timer);window.removeEventListener('integracao:atualizacao',receber);};
  },[canais]);
  const executar=async(fn,aoConcluir)=>{const c=contexto.current;if(c.executando)return;c.executando=true;executando.current=true;setOcupado(true);setErro('');const atual=()=>c.ativo&&contexto.current===c;try{const resultado=await fn();if(!atual())return false;aoConcluir?.(resultado);setRevisao(null);setVersao(v=>v+1);return true;}catch(e){if(!atual())return false;e.aoConcluir=aoConcluir;setRevisao(e.conflitos?e:null);setErro(e.message);return false;}finally{c.executando=false;if(atual()){executando.current=false;setOcupado(false);}}};
  return {dados:anterior.current===alvo?dados:null,erro,ocupado,revisao,resolverConflitos:escolhas=>executar(()=>revisao.resolver(escolhas),revisao.aoConcluir),executar,atualizar:()=>setVersao(v=>v+1)};
}
export function EstadoModulo({modulo}) {return <>{modulo.erro&&<div role="alert" className="crm-erro">{modulo.erro}<button className="btn btn-sm" onClick={modulo.atualizar}>Tentar novamente</button></div>}{modulo.revisao&&<RevisaoConcorrencia conflitos={modulo.revisao.conflitos} resolver={modulo.resolverConflitos}/>} {!modulo.dados&&!modulo.erro&&<p role="status">Carregando…</p>}</>;}
export function CampoCRM({nome,children}) {return <label>{nome}{children}</label>;}

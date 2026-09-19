import {useEffect,useState} from 'react';
export function useModulo(carregar, dependencias=[]) {
  const [dados,setDados]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[versao,setVersao]=useState(0);
  useEffect(()=>{let ativo=true;setDados(null);setErro('');carregar().then(d=>{if(ativo)setDados(d);}).catch(e=>{if(ativo)setErro(e.message);});return()=>{ativo=false;};},[...dependencias,versao]); // callers supply loader dependencies
  const executar=async fn=>{if(ocupado)return;setOcupado(true);setErro('');try{await fn();setVersao(v=>v+1);return true;}catch(e){setErro(e.message);return false;}finally{setOcupado(false);}};
  return {dados,erro,ocupado,executar,atualizar:()=>setVersao(v=>v+1)};
}
export function EstadoModulo({modulo}) {return <>{modulo.erro&&<div role="alert" className="crm-erro">{modulo.erro}<button className="btn btn-sm" onClick={modulo.atualizar}>Tentar novamente</button></div>}{!modulo.dados&&!modulo.erro&&<p role="status">Carregando…</p>}</>;}
export function CampoCRM({nome,children}) {return <label>{nome}{children}</label>;}

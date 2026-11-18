import {useEffect,useState} from 'react';
import {requisicao,capturarSessao} from './dados-compartilhados.js';
export function useViagensCalendario(usuarioId){
  const [estado,setEstado]=useState({usuarioId,rows:[],erro:'',carregando:true});
  useEffect(()=>{
    let ativo=true,ocupado=false;
    const atualizar=async()=>{
      if(ocupado)return;ocupado=true;
      try{
        const scope=capturarSessao(),rows=[];
        for(let offset=0;;offset+=500){
          const page=await requisicao(`rpc/integracao_viagens_financeiro?order=solicitacao_id&limit=500&offset=${offset}`,{method:'POST',body:'{}'});
          scope.conferir();if(!ativo)return;
          if(!Array.isArray(page))throw new Error('Resposta inválida');
          rows.push(...page);if(page.length<500)break;
        }
        if(ativo)setEstado({usuarioId,rows,erro:'',carregando:false});
      }catch{if(ativo)setEstado({usuarioId,rows:[],erro:'Não foi possível atualizar as viagens do Financeiro. Não considere a agenda de veículos completa.',carregando:false});}
      finally{ocupado=false;}
    };
    atualizar();const timer=setInterval(atualizar,60000);
    const visivel=()=>{if(document.visibilityState==='visible')atualizar();};
    window.addEventListener('focus',atualizar);window.addEventListener('online',atualizar);document.addEventListener('visibilitychange',visivel);
    return()=>{ativo=false;clearInterval(timer);window.removeEventListener('focus',atualizar);window.removeEventListener('online',atualizar);document.removeEventListener('visibilitychange',visivel);};
  },[usuarioId]);
  return estado.usuarioId===usuarioId?estado:{rows:[],erro:'',carregando:true};
}

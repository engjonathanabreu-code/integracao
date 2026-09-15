import {useEffect,useRef,useState} from 'react';
export function useCardCalendario(visao,periodo,evento,novoEm) {
  const [aberto,setAberto]=useState(false),ref=useRef(null);
  useEffect(()=>{setAberto(false);},[visao,periodo,evento,novoEm]);
  useEffect(()=>{
    if(!aberto)return;
    const fora=e=>{if(!ref.current?.contains(e.target))setAberto(false);};
    const tecla=e=>{if(e.key==='Escape')setAberto(false);};
    document.addEventListener('pointerdown',fora);
    document.addEventListener('keydown',tecla);
    return()=>{document.removeEventListener('pointerdown',fora);document.removeEventListener('keydown',tecla);};
  },[aberto]);
  return {aberto,ref,abrir:()=>setAberto(true),fechar:()=>setAberto(false)};
}

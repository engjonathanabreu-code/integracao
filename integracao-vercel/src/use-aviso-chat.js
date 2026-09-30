import {useEffect,useRef,useState} from 'react';
import {mensagensNovasChat} from './aviso-chat.js';
export function useAvisoChat({db,usuario}){
 const [aviso,setAviso]=useState(null),vistas=useRef(null),pessoa=useRef(null);
 useEffect(()=>{
  if(!usuario){vistas.current=null;pessoa.current=null;setAviso(null);return;}
  if(!db)return;
  if(pessoa.current!==usuario.id){pessoa.current=usuario.id;vistas.current=null;setAviso(null);}
  const r=mensagensNovasChat(db,usuario,vistas.current);vistas.current=r.ids;
  if(r.novas.length)setAviso(r.novas.at(-1));
 },[db,usuario?.id]);
 return [aviso,setAviso];
}

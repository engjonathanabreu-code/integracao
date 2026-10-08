import {useState,useEffect} from 'react';
import {loadMailingCounts} from './mailing-api.js';
export function useMailingCount(usuario){const [count,setCount]=useState(0);useEffect(()=>{let live=true;setCount(0);if(!usuario?.erpRef)return;const refresh=()=>loadMailingCounts().then(r=>{if(live)setCount(Object.values(r).reduce((n,data)=>n+data.unread,0));}).catch(()=>{});refresh();const t=setInterval(refresh,30000);window.addEventListener('mailing-updated',refresh);return()=>{live=false;clearInterval(t);window.removeEventListener('mailing-updated',refresh);}},[usuario?.erpRef]);return count;}

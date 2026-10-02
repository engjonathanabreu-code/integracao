import {useEffect} from 'react';
// O chat pode ser arrastado: reposiciona o agente conforme a área ocupada.
export function usePosicaoAgente(){useEffect(()=>{
 let frame;const ajustar=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
 const botao=document.querySelector('.ap-float'),painel=document.querySelector('.ap-popup');if(!botao)return;
 const chats=[...document.querySelectorAll('.janela-chat')].map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);
 const W=innerWidth,H=innerHeight,m=16,base=92;
 const colide=(x,y,w,h)=>chats.some(r=>x<r.right+m&&x+w>r.left-m&&y<r.bottom+m&&y+h>r.top-m);
 const posicionar=(el,w,h,bottom)=>{const candidatos=[{x:W-w-m,y:H-bottom-h},...chats.map(r=>({x:W-w-m,y:r.top-h-m})),...chats.map(r=>({x:r.left-w-m,y:H-bottom-h})),{x:W>900?282:m,y:H-bottom-h},{x:W-w-m,y:80}];const pos=candidatos.find(p=>p.x>=m&&p.x+w<=W-m&&p.y>=72&&p.y+h<=H-m&&!colide(p.x,p.y,w,h));if(pos){el.style.left=pos.x+'px';el.style.right='auto';el.style.bottom=(H-pos.y-h)+'px';return true}return false};
 if(!botao.dataset.posicaoManual)posicionar(botao,botao.offsetWidth,botao.offsetHeight,base);
 if(painel){chats.push(botao.getBoundingClientRect());painel.style.maxHeight='calc(100dvh - 180px)';const w=painel.offsetWidth,h=painel.offsetHeight;if(!posicionar(painel,w,h,156)&&chats.length){const topo=Math.min(...chats.map(r=>r.top));const espaco=Math.max(64,topo-88);painel.style.maxHeight=espaco+'px';posicionar(painel,w,Math.min(h,espaco),H-topo+16);}}
 });};const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.target.classList?.contains('janela-chat')))ajustar()});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});window.addEventListener('resize',ajustar);ajustar();return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',ajustar)};
 },[])}

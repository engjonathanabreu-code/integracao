import {useEffect} from 'react';
export function useBalaoArrastavel(usuarioId){useEffect(()=>{
 const el=document.querySelector('.ap-float');if(!el)return;const key='integracao-balao-ia-'+usuarioId;let drag=null,moved=false;
 const mover=(x,y)=>{el.dataset.posicaoManual='true';el.style.left=Math.max(8,Math.min(x,innerWidth-el.offsetWidth-8))+'px';el.style.top=Math.max(8,Math.min(y,innerHeight-el.offsetHeight-8))+'px';el.style.right='auto';el.style.bottom='auto';};
 try{const pos=JSON.parse(localStorage.getItem(key));if(pos)mover(pos.x,pos.y)}catch{}
 const down=e=>{if(e.button!==0)return;const r=el.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};moved=false;el.setPointerCapture(e.pointerId)};
 const move=e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)moved=true;if(moved){e.preventDefault();mover(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y)}};
 const up=()=>{if(drag&&moved){const r=el.getBoundingClientRect();localStorage.setItem(key,JSON.stringify({x:r.left,y:r.top}));window.dispatchEvent(new Event('resize'))}drag=null};
 const click=e=>{if(moved){e.preventDefault();e.stopImmediatePropagation();moved=false}};
 const resize=()=>{if(el.dataset.posicaoManual){const r=el.getBoundingClientRect();mover(r.left,r.top)}};
 el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('click',click,true);window.addEventListener('resize',resize);
 return()=>{el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.removeEventListener('click',click,true);window.removeEventListener('resize',resize)};
 },[usuarioId])}

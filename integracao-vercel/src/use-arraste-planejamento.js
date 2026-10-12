import {useEffect,useRef} from 'react';
// HTML5 keeps desktop dragging. Touch/pen uses the same existing move operation.
export function useArrastePlanejamento(quadro,mover){
 const toque=useRef(null),frame=useRef(null),acao=useRef(mover);useEffect(()=>{acao.current=mover;},[mover]);
 const limpar=()=>{if(frame.current)cancelAnimationFrame(frame.current);frame.current=null;const t=toque.current;if(t){t.handle.classList.remove('pm-arrastando');if(t.handle.hasPointerCapture?.(t.pointerId))t.handle.releasePointerCapture(t.pointerId);}toque.current=null;};
 useEffect(()=>limpar,[]);
 const destino=()=>{const t=toque.current;if(!t)return null;const el=document.elementFromPoint(t.x,t.y),week=el?.closest('.pm-semana');if(!week||!quadro.current?.contains(week))return null;const card=el.closest('[data-meta]');if(card?.dataset.meta===t.id)return null;return {semana:week.dataset.semana,antes:card?.dataset.meta||null};};
 const atualizar=()=>{const t=toque.current,el=quadro.current;if(!t?.ativo||!el)return;const r=el.getBoundingClientRect();if(t.x>r.right-36)el.scrollLeft+=10;else if(t.x<r.left+36)el.scrollLeft-=10;frame.current=requestAnimationFrame(atualizar);};
 return {ativo:()=>!!toque.current,props:id=>({
  onPointerDown:e=>{if(e.pointerType==='mouse'||!e.isPrimary||toque.current)return;toque.current={id,pointerId:e.pointerId,handle:e.currentTarget,x:e.clientX,y:e.clientY,inicioX:e.clientX,inicioY:e.clientY,ativo:false};e.currentTarget.setPointerCapture(e.pointerId);},
  onPointerMove:e=>{const t=toque.current;if(!t||t.pointerId!==e.pointerId)return;t.x=e.clientX;t.y=e.clientY;if(!t.ativo&&Math.hypot(t.x-t.inicioX,t.y-t.inicioY)>8){t.ativo=true;t.handle.classList.add('pm-arrastando');frame.current=requestAnimationFrame(atualizar);}if(t.ativo)e.preventDefault();},
  onPointerUp:e=>{const t=toque.current;if(!t||t.pointerId!==e.pointerId)return;const d=t.ativo?destino():null,id=t.id;limpar();if(d)acao.current(id,d.semana,d.antes);},
  onPointerCancel:e=>{if(toque.current?.pointerId===e.pointerId)limpar();}
 })};
}

import { segmentosMetas } from './calendario-periodos.js';
import { rotuloPrazo } from './calendario-prazos.js';
export default function FaixasMetas({ itens, dias, aoAbrir, recuo = false, noMes = false, limite = Infinity }) {
  const segmentos = segmentosMetas(itens, dias).slice(0, limite);
  if (!segmentos.length) return null;
  return <div aria-label="Períodos das metas" style={{ display:'grid', gridTemplateColumns:`${recuo ? '52px ' : ''}repeat(${dias.length},minmax(0,1fr))`, gap:'3px 4px', margin:noMes ? 0 : '4px 0', ...(noMes ? {position:'absolute', top:34, left:5, right:5, zIndex:2, pointerEvents:'none'} : {}) }}>
    {segmentos.map(({ item, coluna, largura }, linha) => <button key={item.id} title={rotuloPrazo(item)} onClick={() => aoAbrir(item)} style={{ gridColumn:`${coluna + (recuo ? 1 : 0)} / span ${largura}`, gridRow:linha + 1, minWidth:0, height:24, padding:'3px 8px', pointerEvents:'auto', fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'left', background:item.atrasada ? '#fff0ed' : '#e3f3f0', color:item.atrasada ? '#9b3427' : '#125e56', border:`1px solid ${item.atrasada ? '#efc0b6' : '#b7dbd3'}`, borderLeft:`3px solid ${item.atrasada ? '#bf4936' : '#278578'}`, borderRadius:5, cursor:'pointer' }}>{rotuloPrazo(item)}</button>)}
  </div>;
}

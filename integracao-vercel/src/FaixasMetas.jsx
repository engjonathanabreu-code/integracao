import { segmentosMetas } from './calendario-periodos.js';
import { rotuloPrazo } from './calendario-prazos.js';
export default function FaixasMetas({ itens, dias, aoAbrir, recuo = false }) {
  const segmentos = segmentosMetas(itens, dias);
  if (!segmentos.length) return null;
  return <div aria-label="Períodos das metas" style={{ display:'grid', gridTemplateColumns:`${recuo ? '52px ' : ''}repeat(${dias.length},minmax(0,1fr))`, gap:'3px 0', margin:'4px 0' }}>
    {segmentos.map(({ item, coluna, largura }, linha) => <button key={item.id} title={rotuloPrazo(item)} onClick={() => aoAbrir(item)} style={{ gridColumn:`${coluna + (recuo ? 1 : 0)} / span ${largura}`, gridRow:linha + 1, minWidth:0, height:24, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'left', background:item.cor, color:'white', border:item.atrasada ? '2px dashed #711f1f' : '1px solid transparent', borderRadius:3, cursor:'pointer' }}>{rotuloPrazo(item)}</button>)}
  </div>;
}

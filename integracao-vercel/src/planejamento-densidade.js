export const ZOOM_PADRAO=100;
export const limitarZoom=value=>Math.max(85,Math.min(120,Number.isFinite(Number(value))?Math.round(Number(value)/5)*5:ZOOM_PADRAO));
export const chaveDensidade=id=>'integracao:planejamento-densidade:v1:'+id;
export function armazenamentoDensidade(){try{return globalThis.localStorage;}catch{return null;}}
export function lerDensidade(storage,id){try{const v=JSON.parse(storage?.getItem(chaveDensidade(id))||'null');return {zoom:limitarZoom(v?.zoom??100),ajustar:v?.ajustar!==false};}catch{return {zoom:100,ajustar:true};}}
export function guardarDensidade(storage,id,pref){try{storage?.setItem(chaveDensidade(id),JSON.stringify({zoom:limitarZoom(pref.zoom),ajustar:pref.ajustar!==false}));}catch{/* Preferência visual: indisponibilidade do armazenamento não bloqueia o quadro. */}}

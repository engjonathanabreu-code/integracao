import {funilVazio} from './funil-institucional.js';
export const idComercial = usuario => usuario?.erpRef || String(usuario?.id || '').replace(/^erp_/,'');
export function apresentarFunis(participantes,registros,{consolidado=false}={}) {
 const total=funilVazio();
 for(const p of participantes){
  const dados=registros.find(r=>r.id===p.id)?.dados || funilVazio();
  const id=id=>consolidado?`${p.id}:${id}`:id;
  total.cidades.push(...dados.cidades.map(c=>({...c,id:id(c.id),responsavelId:p.id,responsavelNome:p.nome})));
  total.nucleos.push(...dados.nucleos.map(n=>({...n,nucleoId:id(n.nucleoId),...(n.cidadeId?{cidadeId:id(n.cidadeId)}:{}),...(consolidado&&n.municipioId?{municipioId:id(n.municipioId)}:{}),responsavelId:p.id,responsavelNome:p.nome})));
  if(consolidado)for(const c of total.cidades.filter(c=>c.responsavelId===p.id&&c.municipioId))c.municipioId=id(c.municipioId);
  total.historico.push(...dados.historico.map(h=>({...h,id:id(h.id),responsavelId:p.id,responsavelNome:p.nome})));
 }
 total.historico.sort((a,b)=>String(a.data).localeCompare(String(b.data))||String(a.id).localeCompare(String(b.id)));
 return total;
}
export function acaoDoFunil(acao) {
 const campos=acao.tipo==='cidade'?['tipo','id','nome','uf','etapa','municipioId','institucionalId']:['tipo','nucleoId','cidadeId','nome','carteira'];
 return Object.fromEntries(campos.filter(c=>Object.hasOwn(acao,c)).map(c=>[c,acao[c]]));
}

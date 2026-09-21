const camposUnidade=['vertices','area','perimetro','memorial'];
const camposArea=['vertices','area','perimetro','texto','nome','tipo'];
export function memorialDoDestino(db,nucleoId,alvo) {
 const n=db.nucleos.find(n=>n.id===nucleoId);
 if(alvo.tipo==='unidade')return db.processos.find(p=>p.id===alvo.moradorId&&p.nucleoId===nucleoId)?.unidades?.find(u=>u.id===alvo.unidadeId);
 return alvo.tipo==='nucleo'?n?.memorial:n?.memorial?.vias?.find(v=>v.id===alvo.viaId);
}
export function revogarMemorial(db,nucleoId,alvo,anterior,motivo,por) {
 const n=db.nucleos.find(n=>n.id===nucleoId),atual=memorialDoDestino(db,nucleoId,alvo);
 if(!n||!Number.isInteger(n.etapa)||n.etapa<1)throw new Error('Revogação disponível na etapa Topografia.');
 if(!motivo?.trim())throw new Error('Informe o motivo da revogação.');
 const campos=alvo.tipo==='unidade'?camposUnidade:camposArea;
 if(!atual||campos.some(k=>JSON.stringify(atual[k])!==JSON.stringify(anterior?.[k])))throw new Error('O memorial mudou. Reabra antes de revogar.');
 const registro={id:crypto.randomUUID(),alvo:structuredClone(alvo),memorial:structuredClone(atual),motivo:motivo.trim(),por,em:new Date().toISOString()};
 n.memoriaisRevogados=[...(n.memoriaisRevogados||[]),registro];
 if(alvo.tipo!=='unidade'&&alvo.tipo!=='nucleo')n.memorial.vias=n.memorial.vias.filter(v=>v.id!==alvo.viaId);
 else {atual.vertices=[];atual.area='';atual.perimetro='';atual[alvo.tipo==='unidade'?'memorial':'texto']='';}
 for(const f of n.levantamentoGeoJSON?.feicoes||[]) {
  const v=f.vinculo;if(!v)continue;
  const igual=alvo.tipo==='unidade'?v.tipo==='unidade'&&v.moradorId===alvo.moradorId&&v.unidadeId===alvo.unidadeId:alvo.tipo==='nucleo'?v.tipo==='nucleo':f.id===alvo.viaId;
  if(igual){f.historicoVinculos=[...(f.historicoVinculos||[]),{...v,revogadoEm:registro.em,motivo:registro.motivo,revogadoPor:por}];f.vinculo=null;}
 }
 return db;
}

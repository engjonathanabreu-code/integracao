import {conciliarEdicoes} from './concorrencia.js';
const copiar=v=>v===undefined?undefined:structuredClone(v);
const instante=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):0;
const camposTempo=['_atualizadoEm','updated_at','atualizadoEm','alteradoEm','validadoEm','concluido_em'];
function versao(raiz,caminho){
 const tempoDoRegistro=o=>o&&typeof o==='object'?Math.max(0,...camposTempo.map(k=>instante(o[k])),...(Array.isArray(o.historico)?o.historico:[]).map(h=>instante(h.data||h.created_at))):0;
 let atual=raiz,tempo=tempoDoRegistro(raiz);
 for(const parte of caminho){
  atual=Array.isArray(atual)?atual.find(x=>x?.id===parte):atual?.[parte];
  if(atual&&typeof atual==='object'&&!Array.isArray(atual)){
   const propria=tempoDoRegistro(atual);if(propria)tempo=propria;
  }
 }
 return tempo;
}
// Only divergent leaves choose a winner; compatible edits, lists and history are merged.
// Unknown/equal clocks use the freshly read server value, never the time of a retry.
export function conciliarMaisRecentes(base,local,remoto){
 const primeira=conciliarEdicoes(base,local,remoto),escolhas={};
 for(const c of primeira.conflitos){
  const temporal=camposTempo.includes(c.caminho.at(-1))||c.caminho.includes('lidaPor')||c.caminho.includes('ultimaLeitura');
  const l=temporal?instante(c.local):versao(local,c.caminho);
  const r=temporal?instante(c.remoto):versao(remoto,c.caminho);
  escolhas[c.chave]=l>r?'local':'remoto';
 }
 const resultado=conciliarEdicoes(base,local,remoto,escolhas);
 for(const meta of resultado.dados?.metas||[]){
  const atual=remoto.metas?.find(m=>m.id===meta.id);
  if(meta.status==='Concluído'&&atual?.status==='Concluído'&&!atual.solicitacaoConclusao)meta.solicitacaoConclusao=null;
 }
 return {...resultado,resolvidos:primeira.conflitos.map(c=>({...c,escolha:escolhas[c.chave]}))};
}
export function atualizarAutomaticamente(base,local,remoto){
 return {...conciliarMaisRecentes(base,local,remoto),baseline:copiar(remoto)};
}
// Recover missing rows only after a confirmed rejection. A stale partial cache must
// not become a batch of deletes. The original request is archived by the caller.
export function preservarRegistrosAusentes(base,local,remoto){
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remoto)&&[...base,...local,...remoto].every(x=>x&&typeof x.id==='string')){
  const ids=new Set(local.map(x=>x.id));
  return [...local.map(l=>preservarRegistrosAusentes(base.find(b=>b.id===l.id),l,remoto.find(r=>r.id===l.id))),...remoto.filter(r=>!ids.has(r.id)&&base.some(b=>b.id===r.id)).map(copiar)];
 }
 if(local&&typeof local==='object'&&!Array.isArray(local))return Object.fromEntries(Object.entries(local).map(([k,v])=>[k,preservarRegistrosAusentes(base?.[k],v,remoto?.[k])]));
 return copiar(local);
}

// A refused reservation must not block goals and clients in the same atomic batch.
// Keep its full content for recovery and retain the existing valid reservation.
export function separarReservasConflitantes(base,local,remoto){
 const preservadas=[];
 const eventos=(local.eventos||[]).filter(e=>{
  if((base.eventos||[]).some(b=>b.id===e.id)||!e.agendaId||e.status!=='ativo')return true;
  const conflito=(remoto.eventos||[]).find(r=>r.id!==e.id&&r.agendaId===e.agendaId&&r.status==='ativo'&&Date.parse(r.inicio)<Date.parse(e.fim)&&Date.parse(r.fim)>Date.parse(e.inicio));
  if(!conflito)return true;
  preservadas.push({evento:copiar(e),reservaMantidaId:conflito.id,motivo:'O ativo já possui reserva neste período.'});return false;
 });
 return {dados:{...local,eventos},preservadas};
}

import {classificarFalha} from './estado-sincronizacao.js';
// Rehydrate every written resident, including metadata-only edits outside a municipality route.
export function clientesDasIntencoes(edicoes){
 return [...new Map(edicoes.filter(e=>e.colecao==='processos'&&e.id).map(e=>[e.id,{...(e.antes?.existe?e.antes.valor:e.depois?.valor),id:e.id}])).values()];
}

export function fichasVisiveis(base,clientes){
 return new Set(clientes.filter(c=>(base.fin_receb_clientes||[]).some(r=>r.id===(c.financeiroRef||c.id))||(base.integracao_moradores||[]).some(r=>r.registro_id===c.id||(c.financeiroRef&&r.referencia_id===c.financeiroRef))).map(c=>c.id));
}

export function clientesDasOperacoes(operations,processos=[]) {
 const clientes=new Map();
 for(const op of operations) {
  if(op.remove)continue;
  const financeiro=op.table==='fin_receb_clientes';
  if(!financeiro&&!(op.table==='integracao_moradores'&&op.key?.colecao==='processos'))continue;
  const id=financeiro?op.key.id:op.key.registro_id;
  const cliente=processos.find(p=>p.id===id||(financeiro&&p.financeiroRef===id));
  clientes.set(id,cliente||{id,...(financeiro?{financeiroRef:id}:{})});
 }
 return [...clientes.values()];
}

export function clientesComEdicao(base,local){
 return (base.processos||[]).filter(p=>!p._resumo&&p._compartilhado&&JSON.stringify(p)!==JSON.stringify((local.processos||[]).find(x=>x.id===p.id)));
}

// Restore an unavailable file from its authorized cached baseline only. Older
// intentions may carry a legacy ID without the financial binding on the object.
function referenciasFicha(cliente,...bases){
 const refs=new Set([cliente.financeiroRef||cliente.id]);
 for(const base of bases){
  const linhas=[...(base?.integracao_moradores||[]),...(base?.integracao_complementos||[]).filter(r=>r._tabela==='integracao_moradores')];
  for(const r of linhas)if(r.registro_id===cliente.id&&r.referencia_tabela==='fin_receb_clientes'&&r.referencia_id)refs.add(r.referencia_id);
 }
 return refs;
}
export function preservarFichaAnterior(base,anterior,cliente){
 if(!anterior)return;
 const refs=referenciasFicha(cliente,anterior);
 const corresponde=r=>r.registro_id===cliente.id||refs.has(r.referencia_id);
 base.fin_receb_clientes=[...(base.fin_receb_clientes||[]).filter(r=>!refs.has(r.id)),...(anterior.fin_receb_clientes||[]).filter(r=>refs.has(r.id))];
 base.integracao_moradores=[...(base.integracao_moradores||[]).filter(r=>!corresponde(r)),...(anterior.integracao_moradores||[]).filter(corresponde)];
 base.integracao_complementos=[...(base.integracao_complementos||[]).filter(r=>r._tabela!=='integracao_moradores'||!corresponde(r)),...(anterior.integracao_complementos||[]).filter(r=>r._tabela==='integracao_moradores'&&corresponde(r))];
}

export async function atualizarFichas(base,clientes,lerFicha,{isolarFalhas=false,anterior=null}={}) {
 const falhas=new Map((base._falhasFichas||[]).map(f=>[f.id,f]));
 for(const cliente of clientes) {
  // An empty authorized result is not a failed write. HTTP/auth/network failures still throw.
  let carga;
  try{carga=await lerFicha(cliente,{permitirAusente:true});}
  catch(e){
   // Session changes invalidate the whole load. Ordinary per-file failures do
   // not authorize absence, writes or dependency release. Keep only cached rows.
   if(!isolarFalhas||e.code==='SESSAO_ALTERADA')throw e;
   preservarFichaAnterior(base,anterior,cliente);
   const {codigo,status,categoria}=classificarFalha(e);
   falhas.set(cliente.id,{id:cliente.id,codigo,status,categoria});base._falhasFichas=[...falhas.values()];continue;
  }
  falhas.delete(cliente.id);base._falhasFichas=[...falhas.values()];
  const ids=new Set([cliente.id,...carga.complementos.map(e=>e.registro_id)]);
  const refs=new Set([...referenciasFicha(cliente,base,anterior),...carga.clientes.map(c=>c.id),...carga.complementos.map(e=>e.referencia_id).filter(Boolean)]);
  const corresponde=e=>ids.has(e.registro_id)||refs.has(e.referencia_id);
  base.fin_receb_clientes=[...(base.fin_receb_clientes||[]).filter(c=>!refs.has(c.id)),...carga.clientes];
  base.integracao_moradores=[...(base.integracao_moradores||[]).filter(e=>!corresponde(e)),...carga.complementos];
  // projetar may have assembled this view from cached module rows.
  base.integracao_complementos=(base.integracao_complementos||[]).filter(e=>!(e._tabela==='integracao_moradores'&&corresponde(e)));
  if(carga.indisponivel)base._moradoresResumo=(base._moradoresResumo||[]).filter(p=>!ids.has(p.id)&&!refs.has(p.financeiroRef));
 }
 return base;
}

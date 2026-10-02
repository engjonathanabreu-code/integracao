// Rehydrate every written resident, including metadata-only edits outside a municipality route.
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

export async function atualizarFichas(base,clientes,lerFicha) {
 for(const cliente of clientes) {
  // An empty authorized result is not a failed write. HTTP/auth/network failures still throw.
  const carga=await lerFicha(cliente,{permitirAusente:true});
  const ids=new Set([cliente.id,...carga.complementos.map(e=>e.registro_id)]);
  const refs=new Set([cliente.financeiroRef||cliente.id,...carga.clientes.map(c=>c.id),...carga.complementos.map(e=>e.referencia_id).filter(Boolean)]);
  const corresponde=e=>ids.has(e.registro_id)||refs.has(e.referencia_id);
  base.fin_receb_clientes=[...(base.fin_receb_clientes||[]).filter(c=>!refs.has(c.id)),...carga.clientes];
  base.integracao_moradores=[...(base.integracao_moradores||[]).filter(e=>!corresponde(e)),...carga.complementos];
  // projetar may have assembled this view from cached module rows.
  base.integracao_complementos=(base.integracao_complementos||[]).filter(e=>!(e._tabela==='integracao_moradores'&&corresponde(e)));
  if(carga.indisponivel)base._moradoresResumo=(base._moradoresResumo||[]).filter(p=>!ids.has(p.id)&&!refs.has(p.financeiroRef));
 }
 return base;
}

export const COLUNAS_FINANCEIRAS=Object.freeze({valorTotal:'valor_global',entrada:'valor_entrada',parcelas:'numero_parcelas',valorParcela:'valor_parcela',diaVencimento:'dia_vencimento'});
export function codificarNumeroFinanceiro(campo,valor){
 const vazio=valor==null||(typeof valor==='string'&&!valor.trim());
 return ['parcelas','diaVencimento'].includes(campo)&&vazio?null:Number(typeof valor==='string'&&valor.includes(',')?valor.replace(/\./g,'').replace(',','.'):valor||0);
}
export const projetarNumeroFinanceiro=numero=>numero==null?'':String(numero).replace('.',',');
// Comparison copy only: never mutate a stored intention or an already sent payload.
// The fresh canonical binding, column and projection must all agree first.
export function ajustarComparacaoFinanceira(edicoes,state){
 return edicoes.map(original=>{
  if(original.colecao!=='processos'||!original.id||!original.antes?.existe||!original.depois?.existe)return original;
  const binding=state.bindings?.find(b=>!b.parent&&b.collection==='processos'&&b.id===original.id&&b.table==='fin_receb_clientes');
  const remoto=state.db.processos?.find(r=>r.id===original.id);
  if(!binding||!remoto||(remoto.financeiroRef||remoto.id)!==binding.row.id)return original;
  const e=structuredClone(original);
  for(const [campo,coluna] of Object.entries(COLUNAS_FINANCEIRAS)){
   if(binding.map?.[`comercial.${campo}`]?.column!==coluna)continue;
   const numero=binding.row[coluna],atual=remoto.comercial?.[campo];
   if(!(numero===null||typeof numero==='number'&&Number.isFinite(numero))||atual!==projetarNumeroFinanceiro(numero))continue;
   for(const lado of ['antes','depois']){
    const comercial=e[lado].valor?.comercial;
    if(!comercial||!Object.hasOwn(comercial,campo)||!['string','number'].includes(typeof comercial[campo]))continue;
    if(codificarNumeroFinanceiro(campo,comercial[campo])===numero)comercial[campo]=atual;
   }
  }
  return e;
 });
}

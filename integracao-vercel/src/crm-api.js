import {CAMPOS_NEGOCIACAO} from './crm-negociacao.js';
import {editarConciliado} from './edicao-conciliada.js';
import {requisicao,lerTabela} from './dados-compartilhados.js';
export const listarCRM = (tabela, filtro='') => lerTabela(tabela, '*', filtro);
export const criarCRM = (tabela, dados) => requisicao(tabela, {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(dados)});
export async function editarCRM(tabela, id, dados) {
  const rows=await requisicao(`${tabela}?id=eq.${encodeURIComponent(id)}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)});
  if(!rows?.length)throw new Error('Registro indisponível ou sem permissão. Atualize a tela.');
  return rows;
}
export async function excluirCRM(tabela,id){
  const rows=await requisicao(`${tabela}?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
  if(!rows?.length)throw new Error('Registro indisponível ou sem permissão. Atualize a tela.');
  return rows;
}
export const rpcCRM = (nome, dados) => requisicao(`rpc/${nome}`, {method:'POST',body:JSON.stringify(dados)});

export async function salvarNegociacaoCRM(id,dados,anterior){
 const campos=['status',...CAMPOS_NEGOCIACAO],selecionar=x=>Object.fromEntries(campos.map(k=>[k,x[k]??null]));
 return editarConciliado({anterior:selecionar(anterior),local:selecionar(dados),ler:async()=>{const r=(await lerTabela('integracao_crm_cards','*',`&id=eq.${encodeURIComponent(id)}`))[0];return r?selecionar(r):null;},gravar:async(novo,base)=>{
  const filtro=campos.map(k=>`${k}=${base[k]==null?'is.null':'eq.'+encodeURIComponent(base[k])}`).join('&');
  const rows=await requisicao(`integracao_crm_cards?id=eq.${encodeURIComponent(id)}&${filtro}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(novo)});
  if(!rows?.length){const e=new Error('A negociação mudou durante o salvamento.');e.code='PT409';throw e;}return rows;
 }});
}

export function salvarParcelaConciliada(parcela,dados){
 const numericos=new Set(['valor_previsto','juros','multa','valor_liquidado']);
 const selecionar=x=>Object.fromEntries(Object.keys(dados).map(k=>[k,numericos.has(k)?Number(x[k]??0):k==='linha_digitavel'?(x[k]||null):(x[k]??null)]));
 return editarConciliado({anterior:selecionar(parcela),local:selecionar(dados),ler:async()=>{const r=(await lerTabela('fin_receb_parcelas','*',`&id=eq.${encodeURIComponent(parcela.id)}`))[0];return r?selecionar(r):null;},gravar:(novo,base)=>rpcCRM('integracao_financeiro_editar_conciliado',{p_id:parcela.id,p_anterior:base,p_dados:novo})});
}
export function salvarInstitucionalConciliado(registro,dados){
 const selecionar=x=>Object.fromEntries(Object.keys(dados).map(k=>[k,k==='valor'?Number(x[k]):x[k]??null]));
 return editarConciliado({anterior:selecionar(registro),local:selecionar(dados),ler:async()=>{const r=(await lerTabela('integracao_crm_institucionais','*',`&id=eq.${encodeURIComponent(registro.id)}`))[0];return r?selecionar(r):null;},gravar:(novo,base)=>rpcCRM('integracao_crm_institucional_conciliado',{p_id:registro.id,p_anterior:base,p_dados:novo})});
}

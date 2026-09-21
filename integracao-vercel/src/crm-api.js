import {CAMPOS_NEGOCIACAO} from './crm-negociacao.js';
import {requisicao,lerTabela} from './dados-compartilhados.js';
export const listarCRM = (tabela, filtro='') => lerTabela(tabela, '*', filtro);
export const criarCRM = (tabela, dados) => requisicao(tabela, {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(dados)});
export async function editarCRM(tabela, id, dados) {
  const rows=await requisicao(`${tabela}?id=eq.${encodeURIComponent(id)}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)});
  if(!rows?.length)throw new Error('Registro indisponível ou sem permissão. Atualize a tela.');
  return rows;
}
export const rpcCRM = (nome, dados) => requisicao(`rpc/${nome}`, {method:'POST',body:JSON.stringify(dados)});

export async function salvarNegociacaoCRM(id,dados,anterior){
 const filtro=['status',...CAMPOS_NEGOCIACAO].map(k=>`${k}=${anterior[k]==null?'is.null':'eq.'+encodeURIComponent(anterior[k])}`).join('&');
 const rows=await requisicao(`integracao_crm_cards?id=eq.${encodeURIComponent(id)}&${filtro}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)});
 if(!rows?.length)throw new Error('A negociação mudou ou você não tem mais acesso. Reabra a ficha antes de salvar.');
 return rows;
}

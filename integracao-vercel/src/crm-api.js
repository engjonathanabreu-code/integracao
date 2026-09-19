import {requisicao,lerTabela} from './dados-compartilhados.js';
export const listarCRM = (tabela, filtro='') => lerTabela(tabela, '*', filtro);
export const criarCRM = (tabela, dados) => requisicao(tabela, {method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(dados)});
export async function editarCRM(tabela, id, dados) {
  const rows=await requisicao(`${tabela}?id=eq.${encodeURIComponent(id)}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)});
  if(!rows?.length)throw new Error('Registro indisponível ou sem permissão. Atualize a tela.');
  return rows;
}
export const rpcCRM = (nome, dados) => requisicao(`rpc/${nome}`, {method:'POST',body:JSON.stringify(dados)});

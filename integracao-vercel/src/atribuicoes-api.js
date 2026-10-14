import {requisicao} from './dados-compartilhados.js';
export const rpcAtribuicoes=(nome,dados)=>requisicao(`rpc/${nome}`,{method:'POST',body:JSON.stringify(dados)});
export async function exigirAcao(recurso,acao,tabela=null,registro=null){
 const permitido=await rpcAtribuicoes('integracao_atribuicoes_autorizar',{p_recurso:recurso,p_acao:acao,p_tabela:tabela,p_registro:registro});
 if(permitido!==true)throw new Error('Esta ação está bloqueada nas suas atribuições.');
}

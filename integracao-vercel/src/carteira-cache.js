import {requisicao,capturarSessao} from './dados-compartilhados.js';
export function aplicarDeltaCarteira(base,resposta){
 const objeto=v=>v&&typeof v==='object'&&!Array.isArray(v);
 if(!objeto(resposta?.manifesto)||!objeto(resposta.alterados))throw Error('Não foi possível validar a carteira.');
 const registros=Object.create(null);
 for(const [chave,versao] of Object.entries(resposta.manifesto)){
  if(!/^[mc]\/.+/.test(chave)||typeof versao!=='string'||!versao)throw Error('Versão da carteira inválida.');
  const alterado=Object.hasOwn(resposta.alterados,chave),dado=alterado?resposta.alterados[chave]:base?.registros?.[chave];
  if(!objeto(dado)||(!alterado&&base?.manifesto?.[chave]!==versao)||String(chave.startsWith('m/')?dado.registro_id:dado.id)!==chave.slice(2))throw Error('Carteira incompleta. Atualize e tente novamente.');
  registros[chave]=dado;
 }
 if(Object.keys(resposta.alterados).some(k=>!Object.hasOwn(resposta.manifesto,k)))throw Error('Carteira inconsistente.');
 return {manifesto:resposta.manifesto,registros,linhas:Object.entries(registros).filter(([k])=>k.startsWith('m/')).map(([,v])=>v),clientes:Object.entries(registros).filter(([k])=>k.startsWith('c/')).map(([,v])=>v)};
}
export function criarCacheCarteira(enviar=requisicao,capturar=capturarSessao){
 let base=null,owner=null,geracao=0;
 return async()=>{const scope=capturar(),g=++geracao;scope.conferir();if(owner!==scope.owner){base=null;owner=scope.owner;}
 const resposta=await enviar('rpc/integracao_carteira_delta',{method:'POST',body:JSON.stringify({conhecidos:base?.manifesto||{}})});scope.conferir();
 if(g!==geracao)throw Error('Consulta substituída por outra atualização.');
 const proxima=aplicarDeltaCarteira(base,resposta);base=proxima;return proxima;};
}

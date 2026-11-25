// Apoio dos testes SYNC-M4/SYNC-C2: fila real (IndexedDB em memória) + diário
// real sobre um "servidor" fictício que compara o registro inteiro no envio,
// como o servidor faz com o bloco de dados. Somente dados fictícios.
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {novaFila,CONTA} from './apoio-sync-fila.js';

export function ambienteConciliacao({colecao,registro}){
 const {fila,ler,relogio}=novaFila();
 const servidor={[colecao]:[structuredClone(registro)],auditoria:[]};
 const chamadas={leituras:0,envios:0,consultas:[],recusas:0};
 const ganchos={antesDoEnvio:[],consultar:null};
 const atual=id=>servidor[colecao].find(r=>r.id===id);
 const diario=criarDiarioCompartilhado({conta:CONTA,fila,ativo:()=>true,atualizou:()=>{},
  carregar:async()=>{chamadas.leituras++;return {db:structuredClone(servidor),bindings:[],base:{}};},
  // Uma operação por registro editado, com o registro lido como valor esperado.
  preparar:async(state,depois)=>({sent:{},identicos:{},operacoes:(depois[colecao]||[]).flatMap(r=>{
   const antes=(state.db[colecao]||[]).find(x=>x.id===r.id);
   return antes&&JSON.stringify(antes)!==JSON.stringify(r)?[{table:colecao,key:{id:r.id},expected:antes,changes:r}]:[];
  })}),
  enviar:async payload=>{
   chamadas.envios++;ganchos.antesDoEnvio.shift()?.();
   for(const op of payload)if(JSON.stringify(atual(op.key.id))!==JSON.stringify(op.expected)){chamadas.recusas++;throw Object.assign(new Error('Registro alterado por outra pessoa.'),{status:409,code:'PT409'});}
   for(const op of payload)Object.assign(atual(op.key.id),op.changes);
   return {aliases:{}};
  },
  consultarRecibo:async item=>{chamadas.consultas.push(item.pedido);if(ganchos.consultar)return ganchos.consultar(item);return null;},
  confirmar:async()=>{},fila});
 const itens=async()=>(await fila.listar(CONTA));
 return {diario,fila,ler,relogio,servidor,chamadas,ganchos,atual,itens};
}

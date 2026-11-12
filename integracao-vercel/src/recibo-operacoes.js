import {igualSemantico} from './igualdade-semantica.js';
import {remapearIdentidades} from './aliases-tipados.js';
const objeto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const invalido=()=>{throw Object.assign(Error('O recibo não identifica todas as operações. Preserve o pedido original para consulta.'),{code:'RECIBO_INVALIDO'});};
// Legacy receipts remain valid and still require the existing exact read-back.
// The additional protocol never authorizes a resend, accepts newer values or
// substitutes the canonical transaction snapshot for the current authorized read.
export function validarReciboOperacoes(recibo,operacoes,pedido){
 if(!objeto(recibo))return invalido();
 if(!Object.hasOwn(recibo,'protocoloRecibo'))return false;
 if(recibo.protocoloRecibo!==1||recibo.pedido!==pedido||!objeto(recibo.aliases)||!Array.isArray(recibo.resultados)||recibo.resultados.length!==operacoes.length||!Number.isFinite(Date.parse(recibo.confirmadoEm)))return invalido();
 for(const [indice,original] of operacoes.entries()){
  const op=remapearIdentidades(original,recibo.aliases),r=recibo.resultados[indice];
  if(!objeto(r)||r.indice!==indice||!(typeof r.versao==='string'&&/^[0-9a-f]{32}$/.test(r.versao)||r.tipo==='registro'&&r.disponivel===false&&r.versao===null))return invalido();
  if(op.action&&!op.remove){if(r.tipo!=='acao'||r.acao!==op.action||!Object.hasOwn(r,'canonico'))return invalido();}
  else if(r.tipo!=='registro'||r.tabela!==op.table||!igualSemantico(r.chave,op.key)||r.removido!==!!op.remove||(op.remove||r.disponivel===false?r.canonico!==null:!objeto(r.canonico)))return invalido();
 }
 return true;
}

import {igualSemantico} from './igualdade-semantica.js';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const objeto=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const vazio=v=>v==null||objeto(v)&&Object.keys(v).length===0;
const statusOk=v=>typeof v==='string'&&v.length>0&&v.length<=80;
const chavesPermitidas=(a,b,permitidas)=>[...new Set([...Object.keys(a),...Object.keys(b)])].every(k=>
 permitidas.includes(k)||igualSemantico(a[k],b[k]));

// A positively recognized CRM status refusal. This predicate is not the
// authorization guard; the operator and executor must still hold a live lease.
export function elegivelRetomadaCrm(item,{conta,pedido,revisao,agora=Date.now()}={}){
 if(!uuid(conta)||!uuid(pedido)||!hash(revisao)||!Number.isFinite(agora)||
    item?.conta!==conta||item.id!==pedido||item.pedido!==pedido||item.checksum!==revisao||
    item.estado!=='bloqueado_validacao'||item.fase!=='envio'||item.recibo!=null||
    item.substituidaPor!=null||item.leaseAte>agora||!Number.isFinite(item.enviadoEm)||
    item.erro?.codigo!=='P0001'||item.erro?.status!==400||item.erro?.categoria!=='validacao'||
    item.erro?.fase!=='envio'||item.erro?.rejeicaoConfirmada!==true) return false;
 const o=item.original,edicoes=o?.intencao?.edicoes;
 if(o?.modulo!=='processos'||o.legado||!vazio(o.intencao?.arquivos)||!vazio(item.preparado?.sent)||
    !Array.isArray(edicoes)||edicoes.length!==2||!Array.isArray(item.payload)||item.payload.length!==2)return false;
 const [cadastro,audit]=[edicoes.find(e=>e?.colecao==='processos'),edicoes.find(e=>e?.colecao==='auditoria')];
 const [a,b]=[cadastro?.antes?.valor,cadastro?.depois?.valor];
 const log=audit?.depois?.valor;
 if(!uuid(cadastro?.id)||!objeto(a)||!objeto(b)||a.id!==cadastro.id||b.id!==cadastro.id||
    cadastro.antes.existe!==true||cadastro.depois.existe!==true||!objeto(a.requerente)||!objeto(b.requerente)||
    !statusOk(a.requerente.statusCRM)||!statusOk(b.requerente.statusCRM)||a.requerente.statusCRM===b.requerente.statusCRM||
    !chavesPermitidas(a,b,['requerente','qualificacao'])||
    !chavesPermitidas(a.requerente,b.requerente,['statusCRM']))return false;
 if(!igualSemantico(a.qualificacao,b.qualificacao)&&
    (!objeto(a.qualificacao)||!objeto(b.qualificacao)||
     !chavesPermitidas(a.qualificacao,b.qualificacao,['atualizadoEm','por'])))return false;
 if(!uuid(audit?.id)||audit.antes?.existe!==false||audit.depois?.existe!==true||log?.id!==audit.id||
    log.processoId!==cadastro.id||log.usuarioId!=='erp_'+conta||log.acao!=='Cadastro alterado')return false;
 const p=item.payload.find(x=>x?.table==='integracao_moradores');
 const l=item.payload.find(x=>x?.table==='integracao_auditoria');
 return !!(p?.key?.colecao==='processos'&&p.key.registro_id===cadastro.id&&p.insert!==true&&p.delete!==true&&
   p.expected?.dados?.requerente?.statusCRM===a.requerente.statusCRM&&
   p.changes?.dados?.requerente?.statusCRM===b.requerente.statusCRM&&
   l?.key?.colecao==='auditoria'&&l.key.registro_id===audit.id&&l.insert===true&&
   l.changes?.criado_por===conta&&igualSemantico(l.changes?.dados,log));
}

// Only prepares an in-memory preview from two reads. No state changes, no
// automatic "keep local", and no fallback when the receipt lookup fails.
export async function conferirRetomadaCrm({item,alvo,consultarRecibo,reler,revalidar,verificar}){
 if(!elegivelRetomadaCrm(item,alvo))return {codigo:'REVISAO_NECESSARIA'};
 if(typeof consultarRecibo!=='function'||typeof reler!=='function'||
    typeof revalidar!=='function'||typeof verificar!=='function')return {codigo:'REVISAO_NECESSARIA'};
 const passo=async f=>{verificar();await revalidar();verificar();const r=await f();verificar();return r;};
 if(await passo(()=>consultarRecibo(item))!==null)return {codigo:'REVISAO_NECESSARIA'};
 const edicoes=item.original.intencao.edicoes;
 const esperado=edicoes.find(e=>e.colecao==='processos');
 const log=edicoes.find(e=>e.colecao==='auditoria');
 // Only publication through the existing adapter will apply a new request.
 // Re-read the scoped canonical row and abort on any change to the fields
 // being replayed, including values already applied without this receipt.
 const atual=await passo(()=>reler(item));
 if(atual?.cadastro?.id!==esperado.id||atual.auditoria!==null||
    atual.cadastro?.requerente?.statusCRM!==esperado.antes.valor.requerente.statusCRM)
  return {codigo:'REVISAO_NECESSARIA'};
 for(const k of ['por','atualizadoEm']){
  const a=esperado.antes.valor.qualificacao?.[k],b=esperado.depois.valor.qualificacao?.[k];
  if(a!==b&&atual.cadastro.qualificacao?.[k]!==a)return {codigo:'REVISAO_NECESSARIA'};
 }
 await revalidar();verificar();
 return {codigo:'PREVIA_VALIDADA',registro:esperado.id,auditoria:log.id};
}

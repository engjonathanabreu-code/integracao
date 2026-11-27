import {igualSemantico as igual} from './igualdade-semantica.js';

const objeto=x=>x!=null&&Object.getPrototypeOf(x)===Object.prototype;
const campos=new Set(['tema','agendaPessoal','calendarioOculto']);
const metadados=new Set(['online','ultimaAtividade','_atualizadoEm','_compartilhado']);

// This proof is deliberately only for the current account's existing
// preferences. No edits to the profile, ACL, presence, attachments, audit,
// deletes, inserts, aliases or RPC actions may use it.
export function escopoPreferencias(item){
 const o=item?.original,ops=item?.payload,ed=o?.intencao?.edicoes;
 if(o?.modulo!=='usuarios'||o.legado||item.recibo||ed?.length!==1||ops?.length!==1||
    Object.keys(o.intencao.arquivos||{}).length||Object.keys(item.preparado?.sent||{}).length)return null;
 const [e]=ed,[op]=ops;
 if(!e||!op||e.id!=='erp_'+item.conta||e.colecao!=='usuarios'||e.antes?.existe!==true||e.depois?.existe!==true)return null;
 const a=e.antes.valor,b=e.depois.valor;
 if(!objeto(a)||!objeto(b)||a.id!==e.id||b.id!==e.id||a.erpRef!==item.conta||b.erpRef!==item.conta||
    op.table!=='integracao_usuarios'||op.action||op.tempId||op.insert||op.remove||
    !igual(op.key,{colecao:'usuarios',registro_id:e.id})||!objeto(op.expected?.dados)||!objeto(op.changes?.dados)||
    Object.keys(op.changes).some(k=>!['dados','updated_at'].includes(k)))return null;
 const alterados=(x,y)=>[...new Set([...Object.keys(x),...Object.keys(y)])].filter(k=>!igual(x[k],y[k]));
 const solicitados=alterados(a,b).filter(k=>!metadados.has(k));
 const enviados=alterados(op.expected.dados,op.changes.dados);
 if(!solicitados.length||enviados.length!==solicitados.length||
    !solicitados.every(k=>campos.has(k)&&enviados.includes(k)&&Object.hasOwn(b,k)&&
        Object.hasOwn(op.changes.dados,k)&&igual(b[k],op.changes.dados[k])))return null;
 return {id:e.id,dados:op.changes.dados,solicitados};
}
export const conflitoReconciliavelPreferencias=(i,agora)=>i?.estado==='bloqueado_conflito'&&i.erro?.codigo==='PT409'&&
 (!i.reconciliacaoVerificadaEm||agora-i.reconciliacaoVerificadaEm>=120000)&&!!escopoPreferencias(i);

export function provarPreferenciasNoServidor(item,edicoes,remoto){
 const escopo=escopoPreferencias(item);
 if(!escopo||!igual(edicoes,item.original.intencao.edicoes))return null;
 const rows=remoto.base?.integracao_usuarios;
 if(!Array.isArray(rows))return null;
 const achados=rows.filter(r=>r.colecao==='usuarios'&&(r.registro_id===escopo.id||r.referencia_id===item.conta));
 if(remoto.base.integracao_complementos?.some(r=>r.colecao==='usuarios'&&(!r._tabela||r._tabela!=='integracao_usuarios')&&
    (r.registro_id===escopo.id||r.referencia_id===item.conta||r.dados?.erpRef===item.conta)))return null;
 if(achados.length!==1)return null;
 const [r]=achados;
 if(r.registro_id!==escopo.id||r.referencia_tabela!=='profiles'||r.referencia_id!==item.conta||!igual(r.dados,escopo.dados))return null;
 const perfil=remoto.db?.usuarios?.filter(u=>u.id===escopo.id&&u.erpRef===item.conta);
 if(perfil?.length!==1||!escopo.solicitados.every(k=>igual(perfil[0][k],escopo.dados[k])))return null;
 return {tipo:'preferencias_ja_presentes_no_servidor',checksum:item.checksum};
}

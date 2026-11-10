import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalizar=v=>(Array.isArray(v)?v:[v]).filter(Boolean).map(x=>String(x).trim().toLowerCase()).sort();
export function previaPublica(items){return items.map(i=>({id:i.id,origem:i.origem,estado:i.estado,versao:i.versao,tentativas:i.tentativa,criadoEm:i.criado_em,corpoHash:hash(i.corpo),destinatarios:normalizar(i.corpo.to).map(e=>e.replace(/^[^@]+/, '***'))}));}
export function comprovarRecibo(item,provedor){
 if(!['incerto','enviando'].includes(item.estado))throw Error('Somente resultado desconhecido aceita comprovação.');
 if(!provedor?.id||!provedor.created_at)throw Error('Recibo incompleto.');
 const corpo=item.corpo||{},data=Date.parse(provedor.created_at),fim=Date.parse(item.lease_ate),inicio=fim-180000;
 if(!Number.isFinite(data)||!Number.isFinite(fim)||data<inicio-5000||data>fim)throw Error('Recibo fora da janela do claim.');
 for(const campo of ['to','from'])if(JSON.stringify(normalizar(provedor[campo]))!==JSON.stringify(normalizar(corpo[campo])))throw Error('Recibo não corresponde ao destinatário/remetente.');
 for(const campo of ['subject','html','text'])if((provedor[campo]||'')!==(corpo[campo]||''))throw Error('Recibo não corresponde ao conteúdo congelado.');
 if(corpo.attachments?.length&&JSON.stringify(provedor.attachments)!==JSON.stringify(corpo.attachments))throw Error('O provedor não forneceu prova completa dos anexos; mantenha o resultado incerto.');
 return {recibo:provedor.id,evidencia:hash({envio:item.id,versao:item.versao,recibo:provedor})};
}
// This operation never calls the provider send endpoint. An operator must select
// one exact item/version and supply a real provider receipt for reconciliation.
export async function confirmarRecuperacao({id,versao,reciboId,rpc,consultarProvedor}){
 const items=await rpc('integracao_envios_previa',{p_ids:[id]}),item=items.find(i=>i.id===id);
 if(!item||item.versao!==versao)throw Error('Prévia desatualizada.');
 const prova=comprovarRecibo(item,await consultarProvedor(reciboId));
 if(prova.recibo!==reciboId)throw Error('Recibo divergente.');
 return rpc('integracao_envios_reconciliar',{p_id:id,p_versao:versao,p_acao:'confirmar_recibo',p_evidencia_hash:prova.evidencia,p_recibo:prova.recibo});
}

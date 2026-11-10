import {createHash} from 'node:crypto';
export const chaveResumo=(email,dia)=>`resumo/${dia}/America-Sao_Paulo/${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;
// Claim is committed before the provider call. An unknown outcome is never automatically resent.
export async function entregarOutbox({chave,origem,corpo,fila=null,rpc,enviar,deadline=Date.now()+95000}){
 if(Date.now()>deadline-25000)return {estado:'adiado'};
 const item=await rpc('integracao_envios_enfileirar',{p_chave:chave,p_origem:origem,p_corpo:corpo,p_fila:fila});
 if(item.estado==='desativado'||item.estado==='enviado')return item;
 const claim=await rpc('integracao_envios_claim',{p_id:item.id});
 if(claim?.estado==='incerto')return claim;
 if(!claim)return {id:item.id,estado:item.estado==='pendente'?'ocupado':item.estado};
 if(Date.now()>deadline-22000){await rpc('integracao_envios_finalizar',{p_id:claim.id,p_lease:claim.lease,p_estado:'pendente',p_erro:'SEM_ORCAMENTO',p_espera:30});return {id:claim.id,estado:'adiado'};}
 let recibo;
 try{recibo=await enviar(claim.corpo,claim.chave);if(!recibo)throw Object.assign(new Error('Sem recibo externo'),{code:'RECIBO_AUSENTE'});}
 catch(e){
  const transitorio=e.status===429,deterministico=[400,401,403,404,409,422].includes(e.status);
  const estado=transitorio&&claim.tentativa<5?'pendente':deterministico||transitorio?'bloqueado':'incerto';
  const espera=Math.max(e.retryAfter||0,Math.min(3600,30*2**Math.min(claim.tentativa,6))+Math.floor(Math.random()*15));
  await rpc('integracao_envios_finalizar',{p_id:claim.id,p_lease:claim.lease,p_estado:estado,p_erro:transitorio?'LIMITE_PROVEDOR':deterministico?'RECUSA_PROVEDOR':'RESULTADO_DESCONHECIDO',p_espera:espera});
  return {id:claim.id,estado};
 }
 // A failed receipt write leaves the claim in-flight; lease expiry becomes uncertain.
 await rpc('integracao_envios_finalizar',{p_id:claim.id,p_lease:claim.lease,p_estado:'enviado',p_recibo:recibo});
 return {id:claim.id,estado:'enviado'};
}

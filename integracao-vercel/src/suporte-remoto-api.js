import {requisicao,configERP} from './dados-compartilhados.js';

// This flag only stages the client. The database independently authorizes every
// operation; enabling a build never grants an operator or activates the channel.
export const SUPORTE_REMOTO_HABILITADO=import.meta.env?.VITE_SUPORTE_REMOTO==='1';
const acoes=new Set(['capacidade','listar','solicitar','cancelar','contatar','receber','autorizar','validar_execucao','concluir']);
const objeto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const falha=(codigo,status)=>Object.assign(Error('O suporte remoto não está disponível para esta solicitação.'),{code:codigo,...(Number.isFinite(status)?{status}:{})});

export function criarApiSuporte({requisitar=requisicao,habilitado=SUPORTE_REMOTO_HABILITADO}={}){
 async function chamar(acao,args={},options={}){
  if(!habilitado){if(acao==='capacidade')return {operador:false,habilitado:false};throw falha('SUPORTE_DESATIVADO');}
  if(!acoes.has(acao)||!objeto(args))throw falha('SUPORTE_RECUSADO',400);
  // The installation proof follows the existing authenticated Supabase client,
  // never a URL from a command. Refuse a non-TLS transport configuration.
  if(requisitar===requisicao){let url;try{url=new URL(configERP.url);}catch{throw falha('SUPORTE_RECUSADO');}if(url.protocol!=='https:'||url.username||url.password)throw falha('SUPORTE_RECUSADO');}
  try{return await requisitar('rpc/integracao_suporte_operar',{method:'POST',signal:options.signal,body:JSON.stringify({acao,args})});}
  catch(e){
   // Do not propagate Postgres messages/details or attach the original cause:
   // they may include the rejected row or credentials in transport diagnostics.
   const sessao=['SESSAO_ALTERADA','SESSAO_AUSENTE','SESSAO_EXPIRADA'].includes(e?.code);
   throw falha(sessao?e.code:[400,401,403,409,422].includes(e?.status)?'SUPORTE_RECUSADO':'SUPORTE_INDISPONIVEL',Number(e?.status));
  }
 }
 return {chamar,capacidade:()=>chamar('capacidade'),listar:()=>chamar('listar'),solicitar:args=>chamar('solicitar',args),cancelar:id=>chamar('cancelar',{id})};
}
export const suporteRemotoApi=criarApiSuporte();

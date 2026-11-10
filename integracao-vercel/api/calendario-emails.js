import {entregarOutbox} from '../server/calendario-outbox.js';
import { erpServico, montarCorpoEmail, enviarCorpoEmail, autorizadoPorSegredo, usuarioAtivo, ErroCalendario } from './_calendario.js';
import { montarConvite } from '../src/calendario-ics.js';
import { montarEmailEvento } from '../src/calendario-email.js';
export const config = { maxDuration: 120 };

const LOTE=40;
export async function drenar(agora=new Date(),deadline=Date.now()+95000){
 const cfg=await erpServico('rpc/integracao_envios_config',{method:'POST',body:{},deadline});
 if(!cfg?.habilitado)return {enviados:0,falhas:0,incertos:0,pendentes:0,estado:'desativado'};
 if(cfg.protocolo!==2||!Number.isFinite(Date.parse(cfg.corte)))throw new ErroCalendario('Protocolo de envio incompatível.',503);
 const pendentes=await erpServico('rpc/integracao_envios_pendentes',{method:'POST',body:{p_limite:LOTE},deadline});
 const totais={enviados:0,falhas:0,incertos:0,pendentes:pendentes.length};
 const rpc=(nome,body)=>erpServico(`rpc/${nome}`,{method:'POST',body,deadline});
 for(const item of pendentes){
  if(Date.now()>deadline-25000)break;
  const evento=item.evento||{},email=montarEmailEvento({evento,tipo:item.tipo,destinatario:{nome:item.nome}});
  const corpo=montarCorpoEmail({para:item.email,...email,responderPara:evento.organizador?.email||undefined,anexo:{nome:'convite.ics',conteudo:montarConvite(evento,{tipo:item.tipo,sequencia:item.sequencia,agora:new Date(item.criado_em)}),tipo:`text/calendar; charset=utf-8; method=${item.tipo==='cancelamento'?'CANCEL':'REQUEST'}`}});
  try{const r=await entregarOutbox({chave:`convite/${item.id}/${item.sequencia}`,origem:'convite',corpo,fila:item.id,rpc,enviar:enviarCorpoEmail,deadline});if(r.estado==='enviado')totais.enviados++;else if(r.estado==='incerto')totais.incertos++;else if(r.estado==='bloqueado')totais.falhas++;}
  catch{totais.falhas++;}
 }
 return totais;
}

export default async function handler(req, res) {
  const deadline=Date.now()+105000;
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ message: 'Use GET ou POST.' }); }
  if (!autorizadoPorSegredo(req) && !(await usuarioAtivo(req))) return res.status(401).json({ message: 'Não autorizado.' });
  try {
    const resultado = await drenar(new Date(),deadline);
    console.info('calendario-emails', resultado);
    return res.status(200).json(resultado);
  } catch (erro) {
    console.error('calendario-emails', { tipo: erro.name });
    return res.status(erro instanceof ErroCalendario ? erro.status : 503).json({ message: erro instanceof ErroCalendario ? erro.message : 'Não foi possível enviar os convites agora. Eles continuam na fila.' });
  }
}

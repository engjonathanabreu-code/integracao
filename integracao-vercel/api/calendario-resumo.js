import { erpServico, montarCorpoEmail, enviarCorpoEmail, autorizadoPorSegredo, enderecoPublico, ErroCalendario } from './_calendario.js';
import { limitesDoDia } from '../src/calendario-ics.js';
import { montarEmailResumo } from '../src/calendario-email.js';
import {entregarOutbox,chaveResumo} from '../server/calendario-outbox.js';
export const config = { maxDuration: 120 };

// Morning summary. The day starts and ends in Brasília, never in the server's
// UTC clock, so a 21h event is not pushed into the next day's e-mail.
export default async function handler(req, res) {
  const deadline=Date.now()+105000;
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ message: 'Use GET.' }); }
  if (!autorizadoPorSegredo(req)) return res.status(401).json({ message: 'Não autorizado.' });
  const { inicio, fim } = limitesDoDia(new Date());
  let enviados = 0, falhas = 0, incertos = 0;
  try {
    const cfg=await erpServico('rpc/integracao_envios_config',{method:'POST',body:{},deadline});
    if(!cfg?.habilitado)return res.status(200).json({estado:'desativado',enviados:0,falhas:0});
    const fila={estado:'nao_drenada'};
    const linhas = await erpServico('rpc/integracao_calendario_resumo', { method: 'POST', body: { p_inicio: inicio.toISOString(), p_fim: fim.toISOString() },deadline });
    for (const linha of linhas || []) {
      if(Date.now()>deadline-25000)break;
      const eventos = linha.eventos || [];
      if (!eventos.length) continue;
      try {
        const { assunto, html, texto } = montarEmailResumo({ destinatario: { nome: linha.nome }, eventos, dia: inicio, endereco: `${enderecoPublico(req)}/` });
        const resultado=await entregarOutbox({chave:chaveResumo(linha.email,inicio.toISOString().slice(0,10)),origem:'resumo',corpo:montarCorpoEmail({para:linha.email,assunto,html,texto}),rpc:(nome,body)=>erpServico(`rpc/${nome}`,{method:'POST',body,deadline}),enviar:enviarCorpoEmail,deadline});
        if(resultado.estado==='enviado')enviados++;else if(resultado.estado==='incerto')incertos++;else if(resultado.estado==='bloqueado')falhas++;
      } catch (erro) { falhas++; console.error('calendario-resumo', { tipo: erro.name }); }
    }
    console.info('calendario-resumo', { dia: inicio.toISOString(), pessoas: linhas?.length || 0, enviados, falhas, incertos, fila });
    return res.status(200).json({ enviados, falhas, incertos, fila });
  } catch (erro) {
    console.error('calendario-resumo', { tipo: erro.name });
    return res.status(erro instanceof ErroCalendario ? erro.status : 503).json({ message: erro instanceof ErroCalendario ? erro.message : 'Não foi possível montar os resumos agora.' });
  }
}

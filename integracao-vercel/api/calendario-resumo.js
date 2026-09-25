import { erpServico, enviarEmail, autorizadoPorSegredo, enderecoPublico, ErroCalendario } from './_calendario.js';
import { limitesDoDia } from '../src/calendario-ics.js';
import { montarEmailResumo } from '../src/calendario-email.js';
import { drenar } from './calendario-emails.js';
export const config = { maxDuration: 120 };

// Morning summary. The day starts and ends in Brasília, never in the server's
// UTC clock, so a 21h event is not pushed into the next day's e-mail.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ message: 'Use GET.' }); }
  if (!autorizadoPorSegredo(req)) return res.status(401).json({ message: 'Não autorizado.' });
  const { inicio, fim } = limitesDoDia(new Date());
  let enviados = 0, falhas = 0;
  try {
    // Safety net: a convite queued while nobody had the system open goes out now.
    const fila = await drenar().catch(erro => ({ enviados: 0, falhas: 0, erro: erro.message }));
    const linhas = await erpServico('rpc/integracao_calendario_resumo', { method: 'POST', body: { p_inicio: inicio.toISOString(), p_fim: fim.toISOString() } });
    for (const linha of linhas || []) {
      const eventos = linha.eventos || [];
      if (!eventos.length) continue;
      try {
        const { assunto, html, texto } = montarEmailResumo({ destinatario: { nome: linha.nome }, eventos, dia: inicio, endereco: `${enderecoPublico(req)}/` });
        await enviarEmail({ para: linha.email, assunto, html, texto });
        enviados++;
      } catch (erro) { falhas++; console.error('calendario-resumo', { tipo: erro.name }); }
    }
    console.info('calendario-resumo', { dia: inicio.toISOString(), pessoas: linhas?.length || 0, enviados, falhas, fila });
    return res.status(200).json({ enviados, falhas, fila });
  } catch (erro) {
    console.error('calendario-resumo', { tipo: erro.name, mensagem: erro.message });
    return res.status(erro instanceof ErroCalendario ? erro.status : 503).json({ message: erro instanceof ErroCalendario ? erro.message : 'Não foi possível montar os resumos agora.' });
  }
}

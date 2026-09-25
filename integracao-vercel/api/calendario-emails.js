import { erpServico, enviarEmail, autorizadoPorSegredo, usuarioAtivo, ErroCalendario } from './_calendario.js';
import { montarConvite } from '../src/calendario-ics.js';
import { montarEmailEvento } from '../src/calendario-email.js';
export const config = { maxDuration: 120 };

const LOTE = 40, TENTATIVAS = 5;

// The database trigger decided who gets what; this only delivers the queue.
// Running it twice is safe: a row is marked sent before the next one is read.
export async function drenar(agora = new Date()) {
  let enviados = 0, falhas = 0;
  const pendentes = await erpServico(`integracao_calendario_fila?select=id,email,nome,tipo,sequencia,evento,tentativas&enviado_em=is.null&tentativas=lt.${TENTATIVAS}&order=criado_em.asc&limit=${LOTE}`);
  for (const item of pendentes || []) {
    const evento = item.evento || {};
    try {
      const { assunto, html, texto } = montarEmailEvento({ evento, tipo: item.tipo, destinatario: { nome: item.nome } });
      const ics = montarConvite(evento, { tipo: item.tipo, sequencia: item.sequencia, agora });
      await enviarEmail({
        para: item.email, assunto, html, texto,
        responderPara: evento.organizador?.email || undefined,
        anexo: { nome: 'convite.ics', conteudo: ics, tipo: `text/calendar; charset=utf-8; method=${item.tipo === 'cancelamento' ? 'CANCEL' : 'REQUEST'}` },
      });
      await erpServico(`integracao_calendario_fila?id=eq.${item.id}`, { method: 'PATCH', body: { enviado_em: new Date().toISOString(), tentativas: item.tentativas + 1, erro: null }, headers: { Prefer: 'return=minimal' } });
      enviados++;
    } catch (erro) {
      falhas++;
      // The message is kept for the next attempt; the address is never logged.
      await erpServico(`integracao_calendario_fila?id=eq.${item.id}`, { method: 'PATCH', body: { tentativas: item.tentativas + 1, erro: String(erro.message || erro).slice(0, 300) }, headers: { Prefer: 'return=minimal' } }).catch(() => {});
    }
  }
  return { enviados, falhas, pendentes: pendentes?.length || 0 };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ message: 'Use GET ou POST.' }); }
  if (!autorizadoPorSegredo(req) && !(await usuarioAtivo(req))) return res.status(401).json({ message: 'Não autorizado.' });
  try {
    const resultado = await drenar();
    console.info('calendario-emails', resultado);
    return res.status(200).json(resultado);
  } catch (erro) {
    console.error('calendario-emails', { tipo: erro.name, mensagem: erro.message });
    return res.status(erro instanceof ErroCalendario ? erro.status : 503).json({ message: erro instanceof ErroCalendario ? erro.message : 'Não foi possível enviar os convites agora. Eles continuam na fila.' });
  }
}

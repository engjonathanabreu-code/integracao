import { erpServico, ErroCalendario } from './_calendario.js';
import { montarFeed } from '../src/calendario-ics.js';
export const config = { maxDuration: 30 };

const DIA = 24 * 60 * 60 * 1000;

// Private subscription feed: the token is the only credential, so it is matched
// inside the database and never appears in a log or in the response body.
export default async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET'); return res.status(405).send('Use GET.'); }
  const token = String(req.query?.t || '').trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).send('Calendário não encontrado.'); }
  const agora = new Date();
  try {
    const linhas = await erpServico('rpc/integracao_calendario_feed', {
      method: 'POST',
      body: { p_token: token, p_desde: new Date(agora.getTime() - 120 * DIA).toISOString(), p_ate: new Date(agora.getTime() + 400 * DIA).toISOString() },
    });
    if (!linhas?.length) {
      // An unknown token and an empty agenda look the same from outside.
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.status(200).send(montarFeed('Minha agenda', [], { agora }));
    }
    const eventos = linhas.map(l => l.evento).filter(e => e && e.status !== 'cancelado');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="integracao.ics"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(montarFeed(linhas[0].nome, eventos, { agora }));
  } catch (erro) {
    console.error('calendario-ics', { tipo: erro.name, mensagem: erro.message });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(erro instanceof ErroCalendario ? erro.status : 503).send('Calendário indisponível no momento.');
  }
}

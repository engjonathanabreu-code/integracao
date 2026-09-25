// Server side of the calendar bridge. The service key never leaves the function
// and is only used for the three calendar tables and their two readers.
export const ERP_URL = () => process.env.VITE_ERP_SUPABASE_URL || 'https://ycdsyilyvaxslkwbkxyo.supabase.co';
const ERP_PUBLICA = () => process.env.VITE_ERP_SUPABASE_KEY || 'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4';

export class ErroCalendario extends Error { constructor(mensagem, status = 503) { super(mensagem); this.status = status; } }

export async function erpServico(caminho, { method = 'GET', body, headers = {} } = {}) {
  const chave = process.env.ERP_SERVICE_ROLE_KEY;
  if (!chave) throw new ErroCalendario('Calendário por e-mail ainda não configurado: falta ERP_SERVICE_ROLE_KEY.', 503);
  const r = await fetch(`${ERP_URL()}/rest/v1/${caminho}`, {
    method,
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new ErroCalendario(`Consulta ao calendário indisponível (${r.status})`);
  return r.status === 204 ? null : r.json();
}

// Either the daily cron or a signed-in employee may drain the queue; neither of
// them chooses recipients, which the database trigger already decided.
export function autorizadoPorSegredo(req) {
  const segredo = process.env.CRON_SECRET, cabecalho = String(req.headers.authorization || '');
  if (!segredo || !cabecalho.startsWith('Bearer ')) return false;
  const a = new TextEncoder().encode(segredo), b = new TextEncoder().encode(cabecalho.slice(7));
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

export async function usuarioAtivo(req) {
  const authorization = req.headers.authorization;
  if (!/^Bearer \S+$/.test(authorization || '')) return null;
  const headers = { apikey: ERP_PUBLICA(), Authorization: authorization };
  const auth = await fetch(`${ERP_URL()}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!auth?.ok) return null;
  const user = await auth.json();
  const perfil = await fetch(`${ERP_URL()}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=ativo`, { headers, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!perfil?.ok) return null;
  return (await perfil.json()).some(p => p.ativo === true) ? user.id : null;
}

export const enderecoPublico = req => (process.env.INTEGRACAO_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  || (req?.headers?.host ? `https://${req.headers.host}` : '')).replace(/\/+$/, '');

const REMETENTE = () => process.env.CALENDARIO_REMETENTE || 'Integração Integral <agenda@integralse.com.br>';

// Resend takes the whole message over HTTPS, so the project keeps no SMTP
// dependency. Swapping provider means replacing only this function.
export async function enviarEmail({ para, assunto, html, texto, responderPara, anexo }) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) throw new ErroCalendario('Envio de e-mail ainda não configurado: falta RESEND_API_KEY.', 503);
  const corpo = { from: REMETENTE(), to: [para], subject: assunto, html, text: texto };
  if (responderPara) corpo.reply_to = responderPara;
  if (anexo) corpo.attachments = [{ filename: anexo.nome, content: Buffer.from(anexo.conteudo, 'utf8').toString('base64'), content_type: anexo.tipo }];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20000),
  });
  const resposta = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCalendario(resposta?.message || `Falha no envio (${r.status})`);
  return resposta?.id || '';
}

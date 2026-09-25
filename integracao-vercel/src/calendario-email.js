// E-mails of the Integração calendar, in the ERP's colours. Pure strings: the
// API routes only hand the result to the mail provider.
import { quandoPorExtenso, diaPorExtenso, horaLocal, linkGoogleAgenda } from './calendario-ics.js';

const VERDE = '#0F5F5B';
export const escaparHTML = texto => String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paragrafos = texto => String(texto || '').split(/\r?\n/).filter(l => l.trim()).map(l => `<p style="margin:0 0 8px">${escaparHTML(l)}</p>`).join('');

const ROTULOS = {
  convite: { etiqueta: 'Convite', acao: 'convidou você para', assunto: 'Convite' },
  atualizacao: { etiqueta: 'Alteração', acao: 'alterou', assunto: 'Atualizado' },
  cancelamento: { etiqueta: 'Cancelado', acao: 'cancelou', assunto: 'Cancelado' },
};

const moldura = (titulo, conteudo, rodape) => `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F3F5F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1C2321">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2E7E5;border-radius:14px;overflow:hidden">
<tr><td style="background:${VERDE};padding:16px 22px;color:#FFFFFF;font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:700">Integral · Integração</td></tr>
<tr><td style="padding:22px"><h1 style="margin:0 0 14px;font-size:19px;line-height:1.3;color:#10312F">${escaparHTML(titulo)}</h1>${conteudo}</td></tr>
<tr><td style="padding:14px 22px;background:#FAFBFB;border-top:1px solid #E2E7E5;font-size:12px;color:#5A6664">${escaparHTML(rodape)}</td></tr>
</table></td></tr></table></body></html>`;

const linha = (rotulo, valor) => valor ? `<tr><td style="padding:3px 12px 3px 0;font-size:13px;color:#5A6664;white-space:nowrap">${escaparHTML(rotulo)}</td><td style="padding:3px 0;font-size:14px;color:#1C2321"><strong>${escaparHTML(valor)}</strong></td></tr>` : '';

export function montarEmailEvento({ evento, tipo = 'convite', destinatario = {} }) {
  const rotulo = ROTULOS[tipo] || ROTULOS.convite;
  const organizador = evento.organizador?.nome || 'A equipe';
  const participantes = (evento.participantes || []).map(p => p.nome || p.email).filter(Boolean);
  const cancelado = tipo === 'cancelamento';
  const assunto = `${rotulo.assunto}: ${evento.titulo || 'Evento'} — ${quandoPorExtenso(evento)}`;
  const conteudo = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escaparHTML(destinatario.nome ? `${destinatario.nome.split(' ')[0]}, ` : '')}${escaparHTML(organizador)} ${rotulo.acao} <strong>${escaparHTML(evento.titulo || 'este evento')}</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
${linha('Quando', quandoPorExtenso(evento))}
${linha('Agenda', evento.agenda)}
${linha('Núcleo', evento.nucleo)}
${linha('Participantes', participantes.join(', '))}
</table>
${evento.descricao ? `<div style="font-size:14px;line-height:1.5;color:#3A4442;border-left:3px solid #E2E7E5;padding-left:12px;margin:0 0 16px">${paragrafos(evento.descricao)}</div>` : ''}
${cancelado
    ? '<p style="margin:0;font-size:14px;color:#8A3A3A">O anexo remove o compromisso da sua agenda automaticamente.</p>'
    : `<p style="margin:0 0 14px;font-size:13px;color:#5A6664">O anexo já entra na sua agenda. No Gmail e no Outlook, responda pelos botões do próprio e-mail.</p>
<a href="${escaparHTML(linkGoogleAgenda(evento))}" style="display:inline-block;background:${VERDE};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:9px">Adicionar ao Google Agenda</a>`}`;
  const texto = [
    `${organizador} ${rotulo.acao} ${evento.titulo || 'este evento'}.`, '',
    `Quando: ${quandoPorExtenso(evento)}`,
    evento.agenda ? `Agenda: ${evento.agenda}` : '',
    evento.nucleo ? `Núcleo: ${evento.nucleo}` : '',
    participantes.length ? `Participantes: ${participantes.join(', ')}` : '',
    evento.descricao ? `\n${evento.descricao}` : '',
    cancelado ? '' : `\nAdicionar ao Google Agenda: ${linkGoogleAgenda(evento)}`,
  ].filter(Boolean).join('\n');
  return { assunto, html: moldura(evento.titulo || 'Evento', conteudo, 'Enviado pelo calendário do Integração. Para não receber convites por e-mail, abra o Calendário e desligue em Google Agenda e e-mail.'), texto };
}

export function montarEmailResumo({ destinatario = {}, eventos = [], dia = new Date(), endereco = '' }) {
  const lista = [...eventos].sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  const assunto = `Sua agenda de ${diaPorExtenso(dia)}`;
  const itens = lista.map(e => `<tr>
<td style="padding:9px 12px 9px 0;font-size:14px;color:${VERDE};font-weight:700;white-space:nowrap;vertical-align:top;border-top:1px solid #EDF0EF">${escaparHTML(horaLocal(e.inicio))}</td>
<td style="padding:9px 0;font-size:14px;vertical-align:top;border-top:1px solid #EDF0EF"><strong>${escaparHTML(e.titulo || 'Evento')}</strong>${[e.agenda, e.nucleo].filter(Boolean).length ? `<div style="font-size:12px;color:#5A6664;margin-top:2px">${escaparHTML([e.agenda, e.nucleo].filter(Boolean).join(' — '))}</div>` : ''}<div style="font-size:12px;color:#5A6664;margin-top:2px">até ${escaparHTML(horaLocal(e.fim))}</div></td></tr>`).join('');
  const conteudo = `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escaparHTML(destinatario.nome ? `${destinatario.nome.split(' ')[0]}, você tem` : 'Você tem')} ${lista.length === 1 ? 'um compromisso' : `${lista.length} compromissos`} hoje.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${itens}</table>
${endereco ? `<p style="margin:18px 0 0"><a href="${escaparHTML(endereco)}" style="display:inline-block;background:${VERDE};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:9px">Abrir o calendário</a></p>` : ''}`;
  const texto = [`Sua agenda de ${diaPorExtenso(dia)}:`, '', ...lista.map(e => `${horaLocal(e.inicio)} às ${horaLocal(e.fim)} — ${e.titulo || 'Evento'}${e.agenda ? ` (${e.agenda})` : ''}`), endereco ? `\n${endereco}` : ''].filter(Boolean).join('\n');
  return { assunto, html: moldura(`Agenda de ${diaPorExtenso(dia)}`, conteudo, 'Resumo diário do calendário do Integração. Para não receber, abra o Calendário e desligue em Google Agenda e e-mail.'), texto };
}

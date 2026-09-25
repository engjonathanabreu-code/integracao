// iCalendar (RFC 5545) for the Integração calendar: the invitation attached to
// each e-mail and the personal subscription feed. Pure text, no network: the
// same file is used by the API routes and by the tests.
export const FUSO = 'America/Sao_Paulo';
export const DOMINIO_UID = 'integracao.integralse.com.br';
const CRLF = '\r\n';

export const uidEvento = id => `${String(id || '').trim() || 'sem-id'}@${DOMINIO_UID}`;

// Property values escape backslash, semicolon, comma and newline; nothing else.
export const escaparICS = texto => String(texto ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function dataICS(valor) {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

// Lines are folded at 75 octets, counting bytes and never splitting a character.
const codificador = new TextEncoder(), decodificador = new TextDecoder();
export function dobrar(linha) {
  const bytes = codificador.encode(String(linha));
  if (bytes.length <= 75) return String(linha);
  const partes = [];
  let inicio = 0, limite = 75;
  while (inicio < bytes.length) {
    let fim = Math.min(inicio + limite, bytes.length);
    while (fim < bytes.length && (bytes[fim] & 0xc0) === 0x80) fim--;
    partes.push(decodificador.decode(bytes.subarray(inicio, fim)));
    inicio = fim; limite = 74;
  }
  return partes.join(`${CRLF} `);
}

const montar = linhas => linhas.filter(Boolean).map(dobrar).join(CRLF) + CRLF;
const endereco = pessoa => String(pessoa?.email || '').trim();
const pessoaICS = (papel, pessoa, extras = '') => endereco(pessoa)
  ? `${papel};CN=${escaparICS(pessoa.nome || pessoa.email)}${extras}:mailto:${endereco(pessoa)}`
  : '';

export const REPETICAO = { semanal: 'FREQ=WEEKLY', quinzenal: 'FREQ=WEEKLY;INTERVAL=2', mensal: 'FREQ=MONTHLY' };

export function corpoEvento(evento, { cancelado = false, sequencia = 0, convite = false, agora = new Date() } = {}) {
  const participantes = Array.isArray(evento.participantes) ? evento.participantes : [];
  const local = [evento.agenda, evento.nucleo].filter(Boolean).join(' — ');
  const repeticao = REPETICAO[evento.recorrencia];
  return [
    'BEGIN:VEVENT',
    `UID:${uidEvento(evento.id)}`,
    `DTSTAMP:${dataICS(agora)}`,
    `DTSTART:${dataICS(evento.inicio)}`,
    `DTEND:${dataICS(evento.fim)}`,
    repeticao ? `RRULE:${repeticao}` : '',
    `SEQUENCE:${Number.isInteger(sequencia) && sequencia >= 0 ? sequencia : 0}`,
    `SUMMARY:${escaparICS(evento.titulo || 'Evento')}`,
    evento.descricao ? `DESCRIPTION:${escaparICS(evento.descricao)}` : '',
    local ? `LOCATION:${escaparICS(local)}` : '',
    `STATUS:${cancelado ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    pessoaICS('ORGANIZER', evento.organizador),
    ...(convite ? participantes.map(p => pessoaICS('ATTENDEE', p, `;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=${cancelado ? 'FALSE' : 'TRUE'}`)) : []),
    'END:VEVENT',
  ];
}

// METHOD:REQUEST puts the event straight into Gmail, Outlook and iCloud with
// the accept/decline buttons; CANCEL removes it from the same calendars.
export function montarConvite(evento, { tipo = 'convite', sequencia = 0, agora = new Date() } = {}) {
  const cancelado = tipo === 'cancelamento';
  return montar([
    'BEGIN:VCALENDAR', 'PRODID:-//Integral Solucoes em Engenharia//Integracao REURB//PT-BR',
    'VERSION:2.0', 'CALSCALE:GREGORIAN', `METHOD:${cancelado ? 'CANCEL' : 'REQUEST'}`,
    ...corpoEvento(evento, { cancelado, sequencia, convite: true, agora }),
    'END:VCALENDAR',
  ]);
}

export function montarFeed(nome, eventos, { agora = new Date() } = {}) {
  return montar([
    'BEGIN:VCALENDAR', 'PRODID:-//Integral Solucoes em Engenharia//Integracao REURB//PT-BR',
    'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparICS(`Integração — ${nome || 'Minha agenda'}`)}`,
    `X-WR-TIMEZONE:${FUSO}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...(eventos || []).flatMap(e => corpoEvento(e, { cancelado: e.status === 'cancelado', agora })),
    'END:VCALENDAR',
  ]);
}

// Fallback for whoever does not use the attachment: one click adds the event to
// Google Agenda already filled in.
export function linkGoogleAgenda(evento) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: evento.titulo || 'Evento',
    dates: `${dataICS(evento.inicio)}/${dataICS(evento.fim)}`,
  });
  const detalhes = [evento.descricao, evento.organizador?.nome ? `Criado por ${evento.organizador.nome}` : ''].filter(Boolean).join('\n\n');
  if (detalhes) params.set('details', detalhes);
  const local = [evento.agenda, evento.nucleo].filter(Boolean).join(' — ');
  if (local) params.set('location', local);
  return `https://calendar.google.com/calendar/render?${params}`;
}

const formatos = {
  dia: new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
  hora: new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }),
  curto: new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }),
};
export const diaPorExtenso = valor => Number.isFinite(new Date(valor).getTime()) ? formatos.dia.format(new Date(valor)) : '';
export const horaLocal = valor => Number.isFinite(new Date(valor).getTime()) ? formatos.hora.format(new Date(valor)) : '';
export const diaCurto = valor => Number.isFinite(new Date(valor).getTime()) ? formatos.curto.format(new Date(valor)) : '';
export const quandoPorExtenso = evento => [diaPorExtenso(evento.inicio), `${horaLocal(evento.inicio)} às ${horaLocal(evento.fim)}`].filter(Boolean).join(', ');

// The day boundaries of the summary follow Brasília, not the server's UTC clock.
export function limitesDoDia(referencia = new Date(), fuso = FUSO) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(referencia);
  const inicio = new Date(`${partes}T00:00:00${deslocamento(referencia, fuso)}`);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { dia: partes, inicio, fim };
}
function deslocamento(data, fuso) {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' }).formatToParts(data).find(p => p.type === 'timeZoneName')?.value || 'GMT-03:00';
  return nome.replace('GMT', '') || '-03:00';
}

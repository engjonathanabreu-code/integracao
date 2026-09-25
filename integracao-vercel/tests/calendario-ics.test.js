import test from 'node:test';
import assert from 'node:assert/strict';
import {montarConvite,montarFeed,linkGoogleAgenda,dataICS,escaparICS,dobrar,uidEvento,limitesDoDia,quandoPorExtenso} from '../src/calendario-ics.js';
import {montarEmailEvento,montarEmailResumo,escaparHTML} from '../src/calendario-email.js';

// Readers unfold before parsing; the tests do the same so an assertion is not
// about where a line happened to break.
const desdobrar=texto=>texto.replace(/\r\n /g,'');
const EVENTO={
 id:'11111111-1111-4111-8111-111111111111',
 titulo:'Mobilização em Ibirama',
 descricao:'Levar as plantas do NUI 03.\nConfirmar a sala com a prefeitura.',
 inicio:'2026-10-07T13:00:00+00:00',fim:'2026-10-07T15:30:00+00:00',
 status:'ativo',recorrencia:'nenhuma',agenda:'Carro 01',nucleo:'Ibirama/SC',
 organizador:{nome:'Jonathan Abreu',email:'jonathan@integralse.com.br'},
 participantes:[{nome:'Marcos Paulo',email:'marcos@exemplo.com'},{nome:'Ana',email:'ana@exemplo.com'}],
};

test('timestamps are exported in UTC, the way every calendar reads them',()=>{
 assert.equal(dataICS('2026-10-07T13:00:00+00:00'),'20261007T130000Z');
 assert.equal(dataICS('2026-10-07T10:00:00-03:00'),'20261007T130000Z');
 assert.equal(dataICS('não é data'),'');
});

test('text is escaped and long lines are folded without breaking a character',()=>{
 assert.equal(escaparICS('Reunião; com Ana, Bia\nsala 2'),'Reunião\\; com Ana\\, Bia\\nsala 2');
 const dobrada=dobrar(`SUMMARY:${'ã'.repeat(90)}`);
 const linhas=dobrada.split('\r\n');
 assert.ok(linhas.length>1);
 assert.ok(linhas.slice(1).every(l=>l.startsWith(' ')));
 assert.equal(linhas.map((l,i)=>i?l.slice(1):l).join(''),`SUMMARY:${'ã'.repeat(90)}`);
 assert.ok(linhas.every(l=>Buffer.byteLength(l,'utf8')<=76));
});

test('the invitation is a REQUEST with the organiser, the guests and the sequence',()=>{
 const ics=desdobrar(montarConvite(EVENTO,{tipo:'convite',sequencia:0,agora:new Date('2026-09-24T12:00:00Z')}));
 assert.ok(ics.includes('METHOD:REQUEST'));
 assert.ok(ics.includes(`UID:${uidEvento(EVENTO.id)}`));
 assert.ok(ics.includes('DTSTART:20261007T130000Z'));
 assert.ok(ics.includes('DTEND:20261007T153000Z'));
 assert.ok(ics.includes('SEQUENCE:0'));
 assert.ok(ics.includes('STATUS:CONFIRMED'));
 assert.ok(ics.includes('ORGANIZER;CN=Jonathan Abreu:mailto:jonathan@integralse.com.br'));
 assert.ok(ics.includes('ATTENDEE;CN=Ana;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:ana@exemplo.com'));
 assert.ok(ics.includes('LOCATION:Carro 01 — Ibirama/SC'));
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('an update keeps the same UID and raises the sequence, so no duplicate appears',()=>{
 const primeiro=montarConvite(EVENTO,{tipo:'convite',sequencia:0});
 const segundo=montarConvite({...EVENTO,titulo:'Mobilização em Ibirama (nova sala)'},{tipo:'atualizacao',sequencia:1});
 assert.equal(primeiro.match(/UID:(.*)\r\n/)[1],segundo.match(/UID:(.*)\r\n/)[1]);
 assert.ok(segundo.includes('SEQUENCE:1'));
 assert.ok(segundo.includes('METHOD:REQUEST'));
});

test('a cancellation removes the event from the guest calendar',()=>{
 const ics=montarConvite({...EVENTO,status:'cancelado'},{tipo:'cancelamento',sequencia:2});
 assert.ok(ics.includes('METHOD:CANCEL'));
 assert.ok(ics.includes('STATUS:CANCELLED'));
 assert.ok(ics.includes('SEQUENCE:2'));
 assert.ok(ics.includes('RSVP=FALSE'));
});

test('a weekly event carries its repetition rule',()=>{
 assert.ok(montarConvite({...EVENTO,recorrencia:'quinzenal'},{}).includes('RRULE:FREQ=WEEKLY;INTERVAL=2'));
 assert.ok(!montarConvite(EVENTO,{}).includes('RRULE'));
});

test('the subscription feed publishes the agenda with a refresh hint',()=>{
 const feed=montarFeed('Ana',[EVENTO,{...EVENTO,id:'22222222-2222-4222-8222-222222222222',titulo:'Topografia'}]);
 assert.ok(feed.includes('METHOD:PUBLISH'));
 assert.ok(feed.includes('X-WR-CALNAME:Integração — Ana'));
 assert.ok(feed.includes('REFRESH-INTERVAL;VALUE=DURATION:PT1H'));
 assert.equal(feed.match(/BEGIN:VEVENT/g).length,2);
 // A published feed never asks the subscriber to answer someone else's invite.
 assert.ok(!feed.includes('ATTENDEE'));
});

test('the Google Agenda link carries the event already filled in',()=>{
 const url=new URL(linkGoogleAgenda(EVENTO));
 assert.equal(url.searchParams.get('action'),'TEMPLATE');
 assert.equal(url.searchParams.get('text'),EVENTO.titulo);
 assert.equal(url.searchParams.get('dates'),'20261007T130000Z/20261007T153000Z');
 assert.equal(url.searchParams.get('location'),'Carro 01 — Ibirama/SC');
});

test('the day of the summary starts and ends in Brasília, not in UTC',()=>{
 const {dia,inicio,fim}=limitesDoDia(new Date('2026-10-07T02:00:00Z'));
 assert.equal(dia,'2026-10-06');
 assert.equal(inicio.toISOString(),'2026-10-06T03:00:00.000Z');
 assert.equal(fim.toISOString(),'2026-10-07T03:00:00.000Z');
});

test('the event e-mail says when it is, in local time, and escapes what people typed',()=>{
 const {assunto,html,texto}=montarEmailEvento({evento:{...EVENTO,titulo:'Sala <b>2</b> & carro'},tipo:'convite',destinatario:{nome:'Ana Paula'}});
 assert.ok(assunto.startsWith('Convite: Sala <b>2</b> & carro'));
 assert.ok(html.includes('Sala &lt;b&gt;2&lt;/b&gt; &amp; carro'));
 assert.ok(!html.includes('<b>2</b>'));
 assert.ok(html.includes('Ana,'));
 assert.ok(html.includes('calendar.google.com'));
 assert.ok(texto.includes('10:00 às 12:30'));
 assert.equal(quandoPorExtenso(EVENTO),'quarta-feira, 07 de outubro de 2026, 10:00 às 12:30');
});

test('the cancellation e-mail does not invite anyone back',()=>{
 const {assunto,html}=montarEmailEvento({evento:EVENTO,tipo:'cancelamento',destinatario:{nome:'Ana'}});
 assert.ok(assunto.startsWith('Cancelado:'));
 assert.ok(!html.includes('calendar.google.com'));
 assert.ok(html.includes('remove o compromisso'));
});

test('the morning summary lists the day in order and links back to the system',()=>{
 const tarde={...EVENTO,id:'33333333-3333-4333-8333-333333333333',titulo:'Reunião com a prefeitura',inicio:'2026-10-07T19:00:00+00:00',fim:'2026-10-07T20:00:00+00:00'};
 const {assunto,html,texto}=montarEmailResumo({destinatario:{nome:'Ana Paula'},eventos:[tarde,EVENTO],dia:new Date('2026-10-07T12:00:00Z'),endereco:'https://integracao.exemplo/'});
 assert.equal(assunto,'Sua agenda de quarta-feira, 07 de outubro de 2026');
 assert.ok(html.indexOf('Mobilização em Ibirama')<html.indexOf('Reunião com a prefeitura'));
 assert.ok(html.includes('2 compromissos'));
 assert.ok(html.includes('https://integracao.exemplo/'));
 assert.ok(texto.includes('16:00 às 17:00 — Reunião com a prefeitura'));
});

test('one commitment is announced in the singular',()=>{
 assert.ok(montarEmailResumo({destinatario:{nome:'Ana'},eventos:[EVENTO],dia:new Date('2026-10-07T12:00:00Z')}).html.includes('um compromisso'));
 assert.equal(escaparHTML(`<img src=x onerror="alert('1')">`),'&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;');
});

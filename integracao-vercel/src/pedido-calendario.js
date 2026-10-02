const normalizar=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function interpretarReuniao(texto,db,usuario,agora=new Date()){
 const t=normalizar(texto),hora=t.match(/(?:as|às)\s*(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*(?:h(?:rs|oras)?|horas)?\b/);if(!hora)return null;
 const hh=Number(hora[1]),mm=Number(hora[2]||0);if(hh>23||mm>59)throw Error('O horário informado é inválido. Use, por exemplo, 15:00.');
 const partes=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(agora).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const dia=new Date(Date.UTC(Number(partes.year),Number(partes.month)-1,Number(partes.day)));let dataInformada=false;
 if(/\bamanha\b/.test(t)){dia.setUTCDate(dia.getUTCDate()+1);dataInformada=true}else if(/\bhoje\b/.test(t))dataInformada=true;else{const dt=t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);if(dt){dia.setUTCFullYear(Number(dt[3]||partes.year),Number(dt[2])-1,Number(dt[1]));if(dia.getUTCDate()!==Number(dt[1])||dia.getUTCMonth()!==Number(dt[2])-1)throw Error('A data informada é inválida.');dataInformada=true}}
 if(!dataInformada)return null;
 const pessoa=texto.match(/\bcom\s+(?:o\s+|a\s+)?(.+?)(?=\s+sobre\b|\s+para\b|\s+[àa]s\b|$)/i)?.[1]?.trim();
 const assunto=texto.match(/\bsobre\s+(?:o\s+|a\s+)?(.+)$/i)?.[1]?.trim()||'Reunião';
 const matches=pessoa?(db.usuarios||[]).filter(u=>u.ativo!==false&&(normalizar(u.nome)===normalizar(pessoa)||normalizar(u.nome).split(/\s+/).includes(normalizar(pessoa)))):[];
 const pendencias=[];if(pessoa&&matches.length!==1)pendencias.push(matches.length?'Há mais de um usuário chamado '+pessoa+'. Escolha o participante correto.':'Não encontrei '+pessoa+' entre os usuários ativos. Escolha o participante correto antes de criar a reunião.');
 const minutos=hh*60+mm,duracao=Number(t.match(/(?:duracao de|por)\s*(\d+)\s*min/)?.[1]||60);if(minutos+duracao>=1440||duracao<1)throw Error('Informe uma duração que termine no mesmo dia.');
 const inicio=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'),fim=String(Math.floor((minutos+duracao)/60)).padStart(2,'0')+':'+String((minutos+duracao)%60).padStart(2,'0');
 const municipais=(db.municipios||[]).filter(m=>normalizar(assunto).includes(normalizar(m.nome)));
 const nucleos=(db.nucleos||[]).filter(n=>(!municipais.length||municipais.some(m=>m.id===n.municipioId))&&[n.nome,n.codigo].filter(Boolean).some(v=>normalizar(assunto).includes(normalizar(v))));
 return {titulo:'Reunião · '+assunto,dia:dia.toISOString().slice(0,10),inicio,fim,participantes:[...new Set([usuario.id,...(matches.length===1?matches.map(u=>u.id):[])])],entidade:nucleos.length===1?{tipo:'nucleo',id:nucleos[0].id}:null,descricao:'Pedido ao agente: '+texto,pendencias,nota:(!t.match(/(?:duracao de|por)\s*\d+\s*min/)?'Duração padrão: 1 hora. ':'')+(nucleos.length!==1?'O assunto foi preservado sem vincular a um núcleo não identificado.':''),automatico:!pendencias.length};
}

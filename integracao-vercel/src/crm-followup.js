export const PRAZOS_FOLLOWUP=[1,2,4];
export function situacaoFollowup(f,agora=Date.now()){
 if(!f)return {texto:'Sem prazo definido',tipo:'sem-prazo'};
 const atraso=new Date(f.previsto_em).getTime()<agora;
 return {texto:atraso?'Atrasado':'Agendado',tipo:atraso?'atrasado':'agendado'};
}
export const dataFollowup=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—';
export const horasFollowup=v=>v==null?'—':`${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1})} h`;

export const MAX_DIAS_FOLLOWUP=3650;
export function diaFollowup(agora=new Date()){
 const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(agora);
 const valor=tipo=>partes.find(p=>p.type===tipo).value;
 return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
export function dataPrazoFollowup(dias,agora=new Date()){
 return new Date(Date.parse(`${diaFollowup(agora)}T12:00:00Z`)+dias*86400000).toISOString().slice(0,10);
}
export function diasPrazoFollowup(prazo,agora=new Date()){
 let dias;
 if(prazo.modo==='calendario'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(prazo.data||''))return null;
  const instante=Date.parse(`${prazo.data}T12:00:00Z`);
  if(!Number.isFinite(instante)||new Date(instante).toISOString().slice(0,10)!==prazo.data)return null;
  dias=(instante-Date.parse(`${diaFollowup(agora)}T12:00:00Z`))/86400000;
 }else dias=Number(prazo.modo==='personalizado'?prazo.dias:prazo.modo);
 return Number.isInteger(dias)&&dias>=1&&dias<=MAX_DIAS_FOLLOWUP?dias:null;
}

// Datas sem offset são civis; timestamps com offset usam o fuso de operação do ERP.
export function diaCivilEvento(value){
  if(/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$)/.test(value||''))return value.slice(0,10);
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
const somarDias=(dia,n)=>{const d=new Date(dia+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function ocorrenciasDoEvento(e) {
  if(!e.inicio||!e.fim)return [];
  const inicio=new Date(e.inicio),fim=new Date(e.fim);
  if(!Number.isFinite(inicio.getTime())||!Number.isFinite(fim.getTime())||fim<inicio)return [];
  const limite=e.recorrenciaAte?.slice(0,10),primeiro=diaCivilEvento(e.inicio),termino=diaCivilEvento(e.fim);
  const passo=e.recorrencia==='semanal'?7:e.recorrencia==='quinzenal'?14:e.recorrencia==='mensal'?30:0;
  const dias=new Set();
  for(let k=0;k<(passo?60:1);k++){
    if(limite&&somarDias(primeiro,k*passo)>limite)break;
    dias.add(somarDias(termino,k*passo));
  }
  return [...dias];
}

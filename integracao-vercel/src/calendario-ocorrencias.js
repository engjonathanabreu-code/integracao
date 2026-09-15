const diaLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function ocorrenciasDoEvento(e) {
  const inicio=new Date(e.inicio),fim=new Date(e.fim);
  if(!Number.isFinite(inicio.getTime())||!Number.isFinite(fim.getTime())||fim<inicio)return [];
  const limite=e.recorrenciaAte?new Date(`${e.recorrenciaAte}T23:59:59`):null;
  const passo=e.recorrencia==='semanal'?7:e.recorrencia==='quinzenal'?14:e.recorrencia==='mensal'?30:0;
  const dias=new Set();
  for(let k=0;k<(passo?60:1);k++){
    const ini=new Date(inicio),end=new Date(fim);ini.setDate(ini.getDate()+k*passo);end.setDate(end.getDate()+k*passo);
    if(limite&&ini>limite)break;
    // The end is exclusive: an event ending at midnight does not occupy the next day.
    const ultimo=end>ini?new Date(end.getTime()-1):end;
    const dia=new Date(ini);dia.setHours(0,0,0,0);
    const final=new Date(ultimo);final.setHours(0,0,0,0);
    for(;dia<=final;dia.setDate(dia.getDate()+1))dias.add(diaLocal(dia));
  }
  return [...dias];
}

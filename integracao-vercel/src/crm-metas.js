export const hojeVendas=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dia=s=>Date.parse(`${s}T12:00:00Z`)/86400000;
export function progressoVenda(meta,hoje=hojeVendas()) {
 const realizado=Number(meta.realizado)||0,alvo=Number(meta.alvo)||0;
 const dias=Math.round(dia(meta.fim)-dia(hoje)),total=Math.max(1,dia(meta.fim)-dia(meta.inicio)+1);
 const tempo=Math.min(100,Math.max(0,(dia(hoje)-dia(meta.inicio)+1)/total*100));
 const percentual=alvo>0?realizado/alvo*100:0;
 const situacao=meta.status==='cancelada'?'Cancelada':hoje<meta.inicio?'Ainda não iniciou':realizado>=alvo?'Meta atingida':dias<0?'Prazo vencido':dias===0?'Vence hoje':dias<=7?`Vence em ${dias} dia(s)`:percentual<tempo?'Abaixo do ritmo esperado':'No ritmo esperado';
 return {realizado,percentual,tempo,dias,situacao,alerta:meta.status==='ativa'&&hoje>=meta.inicio&&realizado<alvo&&dias<=7};
}
export const exibirVenda=(v,unidade)=>Number(v||0).toLocaleString('pt-BR',unidade==='valor'?{style:'currency',currency:'BRL'}:{maximumFractionDigits:0});
export function periodoVenda(tipo,inicio) {
 const d=new Date(`${inicio}T12:00:00Z`);if(!Number.isFinite(d.getTime()))return inicio;
 if(tipo==='semanal')d.setUTCDate(d.getUTCDate()+6);
 else {const meses={mensal:1,trimestral:3,semestral:6,anual:12}[tipo];if(!meses)return inicio;d.setUTCMonth(d.getUTCMonth()+meses,1);d.setUTCDate(0);}
 return d.toISOString().slice(0,10);
}

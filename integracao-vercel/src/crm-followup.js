export const PRAZOS_FOLLOWUP=[1,2,4];
export function situacaoFollowup(f,agora=Date.now()){
 if(!f)return {texto:'Sem prazo definido',tipo:'sem-prazo'};
 const atraso=new Date(f.previsto_em).getTime()<agora;
 return {texto:atraso?'Atrasado':'Agendado',tipo:atraso?'atrasado':'agendado'};
}
export const dataFollowup=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—';
export const horasFollowup=v=>v==null?'—':`${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1})} h`;

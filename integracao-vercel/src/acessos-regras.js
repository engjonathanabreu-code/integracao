export const FUSO_ACESSOS='America/Sao_Paulo';
export function diaAcesso(data){return new Intl.DateTimeFormat('en-CA',{timeZone:FUSO_ACESSOS,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(data));}
export const mesAtualAcessos=()=>diaAcesso(new Date()).slice(0,7);
export function mudarMes(mes,delta){const [a,m]=mes.split('-').map(Number);return new Date(Date.UTC(a,m-1+delta,1)).toISOString().slice(0,7);}
export function limitesMes(mes){return {inicio:`${mes}-01T00:00:00-03:00`,fim:`${mudarMes(mes,1)}-01T00:00:00-03:00`};}
export const horaAcesso=data=>new Intl.DateTimeFormat('pt-BR',{timeZone:FUSO_ACESSOS,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(data));
export function linhasAcessos(eventos,mes,usuario=''){
 const grupos=new Map();
 for(const e of eventos){const dia=diaAcesso(e.ocorrido_em);if(!dia.startsWith(mes)||usuario&&e.usuario_id!==usuario)continue;const key=`${dia}:${e.usuario_id}`;if(!grupos.has(key))grupos.set(key,{dia,usuario_id:e.usuario_id,nome:e.usuario_nome,login:[],logout:[]});grupos.get(key)[e.evento]?.push(e);}
 return [...grupos.values()].sort((a,b)=>a.dia.localeCompare(b.dia)||a.nome.localeCompare(b.nome,'pt-BR')).map(l=>({...l,login:l.login.sort((a,b)=>a.ocorrido_em.localeCompare(b.ocorrido_em)),logout:l.logout.sort((a,b)=>a.ocorrido_em.localeCompare(b.ocorrido_em))}));
}

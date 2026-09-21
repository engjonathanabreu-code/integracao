import {requisicao} from './dados-compartilhados.js';
export const ponto=(acao,dados={})=>requisicao('rpc/integracao_ponto',{method:'POST',body:JSON.stringify({p_acao:acao,p_dados:dados})});
export const idPonto=u=>u.erpRef||String(u.id).replace(/^erp_/,'');
export const diaPonto=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const horaPonto=t=>new Date(t).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'});
export const duracaoPonto=(m,sinal=false)=>`${m<0?'−':sinal&&m>0?'+':''}${Math.floor(Math.abs(m)/60)}h ${String(Math.abs(m)%60).padStart(2,'0')}min`;
export const jornadaAtual=id=>requisicao(`integracao_ponto_jornadas?usuario_id=eq.${encodeURIComponent(id)}&order=vigencia.desc,criado_em.desc&limit=1`);
export async function relatorioPonto(id,mes){
 const [relatorio,decisoes,ajustes,revisoes]=await Promise.all([ponto('relatorio',{usuario_id:id,mes:mes+'-01'}),...['decisoes','ajustes','revisoes'].map(t=>requisicao(`integracao_ponto_${t}?usuario_id=eq.${encodeURIComponent(id)}&dia=gte.${mes}-01&dia=lt.${mes==='9999-12'?'9999-12-31':new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),1)).toISOString().slice(0,10)}&order=criado_em.desc&limit=1000`))]);
 return {...relatorio,decisoes,ajustes,revisoes};
}

export async function solicitacoesPonto(id,mes,diretor=false){
 const historico=()=>requisicao(`integracao_ponto_solicitacoes?usuario_id=eq.${encodeURIComponent(id)}&dia=gte.${mes}-01&dia=lt.${new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),1)).toISOString().slice(0,10)}&order=criado_em.desc&limit=1000`);
 const [registros,pendentes]=await Promise.all([historico(),diretor?requisicao('integracao_ponto_solicitacoes?status=eq.pendente&order=criado_em.asc&limit=1000'):Promise.resolve([])]);
 return {registros,pendentes};
}

// Períodos e totais do relatório de clientes ativados pelo comercial.
export const TIPOS_PERIODO=[['mensal','Mensal'],['trimestral','Trimestral'],['semestral','Semestral'],['anual','Anual']];
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_POR={mensal:1,trimestral:3,semestral:6,anual:12};
export function opcoesPeriodo(tipo){
 if(tipo==='mensal')return MESES.map((n,i)=>[i+1,n]);
 if(tipo==='trimestral')return [1,2,3,4].map(n=>[n,`${n}º trimestre`]);
 if(tipo==='semestral')return [1,2].map(n=>[n,`${n}º semestre`]);
 return [[1,'Ano inteiro']];
}
const dois=n=>String(n).padStart(2,'0');
export function intervaloPeriodo(tipo,ano,numero){
 const meses=MESES_POR[tipo];if(!meses)throw new Error('Tipo de período inválido');
 const n=tipo==='anual'?1:Number(numero),total=12/meses;
 if(!Number.isInteger(Number(ano))||Number(ano)<2000||!Number.isInteger(n)||n<1||n>total)throw new Error('Período inválido');
 const mesInicio=(n-1)*meses+1,mesFim=mesInicio+meses-1,ultimoDia=new Date(Date.UTC(Number(ano),mesFim,0)).getUTCDate();
 const rotulo=tipo==='anual'?String(ano):`${opcoesPeriodo(tipo)[n-1][1]} de ${ano}`;
 return {inicio:`${ano}-${dois(mesInicio)}-01`,fim:`${ano}-${dois(mesFim)}-${dois(ultimoDia)}`,rotulo};
}
// Período em andamento, usado como padrão ao abrir o relatório.
export function periodoAtual(tipo,hoje){const [ano,mes]=hoje.split('-').map(Number);return {ano,numero:Math.ceil(mes/MESES_POR[tipo])};}
const centavos=v=>Math.round(Number(v||0)*100);
// Cada ativação conta para o responsável principal no momento em que o cliente passou a Cliente ativo.
export function resumirAtivacoes(registros){
 const porComercial=new Map();
 for(const r of registros){const id=r.responsavel_id||'';const a=porComercial.get(id)||{responsavel_id:id||null,quantidade:0,centavos:0,semValor:0};a.quantidade++;a.centavos+=centavos(r.valor);if(r.valor==null)a.semValor++;porComercial.set(id,a);}
 const linhas=[...porComercial.values()].map(({centavos:c,...a})=>({...a,valor:c/100})).sort((a,b)=>b.valor-a.valor||b.quantidade-a.quantidade);
 return {linhas,quantidade:registros.length,valor:registros.reduce((s,r)=>s+centavos(r.valor),0)/100,semValor:registros.filter(r=>r.valor==null).length};
}
export const reais=v=>v==null?'Não informado':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const dataBR=v=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v));
export function csvAtivacoes(registros,nomeUsuario){
 const celula=v=>{const s=String(v??'');return '"'+(/^[\s]*[=+\-@]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};
 const cabecalho=['Data da ativação','Cliente','Cidade','Valor (R$)','Comercial responsável','Compartilhado com','Observação'];
 const linhas=registros.map(r=>[dataBR(r.ativado_em),r.nome,r.cidade,r.valor==null?'':Number(r.valor).toFixed(2).replace('.',','),nomeUsuario(r.responsavel_id),(r.comerciais_adicionais||[]).map(nomeUsuario).join(', '),r.origem==='estimado'?'Data estimada: ativação anterior ao registro automático':'']);
 return '﻿'+[cabecalho,...linhas].map(l=>l.map(celula).join(';')).join('\r\n');
}

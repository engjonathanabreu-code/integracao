import {referenciaNucleo} from './processo-etapas.js';import {compararTextos} from './ordenacao.js';
export function timestampAndamento(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value))return null;
 const [y,m,d]=value.slice(0,10).split('-').map(Number),civil=new Date(Date.UTC(y,m-1,d));if(civil.getUTCFullYear()!==y||civil.getUTCMonth()!==m-1||civil.getUTCDate()!==d)return null;
 const n=Date.parse(value.length===10?value+'T12:00:00Z':value);return Number.isFinite(n)?n:null;
}
export function entradaAndamento(a){for(const field of ['created_at','crm_created_at','data_atualizacao']){const tempo=timestampAndamento(a[field]);if(tempo!==null)return {tempo,valor:a[field],campo:field};}return {tempo:null,valor:null,campo:null};}
export function ordenarAndamentos(itens){const unicos=new Map();for(const a of itens||[])if(a?.id)unicos.set(a.id,a);return [...unicos.values()].sort((a,b)=>(entradaAndamento(b).tempo??-Infinity)-(entradaAndamento(a).tempo??-Infinity)||compararTextos(a.id,b.id));}
export function agruparAndamentosMunicipios(itens,db){
 const nucleos=new Map((db.nucleos||[]).map(n=>[referenciaNucleo(n),n])),municipios=new Map((db.municipios||[]).map(m=>[m.id,m])),grupos=new Map();
 for(const a of ordenarAndamentos(itens)){const n=nucleos.get(a.processo_id),m=municipios.get(n?.municipioId),key=m?.id||'municipio-indisponivel';if(!grupos.has(key))grupos.set(key,{id:key,nome:m?(m.nome||'Município sem nome')+(m.uf?' / '+m.uf:''):'Município não identificado',itens:[]});grupos.get(key).itens.push(a);}
 return [...grupos.values()].sort((a,b)=>(a.id==='municipio-indisponivel')-(b.id==='municipio-indisponivel')||compararTextos(a.nome,b.nome)||compararTextos(a.id,b.id));
}
export function dataAdicaoAndamento(a){const e=entradaAndamento(a);if(e.tempo===null)return 'Data indisponível';if(e.campo==='data_atualizacao'||e.valor.length===10)return e.valor.slice(0,10).split('-').reverse().join('/')+' (data do andamento)';return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(e.tempo));}

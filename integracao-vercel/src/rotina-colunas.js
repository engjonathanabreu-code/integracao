// Colunas da rotina mensal: semanas 1 a 4 sempre existem; outras são criadas com nome e tom da paleta.
export const TONS_ROTINA=[
 {id:'verde',nome:'Verde',cor:'#e6f0ea'},
 {id:'azul',nome:'Azul',cor:'#e8edf8'},
 {id:'areia',nome:'Areia',cor:'#f5efdf'},
 {id:'lilas',nome:'Lilás',cor:'#eee8f4'},
 {id:'rosa',nome:'Rosa',cor:'#fbe9e8'},
 {id:'cinza',nome:'Cinza',cor:'#edf1f0'},
];
export const MAX_SEMANA_ROTINA=20;
const PADRAO=['verde','azul','areia','lilas'];
export const tomPadrao=semana=>PADRAO[(Number(semana)-1)%PADRAO.length];
const tomValido=t=>TONS_ROTINA.some(x=>x.id===t);
// Une as colunas padrão, as configuradas no mês e as semanas que já têm cards (inclusive removidos).
export function colunasRotina(configuradas=[],cards=[]){
 const semanas=new Set([1,2,3,4,...configuradas.map(c=>Number(c.semana)),...cards.map(c=>Number(c.semana))].filter(n=>Number.isInteger(n)&&n>0));
 return [...semanas].sort((a,b)=>a-b).map(semana=>{const c=configuradas.find(x=>Number(x.semana)===semana);return {semana,nome:c?.nome||`Semana ${semana}`,tom:tomValido(c?.tom)?c.tom:tomPadrao(semana),personalizada:!!c,id:c?.id||null};});
}
export const proximaSemana=colunas=>Math.max(4,...colunas.map(c=>c.semana))+1;

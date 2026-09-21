export const CAMPOS_NEGOCIACAO=['valor_total','forma_negociacao','parcelas','desconto_percentual','entrada_percentual'];
export const reais=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function lerValorReais(texto){
 const s=String(texto??'').trim().replace(/^R\$\s*/,'');
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))throw new Error('Informe o valor em reais, por exemplo 1.500,00.');
 const v=Number(s.replaceAll('.','').replace(',','.'));
 if(!Number.isFinite(v)||v<=0||v>999999999999.99)throw new Error('Informe um valor total maior que zero.');
 return Math.round(v*100)/100;
}
export function formularioNegociacao(card){return {valor:card.valor_total==null?'':Number(card.valor_total).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),forma:card.forma_negociacao||'',parcelas:card.parcelas??'',desconto:card.desconto_percentual??'',entrada:card.entrada_percentual??''};}
export function prepararNegociacao(f){
 if(!f.valor&&!f.forma&&!String(f.parcelas)&&!String(f.desconto)&&!String(f.entrada))return Object.fromEntries(CAMPOS_NEGOCIACAO.map(k=>[k,null]));
 const d={valor_total:lerValorReais(f.valor),forma_negociacao:f.forma,parcelas:null,desconto_percentual:null,entrada_percentual:null};
 if(!['parcelado','avista','entrada_parcelas'].includes(f.forma))throw new Error('Escolha a forma de negociação.');
 const percent=(v,nome,max)=>{const s=String(v).replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(s)||Number(s)<0||Number(s)>max)throw new Error(`Informe ${nome} entre 0 e ${max}%.`);return Number(s);};
 if(f.forma==='avista')d.desconto_percentual=percent(f.desconto,'o desconto',100);
 else {const p=Number(f.parcelas);if(!/^\d+$/.test(String(f.parcelas))||!Number.isSafeInteger(p)||p<1||p>999)throw new Error('Informe de 1 a 999 parcelas inteiras.');d.parcelas=p;}
 if(f.forma==='entrada_parcelas'){d.entrada_percentual=percent(f.entrada,'a entrada',99.99);if(d.entrada_percentual<=0)throw new Error('A entrada deve ser maior que 0% e menor que 100%.');}
 return d;
}
export function resumoNegociacao(d){
 if(d.valor_total==null)return '';
 const total=Math.round(Number(d.valor_total)*100),moeda=c=>reais(c/100);
 if(d.forma_negociacao==='avista')return `À vista, com ${d.desconto_percentual}% de desconto: ${moeda(Math.round(total*(100-d.desconto_percentual)/100))}.`;
 const entrada=d.forma_negociacao==='entrada_parcelas'?Math.round(total*d.entrada_percentual/100):0;
 const restante=total-entrada,p=Number(d.parcelas),parcela=Math.floor(restante/p),ultima=restante-parcela*(p-1);
 const divisao=ultima===parcela?`${p} parcela${p===1?'':'s'} de ${moeda(parcela)}`:p===1?`1 parcela de ${moeda(ultima)}`:`${p-1} parcela${p-1===1?'':'s'} de ${moeda(parcela)} e a última de ${moeda(ultima)}`;
 return `${entrada?`Entrada de ${d.entrada_percentual}% (${moeda(entrada)}) e saldo de ${moeda(restante)} em `:''}${divisao}.`;
}

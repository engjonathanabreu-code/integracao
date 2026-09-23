import {parseNum} from './requisitos-moradores.js';
const centavos=v=>Math.round(parseNum(v)*100);
const texto=c=>(c/100).toFixed(2).replace('.',',');
export function atualizarCondicoes(f,chave,valor){
 const novo={...f,[chave]:valor};
 const total=centavos(novo.valorTotal);
 if(chave==='entradaTipo'&&valor==='percentual'){
  novo.entradaPercentual=total>0?(centavos(novo.entrada)/total*100).toFixed(6).replace(/0+$/,'').replace(/\.$/,'').replace('.',','):'';
 }
 if(novo.modalidade!=='Entrada e parcelas'){novo.entrada='';novo.entradaPercentual='';}
 else if(novo.entradaTipo==='percentual'&&['entradaPercentual','valorTotal','modalidade'].includes(chave)){
  const percentual=parseNum(novo.entradaPercentual);
  novo.entrada=Number.isFinite(total)&&Number.isFinite(percentual)?texto(Math.round(total*percentual/100)):'';
 }
 if(['valorTotal','entrada','entradaPercentual','entradaTipo','parcelas','modalidade'].includes(chave)){
  const qtd=Number(novo.parcelas),entrada=novo.modalidade==='Entrada e parcelas'?centavos(novo.entrada):0;
  novo.valorParcela=Number.isFinite(total)&&Number.isFinite(entrada)&&Number.isInteger(qtd)&&qtd>0?texto(Math.floor((total-entrada)/qtd)):'';
 }
 return novo;
}
export function validarCondicoesVenda(f){
 if(/^(Isento|Custeado)/.test(f.modalidade))return '';
 const total=centavos(f.valorTotal);
 if(!Number.isSafeInteger(total)||total<=0)return 'Informe um valor total maior que zero.';
 if(f.modalidade==='À vista')return '';
 const qtd=Number(f.parcelas);
 if(!Number.isInteger(qtd)||qtd<1||qtd>999)return 'Informe de 1 a 999 parcelas inteiras.';
 const entrada=f.modalidade==='Entrada e parcelas'?centavos(f.entrada):0;
 if(!Number.isSafeInteger(entrada)||entrada<0||entrada>=total||(f.modalidade==='Entrada e parcelas'&&entrada===0))return 'A entrada deve ser maior que zero e menor que o valor total.';
 if(f.entradaTipo==='percentual'&&f.modalidade==='Entrada e parcelas'&&!(parseNum(f.entradaPercentual)>0&&parseNum(f.entradaPercentual)<100))return 'Informe uma entrada maior que 0% e menor que 100%.';
 if(!Number.isInteger(Number(f.diaVencimento))||Number(f.diaVencimento)<1||Number(f.diaVencimento)>31)return 'Informe um dia de vencimento entre 1 e 31.';
 const parcela=centavos(f.valorParcela),ultima=total-entrada-parcela*(qtd-1);
 if(!Number.isSafeInteger(parcela)||parcela<=0||ultima<=0)return 'Confira o valor das parcelas e o saldo restante.';
 if(Math.abs(ultima-parcela)>=qtd)return 'O valor das parcelas não corresponde ao saldo. Confira o total, a entrada e a quantidade de parcelas.';
 return '';
}
export function ultimaParcela(f){
 if(!['Entrada e parcelas','Parcelado sem entrada'].includes(f?.modalidade))return '';
 const qtd=Number(f?.parcelas),total=centavos(f?.valorTotal),entrada=f?.modalidade==='Entrada e parcelas'?centavos(f?.entrada):0,parcela=centavos(f?.valorParcela);
 return Number.isInteger(qtd)&&qtd>0&&[total,entrada,parcela].every(Number.isFinite)?texto(total-entrada-parcela*(qtd-1)):'';
}

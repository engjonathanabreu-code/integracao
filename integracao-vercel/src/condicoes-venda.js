import {parseNum} from './requisitos-moradores.js';
const centavos=v=>Math.round(parseNum(v)*100);
const texto=c=>(c/100).toFixed(2).replace('.',',');
export const ENTRADA_PARCELADA='Com Entrada Parcelada';
export const entradaParcelaVazia=()=>({valor:'',vencimento:''});
const ehPlano=f=>f?.modalidade===ENTRADA_PARCELADA;
const dinheiroExato=v=>{
 const s=String(v??'').trim();
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s)&&!/^\d+\.\d{1,2}$/.test(s))return NaN;
 const [i,d='']=s.includes(',')?s.replaceAll('.','').split(','):/^\d+\.\d{1,2}$/.test(s)?s.split('.'):[s.replaceAll('.','')];
 const n=Number(i)*100+Number(d.padEnd(2,'0'));
 return Number.isSafeInteger(n)&&n<=99_999_999_999_999?n:NaN;
};
const dataValida=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function calcularEntradaParcelada(f){
 const itens=Array.isArray(f?.parcelasEntrada)?f.parcelasEntrada:[];
 const total=dinheiroExato(f?.valorTotal);
 const valores=itens.map(x=>dinheiroExato(x?.valor));
 const entrada=valores.reduce((a,b)=>a+b,0),saldo=total-entrada,qtd=Number(f?.parcelas);
 const numeroValido=Number.isInteger(qtd)&&qtd>0&&qtd<=999;
 const padrao=numeroValido?Math.floor(saldo/qtd):NaN;
 const parcela=dinheiroExato(f?.valorParcela);
 return {itens,valores,total,entrada,saldo,qtd,numeroValido,padrao,parcela,ultima:saldo-parcela*(qtd-1)};
}
// Contrato-only condition stays outside the legacy Financeiro-bound comercial fields.
export function gravarCondicaoVenda(registro,f,{atualizadoEm,por}={}){
 if(ehPlano(f)){
  const {itens,valores,total,parcela}=calcularEntradaParcelada(f);
  const plano=Object.fromEntries(['modalidade','valorTotal','parcelas','valorParcela','diaVencimento','primeiroVencimento','reajuste','observacoes'].map(k=>[k,f[k]??'']));
  registro.planoEntradaParcelada={...plano,valorTotal:texto(total),valorParcela:texto(parcela),parcelasEntrada:itens.map(({vencimento},i)=>({valor:texto(valores[i]),vencimento})),atualizadoEm,por};
 }else{
  const {parcelasEntrada,...legacy}=f;
  registro.comercial={...legacy,atualizadoEm,por};
  if(registro.planoEntradaParcelada)registro.planoEntradaParcelada=null;
 }
 return registro;
}
export const condicaoVendaRegistrada=r=>r?.planoEntradaParcelada||r?.comercial||null;
export function descreverEntradaParcelada(f,{formatar=formatarCentavos,data=v=>v?.split('-').reverse().join('/')}={}){
 const erro=validarCondicoesVenda(f);
 if(erro)return '';
 const {itens,valores,total,entrada,saldo,qtd,parcela,ultima}=calcularEntradaParcelada(f);
 const lista=itens.map((x,i)=>`${i+1}ª de ${formatar(valores[i])}, com vencimento em ${data(x.vencimento)}`).join('; ');
 const vencSaldo=qtd===1?`com vencimento em ${data(f.primeiroVencimento)}`:`com primeiro vencimento em ${data(f.primeiroVencimento)} e vencimentos mensais seguintes no dia ${Number(f.diaVencimento)}`;
 const divisor=ultima===parcela?`${qtd} parcela${qtd===1?'':'s'} de ${formatar(parcela)}`:qtd===1?`1 parcela de ${formatar(ultima)}`:`${qtd-1} parcela${qtd===2?'':'s'} de ${formatar(parcela)} e uma última de ${formatar(ultima)}`;
 return `O valor total de ${formatar(total)} será pago com entrada total de ${formatar(entrada)}, dividida em ${itens.length} parcela${itens.length===1?'':'s'}: ${lista}. O saldo de ${formatar(saldo)} será pago em ${divisor}, ${vencSaldo}.`;
}
const formatarCentavos=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function atualizarCondicoes(f,chave,valor){
 const novo={...f,[chave]:valor};
 if(ehPlano(novo)){
  if(chave==='modalidade'&&!novo.parcelasEntrada?.length)novo.parcelasEntrada=[entradaParcelaVazia()];
  const plano=calcularEntradaParcelada(novo);
  if(['valorTotal','parcelas','parcelasEntrada','modalidade'].includes(chave))novo.valorParcela=plano.padrao>0?texto(plano.padrao):'';
  return novo;
 }
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
 if(ehPlano(f)){
  const {itens,valores,total,entrada,saldo,numeroValido,qtd,parcela,ultima}=calcularEntradaParcelada(f);
  if(!Number.isSafeInteger(total)||total<=0)return 'Informe o valor total em reais, com até duas casas decimais.';
  if(itens.length<1||itens.length>3)return 'Informe de 1 a 3 parcelas da entrada.';
  if(valores.some(v=>!Number.isSafeInteger(v)||v<=0))return 'Informe um valor positivo, com até duas casas decimais, para cada parcela da entrada.';
  if(!Number.isSafeInteger(entrada)||saldo<=0)return 'A soma da entrada deve ser menor que o valor total.';
  if(itens.some((x,i)=>!dataValida(x.vencimento)||(i>0&&x.vencimento<=itens[i-1].vencimento)))return 'Informe datas válidas e em ordem crescente para as parcelas da entrada.';
  if(!numeroValido)return 'Informe de 1 a 999 parcelas inteiras para o saldo.';
  if(!Number.isInteger(Number(f.diaVencimento))||Number(f.diaVencimento)<1||Number(f.diaVencimento)>31)return 'Informe um dia de vencimento do saldo entre 1 e 31.';
  if(!dataValida(f.primeiroVencimento)||f.primeiroVencimento<=itens.at(-1).vencimento)return 'O primeiro vencimento do saldo deve ocorrer após a última parcela da entrada.';
  if(!Number.isSafeInteger(parcela)||parcela<=0||!Number.isSafeInteger(ultima)||ultima<=0||Math.abs(ultima-parcela)>=qtd)return 'O valor das parcelas não corresponde ao saldo.';
  return '';
 }
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
 if(ehPlano(f)){const {ultima}=calcularEntradaParcelada(f);return Number.isSafeInteger(ultima)&&ultima>0?texto(ultima):'';}
 if(!['Entrada e parcelas','Parcelado sem entrada'].includes(f?.modalidade))return '';
 const qtd=Number(f?.parcelas),total=centavos(f?.valorTotal),entrada=f?.modalidade==='Entrada e parcelas'?centavos(f?.entrada):0,parcela=centavos(f?.valorParcela);
 return Number.isInteger(qtd)&&qtd>0&&[total,entrada,parcela].every(Number.isFinite)?texto(total-entrada-parcela*(qtd-1)):'';
}

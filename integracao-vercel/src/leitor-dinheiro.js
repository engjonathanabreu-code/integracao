// Leitor único de valores em reais digitados em formulários.
// Formato brasileiro: ponto só separa milhar (grupos de três) e vírgula só separa centavos.
//   "15.000" = 15000 · "15.000,50" = 15000,50 · "15000" = 15000 · "15,5" = 15,50
// Qualquer outra escrita ("1.5", "1500.50", "1,234", "15.00", "0.500", "-5") é RECUSADA:
// o leitor nunca adivinha o que a pessoa quis dizer. Valores que já são número
// (vindos do Financeiro) passam sem alteração.
export const FORMATO_DINHEIRO='use ponto só para milhar e vírgula para centavos, por exemplo 15.000,00.';
const PADRAO=/^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{1,2})?$/;
const recusado=()=>({ok:false,vazio:false,valor:null,centavos:null});
export function lerDinheiro(v){
 if(typeof v==='number')return Number.isFinite(v)?{ok:true,vazio:false,valor:v,centavos:Math.round(v*100)}:recusado();
 const s=String(v??'').trim().replace(/^R\$\s*/,'');
 if(!s)return {ok:true,vazio:true,valor:null,centavos:null};
 if(!PADRAO.test(s))return recusado();
 const [inteiro,decimais='']=s.replaceAll('.','').split(',');
 const centavos=Number(inteiro)*100+Number(decimais.padEnd(2,'0'));
 return Number.isSafeInteger(centavos)?{ok:true,vazio:false,valor:centavos/100,centavos}:recusado();
}
// Substitui o antigo parseNum nas leituras de dinheiro: número, ou null quando vazio ou recusado.
export const numeroDinheiro=v=>lerDinheiro(v).valor;
// '' quando o valor pode ser lido (ou está vazio); senão, a mensagem para a tela.
export const erroDinheiro=(v,nome='Valor')=>lerDinheiro(v).ok?'':`${nome}: formato não reconhecido ("${String(v).trim()}"). Para não gravar um valor errado, ${FORMATO_DINHEIRO}`;
// Texto a gravar: tira o ponto de milhar de um valor válido, porque os leitores
// antigos da sincronização com o Financeiro entendem "15.000" como 15. Não mexe em mais nada.
export const semPontoDeMilhar=v=>typeof v==='string'&&v.includes('.')&&lerDinheiro(v).ok?v.trim().replace(/^R\$\s*/,'').replaceAll('.',''):v;

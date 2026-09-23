import {numeroExtenso} from './cadastros-prf.js';
import {parseNum} from './requisitos-moradores.js';
import {ultimaParcela} from './condicoes-venda.js';
const esc=v=>String(v??'____________').replaceAll('&','&amp;').replaceAll(String.fromCharCode(60),'&lt;').replaceAll(String.fromCharCode(62),'&gt;');
const moeda=v=>parseNum(v)==null?'____________':parseNum(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function moedaExtenso(v){
 const n=parseNum(v);if(n==null)return '____________';
 const cents=Math.round(n*100),inteiro=Math.floor(cents/100),fracao=cents%100;
 const ext=numeroExtenso(inteiro);if(!ext)return moeda(v);
 const palavras=(inteiro||!fracao?ext+(inteiro===1?' real':inteiro>0&&inteiro%1000000===0?' de reais':' reais'):'')+(fracao?(inteiro?' e ':'')+numeroExtenso(fracao)+(fracao===1?' centavo':' centavos'):'');
 return moeda(v)+' ('+palavras+')';
}
export function dadosContrato(d){
 const c=d.condicoes||{},total=parseNum(c.valorTotal),gratuito=/^(Isento|Custeado)/.test(c.modalidade||'');
 const empresa={razaoSocial:'INTEGRAL SOLUÇÕES EM ENGENHARIA',cnpj:'29.212.382/0001-07',endereco:'Rua Tiradentes, nº 262, 1º andar, Bairro Centro, Ibirama/SC, CEP 89.140-000',email:'documentos@minhacasalegal.com',...Object.fromEntries(Object.entries(d.elaboracao||{}).filter(([,v])=>v))};
 const ultima=ultimaParcela(c);
 const ajuste=ultima&&parseNum(ultima)!==parseNum(c.valorParcela)?' A última parcela será de '+moeda(ultima)+' para completar o valor total.':'';
 let pagamento=d.pagamento||'____________';
 if(c.modalidade==='Entrada e parcelas'||c.modalidade==='Parcelado sem entrada'){
  const entrada=c.modalidade==='Entrada e parcelas'?'Em um pagamento inicial no valor de '+moedaExtenso(c.entrada)+', a ser pago no ato da assinatura deste contrato, mais ':'';
  const qtd=Number(c.parcelas),dia=Number(c.diaVencimento);
  pagamento=entrada+(c.parcelas||'___')+(numeroExtenso(qtd)?' ('+numeroExtenso(qtd)+')':'')+' parcelas de '+moedaExtenso(c.valorParcela)+(dia?' com vencimento no dia '+dia+' ('+numeroExtenso(dia)+') de cada mês':'')+(c.primeiroVencimento?', com primeiro vencimento em '+c.primeiroVencimento.split('-').reverse().join('/'):'')+'.';
 }
 const assinatura=(nome,identificacao)=>'<p style="text-align:center;margin-top:30px">________________________________________<br/>'+esc(nome)+'<br/>'+esc(identificacao)+'</p>';
 return {
 contratada:esc(empresa.razaoSocial+', pessoa jurídica de direito privado, devidamente inscrita no CNPJ/MF nº '+empresa.cnpj+', endereço eletrônico '+empresa.email+', com sede em '+empresa.endereco),
 precoContrato:esc(gratuito?d.pagamento:'Pela prestação dos serviços objetivados no presente contrato, a CONTRATANTE se compromete a pagar à CONTRATADA o valor global de '+moedaExtenso(c.valorTotal)+', que será pago conforme estipulado na cláusula quinta deste contrato.'),
 reajusteContrato:esc(!c.reajuste||c.reajuste==='Sem reajuste'?'O valor global ofertado pela CONTRATADA em sua proposta e constante da cláusula terceira deste contrato não sofrerá reajuste.':'O valor global será corrigido pelo '+c.reajuste.replace(' anual','')+', uma vez por ano.'),
 faturamentoContrato:esc(gratuito?d.pagamento:'O preço global acima consignado será pago à CONTRATADA, mediante boleto bancário em forma de carnê fornecido pela CONTRATADA, nos termos dos itens abaixo.'),
 pagamentoContrato:esc(pagamento+ajuste),
 valorAlteracaoContrato:esc(moedaExtenso(total==null?null:Math.round(total*30)/100)),
 assinatura_contrato:'<p style="text-align:center;margin-top:30px">'+esc(d.dataExtenso)+'.</p>'+(d.assinantes?.length?d.assinantes:[[d.nome,d.cpf]]).map(([nome,doc])=>assinatura(nome,'Contratante - CPF/CNPJ '+(doc||'____________'))).join('')+assinatura(empresa.razaoSocial,'Contratada')+assinatura('Testemunha 1: ________________________','CPF: ________________________')+assinatura('Testemunha 2: ________________________','CPF: ________________________')
 };
}

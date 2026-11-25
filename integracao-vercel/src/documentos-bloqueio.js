// Bloqueio da geração de contrato, procuração e distrato quando o cadastro não tem
// tudo o que o texto usa. Função pura: recebe o cadastro e o tipo de documento e
// devolve, em linguagem do Comercial, a lista do que falta. Lista vazia = pode gerar.
// As regras espelham a qualificação completa (gerarQualificacao, em App.jsx), que é o
// texto das partes nesses três documentos.
import {ehPJ,temConjuge,cpfValido,cnpjValido,preenchido,so,COM_CONJUGE} from './requisitos-moradores.js';
import {cpfDispensado} from './pessoa-menor.js';
import {pendenciasPagamento} from './contrato-dados.js';

export const DOCUMENTOS_COM_BLOQUEIO=['contrato','procuracao','distrato'];
export const documentoComBloqueio=tipo=>DOCUMENTOS_COM_BLOQUEIO.includes(tipo);

const DICA_CONJUGE=' (ou marque no cadastro que o cônjuge não é beneficiário)';
const rotuloOutro=(o,i)=>`${i+2}º requerente${preenchido(o?.pessoa?.nome)?` (${String(o.pessoa.nome).trim()})`:''}`;

// Dados de uma pessoa usados na qualificação. "quem" já vem com a preposição ("do cônjuge").
function faltasPessoa(x,quem,ehRequerente,referencia){
 x=x||{};const f=[],falta=campo=>f.push(`${campo} ${quem}`);
 if(ehPJ(x)){
  if(!preenchido(x.nome))falta('Razão social');
  if(!cnpjValido(x.cnpj))falta(preenchido(x.cnpj)?'CNPJ válido':'CNPJ');
  if(!preenchido(x.representante))falta('Representante legal');
  return f;
 }
 if(!preenchido(x.nome))falta('Nome');
 if(ehRequerente&&!preenchido(x.estadoCivil))falta('Estado civil');
 if(!preenchido(x.profissao))falta('Profissão');
 if(!preenchido(x.rg))falta('RG');
 if(!cpfDispensado(x,referencia)&&!cpfValido(x.cpf))falta(preenchido(x.cpf)?'CPF válido':'CPF');
 if(!preenchido(x.mae))falta('Nome da mãe');
 return f;
}
// Cônjuge de quem está casado ou em união estável: sem ele o texto sairia só com um dos dois.
function faltasCasal(titular,conjuge,quemTitular,quemConjuge,referencia){
 if(ehPJ(titular)||!COM_CONJUGE.includes(titular?.estadoCivil)||conjuge?.beneficiario==='nao')return [];
 if(!preenchido(conjuge?.nome))return [`Nome ${quemConjuge}${DICA_CONJUGE}`];
 const f=faltasPessoa(conjuge,quemConjuge,false,referencia);
 if(titular.estadoCivil==='Casado(a)'&&!preenchido(titular.regimeBens))f.push(`Regime de bens do casamento ${quemTitular}`);
 return f;
}
function faltasEndereco(e){
 e=e||{};
 const partes=[['logradouro','rua'],['numero','número'],['bairro','bairro'],['municipio','município'],['uf','UF']].filter(([k])=>!preenchido(e[k])).map(([,nome])=>nome);
 if(so(e.cep).length!==8)partes.push('CEP');
 return partes.length?[`Endereço do requerente (${partes.join(', ')})`]:[];
}

export function pendenciasQualificacao(p,referencia){
 p=p||{};const r=p.requerente||{},f=[];
 f.push(...faltasPessoa(r,'do requerente principal',true,referencia));
 if(p.requerente&&temConjuge(p))f.push(...faltasCasal(r,p.conjuge,'do requerente principal','do cônjuge',referencia));
 f.push(...faltasEndereco(p.endereco));
 (p.corequerentes||[]).filter(o=>o?.beneficiario!=='nao').forEach((o,i)=>{
  const rotulo=rotuloOutro(o,i);
  f.push(...faltasPessoa(o.pessoa,`do ${rotulo}`,true,referencia));
  f.push(...faltasCasal(o.pessoa,o.conjuge,`do ${rotulo}`,`do cônjuge do ${rotulo}`,referencia));
  if(o.tipo==='menor'||o.tipo==='representado'){
   const rep=o.representanteId==='principal'?r.nome:(p.corequerentes||[]).find(k=>k.id===o.representanteId)?.pessoa?.nome;
   if(!preenchido(rep))f.push(`Representante legal do ${rotulo}`);
  }
 });
 return f;
}

// opcoes.condicoes: forma de pagamento em vigor para o cliente (própria ou do núcleo).
// opcoes.qualificacao: texto da qualificação completa já gerado pela tela. Serve de rede de
// segurança: se ainda houver campo entre colchetes que as regras acima não listaram, o
// documento também fica bloqueado, em vez de trocar o texto por uma versão resumida.
export function pendenciasDocumento(tipo,p,opcoes={}){
 if(!documentoComBloqueio(tipo))return [];
 const f=pendenciasQualificacao(p,opcoes.referencia);
 if(!f.length)for(const [,campo] of String(opcoes.qualificacao||'').matchAll(/\[([^\]]+)\]/g))f.push(`Qualificação: ${campo}`);
 // Só o contrato imprime preço e parcelas; procuração e distrato não dependem da forma de pagamento.
 if(tipo==='contrato')f.push(...pendenciasPagamento(opcoes.condicoes));
 return [...new Set(f)];
}
// Junta a lista detalhada com as conferências antigas da tela, sem repetir o que a
// detalhada já cobre (nome, CPF/CNPJ e endereço do requerente).
export function unirPendencias(detalhadas,antigas=[]){
 return [...detalhadas,...antigas.filter(x=>!['nome do requerente','CPF','CNPJ','endereço'].includes(x))];
}

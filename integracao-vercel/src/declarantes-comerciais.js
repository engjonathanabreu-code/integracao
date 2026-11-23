import {pessoasDocumentais} from './documentos-pessoas.js';
import {menorDeIdade,cpfDispensado} from './pessoa-menor.js';
import {cpfValido,cnpjValido,ehPJ} from './requisitos-moradores.js';

export const documentoPorDeclarante = tipo => ['dec_renda','termo_veracidade'].includes(tipo);

export function declarantesComerciais(ficha,referencia) {
  return pessoasDocumentais(ficha).filter(({papel,pessoa})=>papel!=='ocupante'&&typeof pessoa.nome==='string'&&pessoa.nome.trim()).map(item=>{
    const {id,papel,pessoa}=item;
    const parte=id.startsWith('corequerentes:') ? (ficha.corequerentes||[]).find(x=>id===`corequerentes:${x.id}`||id===`corequerentes:${x.id}:conjuge`) : null;
    const rotulo={requerente:'Requerente principal',conjuge:'Cônjuge',corequerente:'Outro requerente','conjuge de corequerente':'Cônjuge de outro requerente'}[papel];
    const eConjuge=papel==='conjuge'||papel==='conjuge de corequerente';
    const pj=ehPJ(pessoa);
    const representado=menorDeIdade(pessoa,referencia)||papel==='corequerente'&&['menor','representado'].includes(parte?.tipo);
    const rep=parte?.representanteId==='principal'?ficha.requerente:(ficha.corequerentes||[]).find(x=>x.id===parte?.representanteId&&!['menor','representado'].includes(x.tipo))?.pessoa;
    const cpfRepresentante=pessoa.cpfRepresentante||pessoa.representanteCpf;
    const representante=pj?{nome:pessoa.representante,cpf:cpfValido(cpfRepresentante)?cpfRepresentante:''}:representado?rep:null;
    const falta=[];
    if(pj ? !cnpjValido(pessoa.cnpj) : !cpfDispensado(pessoa,referencia)&&!cpfValido(pessoa.cpf))falta.push(pj?'CNPJ válido do declarante':'CPF válido do declarante');
    if((pj||representado)&&(!representante?.nome?.trim()||(!pj&&(!cpfValido(representante.cpf)||ehPJ(representante)||menorDeIdade(representante,referencia)||representante===pessoa)))) falta.push('representante válido no cadastro');
    return {...item,rotulo,representado,representante,falta,
      estadoCivil:pessoa.estadoCivil||(eConjuge?(parte?.pessoa||ficha.requerente)?.estadoCivil:'')||''};
  });
}

export function opcoesDeclaracao(ficha,tipo,referencia) {
  return documentoPorDeclarante(tipo)?declarantesComerciais(ficha,referencia):[];
}

import {montar,dadosExemplo} from './documentos-comerciais.fixture.js';
// Synthetic names and identifiers only.
export function contratoSintetico(casal=false){
 const d={...dadosExemplo,condicoes:{modalidade:'Entrada e parcelas',valorTotal:'6000',entrada:'1200',parcelas:'12',valorParcela:'400',diaVencimento:'10',primeiroVencimento:'2026-12-10',reajuste:'Sem reajuste'},conjugeBeneficiario:casal,estadoCivil:casal?'casada':'solteira',conjuge:casal?dadosExemplo.conjuge:'',cpfConjuge:casal?dadosExemplo.cpfConjuge:'',assinantes:casal?[[dadosExemplo.nome,dadosExemplo.cpf],[dadosExemplo.conjuge,dadosExemplo.cpfConjuge]]:[[dadosExemplo.nome,dadosExemplo.cpf]]};
 if(casal)d.qualificacao='Maria Aparecida de Oliveira da Silva, brasileira, casada, autônoma, CPF 000.000.000-00, RG 0000000 e João Carlos de Oliveira da Silva, brasileiro, casado, autônomo, CPF 111.111.111-11, RG 1111111, residentes à Rua das Flores, nº123, Centro, Município Exemplo/SC';
 return montar('contrato',d,{},{});
}

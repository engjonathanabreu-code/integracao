export const tipoDistrato=d=>d?.tipo||'devolucao';
export function validarDistrato(d,numero){
 if(!['devolucao','multa','sem_acerto'].includes(tipoDistrato(d)))return 'Escolha o tipo de distrato.';
 if((d.motivo||'').trim().length<10)return 'Descreva o motivo do distrato com pelo menos 10 caracteres.';
 if(tipoDistrato(d)==='multa'&&(!(numero(d.valorMulta)>0)||!d.vencimentoMulta||!(d.formaMulta||'').trim()))return 'Informe valor da multa maior que zero, vencimento e forma de pagamento à empresa.';
 return '';
}
export function textoAcertoDistrato(d,moeda,extenso,numero){
 if(!d)return '____________';
 if(tipoDistrato(d)==='sem_acerto')return 'O distrato será realizado sem multa e sem devolução de valores por qualquer das partes.';
 if(tipoDistrato(d)==='multa')return `O CONTRATANTE pagará à CONTRATADA multa de ${moeda(d.valorMulta)} (${extenso(numero(d.valorMulta))}), com vencimento em ${d.vencimentoMulta?.split('-').reverse().join('/')||'____________'}, por ${d.formaMulta||'____________'}. Não haverá devolução de valores pela CONTRATADA.`;
 const total=numero(d.valorDevolucao);if(!(total>0))return 'Não há valores a devolver.';
 const qtd=parseInt(d.parcelas,10)||0,forma=d.formaDevolucao==='carne'?'por meio de carnê':`por PIX${d.pixChave?` (chave ${d.pixTipo?`${d.pixTipo} `:''}${d.pixChave})`:''}`;
 if(qtd>1)return `A CONTRATADA devolverá ${moeda(total)} (${extenso(total)}) em ${qtd} parcelas de ${moeda(d.valorParcela)}, com vencimento todo dia ${d.diaVencimento||'___'}, ${forma}.`;
 return `A CONTRATADA devolverá ${moeda(total)} (${extenso(total)}) em parcela única, ${forma}.`;
}

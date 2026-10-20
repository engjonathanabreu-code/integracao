// "sim" used to be the automatic default, so it cannot prove an explicit choice.
// A legacy "nao" was never a default and remains a valid negative choice.
export function beneficiarioConjuge(conjuge = {}) {
  if (Object.hasOwn(conjuge, 'beneficiarioTitulo')) return ['sim', 'nao'].includes(conjuge.beneficiarioTitulo) ? conjuge.beneficiarioTitulo : '';
  return conjuge.beneficiario === 'nao' ? 'nao' : '';
}

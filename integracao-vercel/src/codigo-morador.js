export const normalizarCodigoMorador = valor => String(valor ?? '').trim().toUpperCase();
const identidade = valor => String(valor ?? '').trim().toLowerCase();
const mesmoMorador = (p, atual) => {
  const ids = typeof atual === 'object' && atual ? [atual.id, atual.financeiroRef] : [atual];
  return [p.id, p.financeiroRef].some(id => identidade(id) && ids.some(outro => identidade(outro) === identidade(id)));
};
export function erroCodigoMorador(codigo, processos, idAtual) {
  const valor = normalizarCodigoMorador(codigo);
  if (!valor) return 'Informe o código do morador.';
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(valor)) return 'Use até 64 letras, números, hífens ou sublinhados no código.';
  if (processos.some(p => !mesmoMorador(p, idAtual) && normalizarCodigoMorador(p.codigo) === valor)) return 'Este código já pertence a outro morador.';
  return '';
}
export function resolverCodigoMorador({ atual, rascunho, processos }) {
  // Vincular ou mover entre remessas não é uma solicitação para renumerar.
  if (normalizarCodigoMorador(rascunho.codigo) === normalizarCodigoMorador(atual.codigo)) return null;
  const codigo = normalizarCodigoMorador(rascunho.codigo);
  const erro = erroCodigoMorador(codigo, processos, atual);
  if (erro) throw new Error(erro);
  const sufixo = codigo.match(/(\d+)$/)?.[1];
  const numeroCliente = Number(sufixo) || 0;
  return { codigo, numeroCliente };
}

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
// Keep legacy safe numbers and serialize larger integers as exact decimal strings.
function numeroSerializavel(numero) {
  return numero <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(numero) : numero.toString();
}

export function proximoNumeroMorador(processos, remessaId) {
  let maior = 0n;
  for (const p of processos) {
    if (p.remessaId !== remessaId) continue;
    const armazenado = p.numeroCliente;
    const exato = typeof armazenado === 'string' && /^\d+$/.test(armazenado) && BigInt(armazenado) > 0n
      ? armazenado
      : Number.isSafeInteger(armazenado) && armazenado > 0 ? armazenado : null;
    const trecho = String(p.codigo ?? '').split('_')[1] || p.codigo || '';
    const digitos = String(trecho).replace(/\D/g, '');
    const numero = BigInt(exato ?? (digitos || '0'));
    if (numero > maior) maior = numero;
  }
  return numeroSerializavel(maior + 1n);
}

export function numeroDoCodigoMorador(codigo) {
  const sufixo = String(codigo ?? '').match(/(\d+)$/)?.[1];
  return numeroSerializavel(BigInt(sufixo || '0'));
}

export function resolverCodigoMorador({ atual, rascunho, processos }) {
  // Vincular ou mover entre remessas não é uma solicitação para renumerar.
  if (normalizarCodigoMorador(rascunho.codigo) === normalizarCodigoMorador(atual.codigo)) return null;
  const codigo = normalizarCodigoMorador(rascunho.codigo);
  const erro = erroCodigoMorador(codigo, processos, atual);
  if (erro) throw new Error(erro);
  const numeroCliente = numeroDoCodigoMorador(codigo);
  return { codigo, numeroCliente };
}

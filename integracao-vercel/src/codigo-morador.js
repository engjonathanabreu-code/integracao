export const normalizarCodigoMorador = valor => String(valor ?? '').trim().toUpperCase();
export function erroCodigoMorador(codigo, processos, idAtual) {
  const valor = normalizarCodigoMorador(codigo);
  if (!valor) return 'Informe o código do morador.';
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(valor)) return 'Use até 64 letras, números, hífens ou sublinhados no código.';
  if (processos.some(p => p.id !== idAtual && normalizarCodigoMorador(p.codigo) === valor)) return 'Este código já pertence a outro morador.';
  return '';
}
export function resolverCodigoMorador({ atual, rascunho, processos, codigoAutomatico, numeroAutomatico }) {
  const editado = rascunho.codigo !== atual.codigo;
  const mudouRemessa = rascunho.remessaId !== atual.remessaId;
  if (!editado && !mudouRemessa) return null;
  const codigo = editado ? normalizarCodigoMorador(rascunho.codigo) : codigoAutomatico;
  const erro = erroCodigoMorador(codigo, processos, atual.id);
  if (erro) throw new Error(erro);
  const sufixo = codigo.match(/(\d+)$/)?.[1];
  const numeroCliente = editado ? Number(sufixo) || 0 : numeroAutomatico;
  return { codigo, numeroCliente };
}

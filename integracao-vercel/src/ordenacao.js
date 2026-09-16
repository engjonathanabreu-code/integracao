const comparador = new Intl.Collator('pt-BR', { sensitivity:'base', numeric:true });
const vazio = v => v == null || (typeof v === 'string' && !v.trim()) || (typeof v === 'number' && !Number.isFinite(v));
export function ordenarLinhas(linhas, valor, direcao = 'asc') {
  if (!valor) return linhas;
  return linhas.map((item, indice) => ({item, indice, valor:valor(item)})).sort((a,b) => {
    const va=vazio(a.valor), vb=vazio(b.valor);
    if (va || vb) return va === vb ? a.indice-b.indice : va ? 1 : -1;
    const comparacao = typeof a.valor === 'number' && typeof b.valor === 'number' ? a.valor-b.valor : comparador.compare(String(a.valor),String(b.valor));
    return (direcao === 'desc' ? -comparacao : comparacao) || a.indice-b.indice;
  }).map(x=>x.item);
}

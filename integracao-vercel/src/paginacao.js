// Paginação na tela (cliente): não altera consultas nem os dados, só o trecho desenhado.
export const MORADORES_POR_PAGINA = 100;
export function faixaDaPagina(total, pagina = 0, porPagina = MORADORES_POR_PAGINA) {
  const itens = Math.max(0, Math.floor(Number(total) || 0));
  const tamanho = Math.max(1, Math.floor(Number(porPagina) || 0));
  const paginas = Math.max(1, Math.ceil(itens / tamanho));
  const atual = Math.min(Math.max(0, Math.floor(Number(pagina) || 0)), paginas - 1);
  const inicio = atual * tamanho, fim = Math.min(itens, inicio + tamanho);
  return { total: itens, paginas, atual, inicio, fim };
}
export function textoDaFaixa({ total, paginas, atual, inicio, fim }, nome = 'moradores') {
  return total ? `${inicio + 1}–${fim} de ${total} ${nome} · Página ${atual + 1} de ${paginas}` : '';
}

// Only separate numbered actions. Content remains plain text, never HTML.
export function separarAcoes(texto) {
  const introducao = [], itens = [];
  for (const linha of String(texto || '').replace(/\r\n?/g, '\n').split('\n')) {
    const inicio = linha.match(/^\s*(?:\*\*)?\d{1,2}[.)](?:\*\*)?\s+(.+)$/);
    if (inicio) {
      const tituloInteiroEmNegrito = /^\s*\*\*\d{1,2}[.)]\s+/.test(linha);
      itens.push((tituloInteiroEmNegrito ? '**' : '') + inicio[1]);
    }
    else if (itens.length) itens[itens.length - 1] += `\n${linha}`;
    else introducao.push(linha);
  }
  return { introducao: introducao.join('\n').trim(), itens: itens.map(t => t.trim()) };
}

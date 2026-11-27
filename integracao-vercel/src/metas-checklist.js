// EDI-M2: a edição da meta aplica ao checklist somente o que mudou no formulário
// (itens adicionados, removidos, renomeados ou marcados), sobre a lista atual.
// O que um colega alterou enquanto o formulário estava aberto é preservado.
const limpar = itens => (itens || []).map(x => ({ ...x, titulo: String(x.titulo || '').trim() })).filter(x => x.titulo);

export function mesclarChecklistEditado(atual, inicial, final, novoId = () => undefined) {
  const antes = limpar(inicial), depois = limpar(final), lista = atual || [];
  const noInicio = new Map(antes.filter(x => x.id != null).map(x => [x.id, x]));
  const noFim = new Map(depois.filter(x => x.id != null).map(x => [x.id, x]));
  const removidos = lista.filter(c => noInicio.has(c.id) && !noFim.has(c.id));
  const checklist = lista.filter(c => !removidos.includes(c)).map(c => {
    const de = noInicio.get(c.id), para = noFim.get(c.id);
    if (!de || !para) return c;
    const proximo = { ...c };
    if (para.titulo !== de.titulo) proximo.titulo = para.titulo;
    if (!!para.concluido !== !!de.concluido) proximo.concluido = !!para.concluido;
    return proximo;
  });
  const adicionados = depois.filter(x => x.id == null || !noInicio.has(x.id))
    .filter(x => x.id == null || !lista.some(c => c.id === x.id))
    .map(x => ({ id: x.id || novoId(), titulo: x.titulo, concluido: !!x.concluido }));
  return { checklist: [...checklist, ...adicionados], adicionados, removidos };
}

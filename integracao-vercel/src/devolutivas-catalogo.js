// A projection keeps every historical goal, file and analysis in its original
// row. Linked goals carry their own authorized snapshot for the assigned user.
export function catalogoDevolutivas(metas = []) {
  const registros = new Map();
  for (const meta of metas.filter(m => m.devolutiva)) {
    const id = meta.devolutiva.registroId || meta.id;
    const atual = registros.get(id);
    if (!atual) registros.set(id, { id, meta, vinculadas: [meta] });
    else { atual.vinculadas.push(meta); if (meta.id === id) atual.meta = meta; }
  }
  return [...registros.values()];
}

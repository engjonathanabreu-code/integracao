// Only request cards already returned by the user's RLS-protected CRM query.
// Keep the same authenticated REST path and policies; never use a service key.
export async function carregarResumosChatwoot(cards, listar, ativo = () => true) {
  const ids = [...new Set(cards.map(c => c.id))];
  if (ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error('Identificador de card inválido. Atualize o CRM.');
  }
  const resumos = [];
  for (let inicio = 0; inicio < ids.length; inicio += 25) {
    if (!ativo()) return null;
    const lote = ids.slice(inicio, inicio + 25);
    const linhas = await listar('integracao_crm_chatwoot_resumo', `&card_id=in.(${lote.join(',')})`);
    if (!ativo()) return null;
    // Ignore unexpected rows rather than leaking another card into this view.
    const permitidos = new Set(lote);
    resumos.push(...linhas.filter(l => permitidos.has(l.card_id)));
  }
  return resumos;
}

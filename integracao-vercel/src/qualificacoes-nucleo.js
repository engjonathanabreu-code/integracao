// A visão consolidada consulta o cadastro; não mantém uma segunda qualificação.
export function resolverQualificacaoCadastro(processo, gerar, modo = 'completa') {
  const q = processo?.qualificacao || {};
  const salvo = q.textos?.[modo];
  const origem = q.origem?.[modo] || '';
  const gerado = ['simples', 'completa'].includes(modo) ? gerar(processo, modo) : null;
  const temSalvo = salvo !== undefined && salvo !== null && salvo !== '';
  return {
    texto: temSalvo ? String(salvo) : gerado?.texto || '',
    faltas: [...new Set(gerado && (origem === 'gerada' || !temSalvo) ? gerado.faltas || [] : q.faltas?.[modo] || [])],
    origem,
    desatualizada: !!q.desatualizada && origem !== 'gerada',
  };
}

export function textoLimpoQualificacao(valor) {
  const texto = String(valor || '');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(texto, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,template').forEach(n => n.remove());
    doc.querySelectorAll('br').forEach(n => n.replaceWith(doc.createTextNode('\n')));
    doc.querySelectorAll('p,div,li').forEach(n => n.append(doc.createTextNode('\n')));
    return (doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  // Fora do navegador, continua sem entregar tags ou conteúdo executável.
  return texto.replace(/<(script|style|iframe|object|embed|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, '&').trim();
}

export function prepararQualificacoesCopia(processos, resolver) {
  return processos.map(p => {
    const nome = p.requerente?.nome || 'Nome não informado';
    const codigo = p.codigo || 'Sem código';
    const q = resolver(p);
    return `${codigo} — ${nome}\n${textoLimpoQualificacao(q.texto) || 'Qualificação não informada.'}`;
  }).join('\n\n');
}

// A carga em lote percorre todas as páginas; divergências ou respostas incompletas
// interrompem a ação, em vez de copiar silenciosamente só a primeira página.
export async function carregarTodasQualificacoes(carregarPagina, consulta, { limite = 100, maximo = 50000 } = {}) {
  const itens = [], ids = new Set();
  let totalEsperado;
  for (let offset = 0; ; offset += limite) {
    const pagina = await carregarPagina({ ...consulta, offset, limit: limite });
    if (!Array.isArray(pagina?.items) || !Number.isInteger(pagina.total) || pagina.total < 0) throw new Error('Não foi possível confirmar a lista completa de moradores. Atualize e tente novamente.');
    if (totalEsperado === undefined) totalEsperado = pagina.total;
    if (pagina.total !== totalEsperado) throw new Error('A lista de moradores mudou durante a consulta. Atualize e tente novamente.');
    if (totalEsperado > maximo) throw new Error('Há muitos resultados. Refine a busca para copiar as qualificações.');
    for (const p of pagina.items) {
      if (!p.id || ids.has(p.id)) throw new Error('A consulta retornou moradores repetidos. Atualize a lista.');
      ids.add(p.id); itens.push(p);
    }
    if (itens.length === totalEsperado) return itens;
    if (itens.length > totalEsperado || pagina.items.length < limite) throw new Error('A lista recebida está incompleta. Nenhuma qualificação foi copiada.');
  }
}

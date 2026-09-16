const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export function filtrarProcessos(nucleos, { etapa = '', busca = '', municipio = '' } = {}, etapaDe, rotuloDe) {
  const termo = normalizar(busca);
  return nucleos.filter(n => (!etapa || etapaDe(n) === etapa)
    && (!municipio || n.municipioId === municipio)
    && (!termo || normalizar(`${rotuloDe(n)} ${n.nome || ''} ${n.responsavel || ''} ${n.pendencia || ''}`).includes(termo)));
}

export function municipiosDosProcessos(municipios, nucleos) {
  const ids = new Set(nucleos.map(n => n.municipioId));
  return municipios.filter(m => ids.has(m.id)).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || String(a.uf || '').localeCompare(String(b.uf || '')));
}

export function etapasDosProcessos(padroes, nucleos, etapaDe) {
  return [...new Set([...padroes, ...nucleos.map(etapaDe)])];
}

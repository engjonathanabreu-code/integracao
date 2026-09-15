// O histórico antigo identifica procuradores pelo nome; novas emissões guardam ID e cópia dos dados.
const normal = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function procuraUsaRepresentante(documento, representante) {
  if (documento.tipo !== 'procuracao') return false;
  if ((documento.representantes || []).some((r) => r.id === representante.id || normal(r.nome) === normal(representante.nome))) return true;
  if ((documento.procuradores || []).some((r) => (typeof r === 'string' ? normal(r) : normal(r.nome)) === normal(representante.nome))) return true;
  return !!normal(representante.nome) && normal(documento.condicoes).replace(/^para\s+/, '').split(/[,;]\s*/).some((nome) => nome.trim() === normal(representante.nome));
}
export function contarProcuracoes(processos, representante) {
  return (processos || []).reduce((total, p) => total + (p.documentosGerados || []).filter((g) => procuraUsaRepresentante(g, representante)).length, 0);
}

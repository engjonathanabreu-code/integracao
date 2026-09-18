import {normalizar} from './requisitos-moradores.js';
import {dadosVisiveis} from './arquivamento.js';

export function reunirClientes(clientes, complementos, db) {
  const porReferencia = new Map(complementos.filter(e => e.referencia_id).map(e => [e.referencia_id, e]));
  const usados = new Set();
  const registros = clientes.map(c => {
    const e = porReferencia.get(c.id);
    if (e) usados.add(e.registro_id);
    return {...e?.dados, id:e?.registro_id || c.id, financeiroRef:c.id, municipioId:c.municipio_id, remessaId:c.remessa_id, codigo:c.codigo, requerente:{...e?.dados?.requerente, nome:c.nome}};
  });
  for (const e of complementos) if (!usados.has(e.registro_id)) registros.push({...e.dados, id:e.registro_id});
  const unicos = new Map(registros.map(p => [p.id, p]));
  const idsPorReferencia = new Map(registros.filter(p=>p.financeiroRef).map(p=>[p.financeiroRef,p.id]));
  for (const p of db.processos || []) if (!p._resumo) {
    if (p.financeiroRef) unicos.delete(idsPorReferencia.get(p.financeiroRef));
    unicos.set(p.id, p);
  }
  return dadosVisiveis({...db, processos:[...unicos.values()]}).processos;
}

export function filtrarClientes(clientes, busca, municipioId) {
  const termo = normalizar(busca.trim());
  if (!termo) return [];
  return clientes.filter(p => (!municipioId || p.municipioId === municipioId)
    && [p.requerente?.nome, p.codigo].some(v => normalizar(v || '').includes(termo)))
    .sort((a,b) => (a.requerente?.nome || '').localeCompare(b.requerente?.nome || '', 'pt-BR') || String(a.codigo || '').localeCompare(String(b.codigo || '')) || a.id.localeCompare(b.id));
}

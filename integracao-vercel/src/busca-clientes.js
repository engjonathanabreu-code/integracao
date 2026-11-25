import {compararTextos} from './ordenacao.js';
import {normalizar} from './requisitos-moradores.js';
import {dadosVisiveis} from './arquivamento.js';

export function reunirClientes(clientes, complementos, db, incluirArquivados=false) {
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
  return incluirArquivados?[...unicos.values()]:dadosVisiveis({...db, processos:[...unicos.values()]}).processos;
}

export function filtrarClientes(clientes, busca, municipioId, {incluirConjuge=false}={}) {
  const termo = normalizar(busca.trim());
  if (!termo) return [];
  return clientes.filter(p => (!municipioId || p.municipioId === municipioId)
    && [p.requerente?.nome, p.codigo, incluirConjuge?p.conjuge?.nome:null].some(v => normalizar(v || '').includes(termo)))
    .sort((a,b) => compararTextos(a.requerente?.nome,b.requerente?.nome) || compararTextos(a.codigo,b.codigo) || compararTextos(a.id,b.id));
}

// Regras de exibição da busca: a base tem milhares de clientes, então a lista só abre com
// um termo mínimo e desenha um lote por vez. Todos os resultados continuam alcançáveis.
export const MINIMO_BUSCA_CLIENTES = 2;
export const LOTE_BUSCA_CLIENTES = 50;
export function termoBuscaSuficiente(busca, minimo = MINIMO_BUSCA_CLIENTES) {
  return normalizar(String(busca || '').trim()).length >= minimo;
}
export function limitarResultados(resultados = [], limite = LOTE_BUSCA_CLIENTES) {
  const teto = Math.max(0, Math.floor(Number(limite) || 0));
  const visiveis = resultados.length > teto ? resultados.slice(0, teto) : resultados;
  return { visiveis, total: resultados.length, restantes: resultados.length - visiveis.length };
}

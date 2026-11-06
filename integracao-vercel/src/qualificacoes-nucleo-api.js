import { requisicao } from './dados-compartilhados.js';

// O RPC faz a mesma precedência usada por projetar(): campos canônicos de
// fin_receb_clientes + campos próprios de integracao_moradores (ou legado).
// Estes objetos vazios só completam o shape em leitura; não criam informação.
export function completarMoradorQualificacao(p) {
  const objeto = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return { ...p, requerente: objeto(p.requerente), conjuge: objeto(p.conjuge), endereco: objeto(p.endereco), corequerentes: Array.isArray(p.corequerentes) ? p.corequerentes : [], ocupantes: Array.isArray(p.ocupantes) ? p.ocupantes : [] };
}
export function criarCarregadorQualificacoes(enviar = requisicao) {
  return async ({ nucleoId, busca = '', ids = null, offset = 0, limit = 30 }) => {
    const r = await enviar('rpc/integracao_qualificacoes_nucleo', { method: 'POST', body: JSON.stringify({ p_nucleo: nucleoId, p_busca: busca, p_ids: ids, p_inicio: offset, p_limite: limit }) });
    if (!Array.isArray(r?.items) || !Number.isInteger(r.total)) throw new Error('Não foi possível carregar a lista completa de moradores.');
    return { ...r, items: r.items.map(completarMoradorQualificacao) };
  };
}
export const carregarQualificacoesNucleo = criarCarregadorQualificacoes();

import { dadosVisiveis } from './arquivamento.js';
import { ativo } from './requisitos-moradores.js';

// The catalog is loaded before resident details/summaries. An absent local
// resident is not proof that a nucleus is empty. Use the authorized catalog;
// the existing municipality loader fetches details on demand, with normal RLS.
export function nucleosParaCampoOffline(db) {
  return dadosVisiveis(db)?.nucleos || [];
}

export function dadosParaPacoteOffline(db, nucleoId) {
  if (!db) throw new Error('Não foi possível carregar os dados do núcleo. Tente novamente.');
  const dados = dadosVisiveis(db);
  if (!dados.nucleos.some(n => n.id === nucleoId)) {
    throw new Error('Este núcleo não está mais disponível para pré-carregar.');
  }
  const moradores = dados.processos.filter(p => p.nucleoId === nucleoId && ativo(p));
  if (moradores.some(p => p._resumo)) {
    throw new Error('Os moradores ainda não foram carregados por completo. Tente novamente com internet.');
  }
  if (!moradores.length) {
    throw new Error('Este núcleo não tem moradores ativos disponíveis para pré-carregar. Confira o vínculo dos moradores no cadastro.');
  }
  return dados;
}

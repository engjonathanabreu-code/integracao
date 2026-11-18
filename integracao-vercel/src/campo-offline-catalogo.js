import { dadosVisiveis } from './arquivamento.js';
import { ativo } from './requisitos-moradores.js';

// The catalog is loaded before resident details/summaries. An absent local
// resident is not proof that a nucleus is empty. Use the authorized catalog;
// the existing municipality loader fetches details on demand, with normal RLS.
export function nucleosParaCampoOffline(db, municipiosCarregados = []) {
  const dados = dadosVisiveis(db);
  if (!dados) return [];
  const completos = new Set(municipiosCarregados);
  // Filter only after a successful full municipality load, never by name,
  // origin, missing summary, or a guessed link between homonyms.
  const contagens = contagemMoradoresPorNucleo(dados);
  return dados.nucleos.filter(n => !completos.has(n.municipioId) || contagens.has(n.id));
}

export function municipioCompletoParaCampo(db, municipioId) {
  return !!db && !!municipioId && !db.processos.some(p => p.municipioId === municipioId && p._resumo);
}

export function contagemMoradoresPorNucleo(db) {
  const contagens = new Map();
  for (const p of dadosVisiveis(db)?.processos || []) {
    if (p.nucleoId && ativo(p)) contagens.set(p.nucleoId, (contagens.get(p.nucleoId) || 0) + 1);
  }
  return contagens;
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
    throw new Error('Este registro não tem moradores ativos vinculados. Os núcleos com moradores deste município estão atualizados na lista; escolha o núcleo pela remessa e pelo nome do cadastro.');
  }
  return dados;
}

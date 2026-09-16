// Adaptação ao cadastro projetado do Integração. Os seis arquivos recebidos ficam intactos.
import { conferirPoligono } from './memoriaisCalculos.js';

export const CAMPOS_MEMORIAL = ['vertices', 'area', 'perimetro', 'memorial'];
export function unidadesParaMemoriais(processos, nucleoId) {
  return processos.filter(p => p.nucleoId === nucleoId && !p._resumo).flatMap(p => (p.unidades || []).map((u, indice) => ({
    ...u, id: JSON.stringify([p.id, u.id]), moradorId: p.id, unidadeId: u.id,
    codigo: `${p.codigo}${p.unidades.length > 1 ? String.fromCharCode(65 + indice) : ''}`,
    requerente: p.requerente?.nome || '',
    morador: { codigo: p.codigo, dados: { enderecoImovel: p.enderecoImovel || {}, qualificacaoRequerente: { quali_memorial: p.qualificacao?.textos?.memorial || '' } } },
  })));
}
export function salvarUnidadeMemorial(db, unidade, dados, nucleoId) {
  const morador = db.processos.find(p => p.id === unidade.moradorId && p.nucleoId === nucleoId && !p._resumo);
  const atual = morador?.unidades?.find(u => u.id === unidade.unidadeId);
  if (!atual) throw new Error('A unidade não está mais disponível. Reabra o núcleo.');
  // Usa o estado entregue por mutar; nunca atribui o morador/unidades de uma cópia da tela.
  // Não perde uma revisão dos mesmos campos recebida enquanto o levantamento estava aberto.
  for (const campo of CAMPOS_MEMORIAL) if (JSON.stringify(atual[campo]) !== JSON.stringify(unidade[campo])) throw new Error('O memorial desta unidade mudou. Reabra a aba antes de salvar para conferir a revisão.');
  const conferencia = conferirPoligono(dados.vertices || []);
  if (!conferencia.valido || !Number.isFinite(dados.area) || !Number.isFinite(dados.perimetro) || typeof dados.memorial !== 'string' || !dados.memorial.trim()) throw new Error('Confira os vértices e o memorial antes de salvar.');
  for (const campo of CAMPOS_MEMORIAL) atual[campo] = structuredClone(dados[campo]);
  return db;
}
export function salvarConfiguracaoMemoriais(db, config) {
  db.memoriais = { ...db.memoriais, sistema: config.sistema, meridiano: config.meridiano, prefixo: config.prefixo, responsavel: { ...db.memoriais?.responsavel, nome: config.responsavel?.nome || '', registro: config.responsavel?.registro || '' } };
  return db;
}
export function contextoDocumentoMemorial(marcadores, hoje = new Date()) {
  const dados = {};
  for (const [caminho, valor] of Object.entries(marcadores)) {
    const partes = caminho.split('.');
    if (partes.some(p => ['__proto__','prototype','constructor'].includes(p))) continue;
    let alvo = dados;
    for (const parte of partes.slice(0,-1)) alvo = alvo[parte] ||= {};
    alvo[partes.at(-1)] = valor;
  }
  dados.documento = { ...dados.documento, dataExtenso: hoje.toLocaleDateString('pt-BR', { day:'numeric', month:'long', year:'numeric' }) };
  return dados;
}

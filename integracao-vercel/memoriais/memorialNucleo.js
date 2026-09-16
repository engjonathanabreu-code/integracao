import { conferirPoligono, processarVertices } from './memoriaisCalculos.js';
import { montarMemorial } from './memoriaisTexto.js';

export const MODELO_MEMORIAL_NUCLEO = `<h2 style="text-align:center">MEMORIAL DESCRITIVO — {{levantamento.nome}}</h2>
<p><strong>Núcleo:</strong> {{nucleo.nome}} — {{nucleo.codigo}}</p>
<p><strong>Localização:</strong> {{municipio.nome}}/{{municipio.uf}}</p>
<p><strong>Área:</strong> {{unidade.area}} m² · <strong>Perímetro:</strong> {{unidade.perimetro}} m</p>
<p style="text-align:justify">{{unidade.memorial}}</p>
<p>{{municipio.nome}}, {{documento.dataExtenso}}</p>
<p style="text-align:center">_____________________________________<br>{{responsavelTecnico.nome}}<br>{{responsavelTecnico.registro}}</p>`;

export function calcularMemorialNucleo(vertices, config) {
  const conferencia = conferirPoligono(vertices);
  if (!conferencia.valido) throw new Error(conferencia.erros.join(' '));
  const calculado = processarVertices(vertices);
  if (!Number.isFinite(calculado.area) || calculado.area <= 0 || !Number.isFinite(calculado.perimetro)) throw new Error('O contorno deve formar uma área válida, maior que zero.');
  return { ...calculado, texto: montarMemorial(calculado.vertices, config) };
}

export function salvarMemorialNucleo(db, nucleoId, anterior, dados, viaId, por, agora = new Date().toISOString()) {
  const n = db.nucleos.find(n => n.id === nucleoId);
  if (!n) throw new Error('Núcleo não encontrado. Reabra o cadastro.');
  const atual = viaId ? n.memorial?.vias?.find(v => v.id === viaId) : n.memorial;
  // Compara somente o levantamento editado: outras vias e chaves continuam preservadas.
  const campos = ['vertices', 'area', 'perimetro', 'texto', ...(viaId ? ['nome'] : [])];
  if (campos.some(c => JSON.stringify(atual?.[c]) !== JSON.stringify(anterior?.[c]))) throw new Error('Este levantamento foi alterado. Reabra-o antes de salvar.');
  const { valido } = conferirPoligono(dados.vertices || []);
  if (!valido || !Number.isFinite(dados.area) || dados.area <= 0 || !Number.isFinite(dados.perimetro) || !dados.texto?.trim() || (viaId && !dados.nome?.trim())) throw new Error('Confira nome, vértices e memorial antes de salvar.');
  const novo = { ...atual, ...Object.fromEntries(campos.map(c => [c, structuredClone(dados[c])])), atualizadoEm: agora, por };
  n.memorial = { ...n.memorial };
  if (viaId) n.memorial.vias = atual ? n.memorial.vias.map(v => v.id === viaId ? { ...novo, id: viaId } : v) : [...(n.memorial.vias || []), { ...novo, id: viaId }];
  else n.memorial = { ...n.memorial, ...novo };
  return db;
}

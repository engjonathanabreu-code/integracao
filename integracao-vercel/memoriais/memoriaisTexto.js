/* Memoriais — montagem do texto do memorial descritivo.
   Porte literal do mod_gerar_memorial do GM 7.5: as frases abaixo são as
   mesmas da planilha, não as reescreva sem combinar com a equipe técnica. */

import { formatarCoordenada, formatarMedida, processarVertices } from "./memoriaisCalculos.js";

export const SISTEMAS = { UTM: "UTM", GEOGRAFICA: "Geográfica" };

const FECHO_UTM = (meridiano) =>
  "Inicial, encerrando esta descrição. Todas as coordenadas aqui descritas encontram-se " +
  `representadas no sistema UTM, referenciadas ao Meridiano Central ${meridiano}, tendo como ` +
  "DATUM SIRGAS 2000. Todos os azimutes e distâncias, área e perímetro foram calculados no " +
  "plano de projeção UTM.";

const FECHO_GEOGRAFICA =
  "Inicial, encerrando esta descrição. Todas as coordenadas aqui descritas encontram-se " +
  "representadas em sistema de coordenadas geográficas, expressas em latitude e longitude, " +
  "referenciadas ao DATUM SIRGAS 2000.";

function trechoDoVertice(v, sistema) {
  const local = sistema === SISTEMAS.GEOGRAFICA
    ? `${v.nome}, de Latitude ${v.latitude} e Longitude ${v.longitude}, `
    : `${v.nome}, de coordenadas N ${formatarCoordenada(v.n)} m e E ${formatarCoordenada(v.e)} m, `;
  const rumo = String(v.confrontante || "").trim()
    ? `deste, segue confrontando com ${String(v.confrontante).trim()}, com os seguintes azimute plano e distância: `
    : "deste, segue com os seguintes azimute plano e distância: ";
  return `${local}${rumo}${v.azimute} e ${formatarMedida(v.distancia)} m; até o Vértice `;
}

/**
 * Monta o parágrafo do memorial descritivo.
 * @param {Array} vertices já processados (com azimute e distância) ou crus
 * @param {Object} opcoes { sistema, meridiano }
 */
export function montarMemorial(vertices, { sistema = SISTEMAS.UTM, meridiano = "" } = {}) {
  const lista = vertices.length && vertices[0].azimute !== undefined
    ? vertices
    : processarVertices(vertices).vertices;
  if (!lista.length) return "";
  let texto = "Inicia-se a descrição deste perímetro no vértice ";
  for (const v of lista) texto += trechoDoVertice(v, sistema);
  texto += sistema === SISTEMAS.GEOGRAFICA ? FECHO_GEOGRAFICA : FECHO_UTM(meridiano);
  return texto;
}

/**
 * Dados que alimentam os marcadores do documento (Capítulo I – Anexo B).
 * Tudo que não for topografia vem do cadastro do morador e do núcleo.
 */
export function dadosDoMemorial({ morador, unidade, nucleo, municipio, responsavel, config }) {
  const imovel = morador?.dados?.enderecoImovel || {};
  const qualificacao = morador?.dados?.qualificacaoRequerente || {};
  return {
    "unidade.codigo": unidade?.codigo || morador?.codigo || "",
    "qualificacao.memorial": qualificacao.quali_memorial || "",
    "imovel.logradouro": imovel.logradouro || "",
    "imovel.numero": imovel.numero || "",
    "imovel.bairro": imovel.bairro || "",
    "imovel.cep": imovel.cep || "",
    "municipio.nome": municipio?.nome || imovel.municipio || "",
    "municipio.uf": municipio?.uf || imovel.uf || "",
    "nucleo.nome": nucleo?.nome || "",
    "nucleo.codigo": nucleo?.codigo || "",
    "unidade.area": formatarMedida(unidade?.area),
    "unidade.perimetro": formatarMedida(unidade?.perimetro),
    "unidade.caracteristicas": unidade?.caracteristicas || "",
    "unidade.memorial": unidade?.memorial || "",
    "responsavelTecnico.nome": responsavel?.nome || config?.responsavel?.nome || "",
    "responsavelTecnico.registro": responsavel?.registro || config?.responsavel?.registro || "",
  };
}

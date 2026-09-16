/* Marcadores do PRF.
   Monta o objeto {{campo}} -> valor a partir do que já existe no cadastro, e
   diz o que continua faltando e de onde teria de vir. */

import { GRUPOS } from "./camposPRF.js";

const texto = (v) => (v === null || v === undefined ? "" : String(v).trim());
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dataPorExtenso(d = new Date()) {
  const data = d instanceof Date ? d : new Date(d);
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`;
}

/** "1.234/2019" + "2019-05-02" -> "1.234/2019, de 02/05/2019" */
export function dataBR(iso) {
  const t = texto(iso);
  if (!t) return "";
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

/** Junta número e ano: "1.234/2019" -> "1.234/2019"; "1234" + data -> "1234/2019" */
function numeroAno(numero, iso) {
  const n = texto(numero);
  if (!n) return "";
  if (n.includes("/")) return n;
  const ano = texto(iso).slice(0, 4);
  return ano ? `${n}/${ano}` : n;
}

/* --------------------------------------------------- contagens do núcleo */

const modalidadeDa = (morador) =>
  texto(morador?.dados?.social?.modalidade || morador?.social?.modalidade).toUpperCase();

/**
 * Conta processos por modalidade a partir de dados.social.modalidade, que é
 * onde o sistema guarda a modalidade de cada processo.
 */
export function contarModalidades(moradores = []) {
  let social = 0, especifico = 0, sem = 0;
  for (const m of moradores) {
    const mod = modalidadeDa(m);
    if (mod === "REURB-S") social++;
    else if (mod === "REURB-E") especifico++;
    else sem++;
  }
  const total = moradores.length;
  const predominante = social === especifico ? "" : social > especifico ? "interesse social" : "interesse específico";
  return {
    total, social, especifico, sem, predominante,
    sufixo: predominante === "interesse social" ? "S" : predominante === "interesse específico" ? "E" : "",
    // na frase "população que {negacao} apresenta os requisitos": vazio para
    // Reurb-S, "não" para Reurb-E
    negacao: predominante === "interesse específico" ? "não" : "",
  };
}

/** Requerentes de uma unidade, a partir da qualificação já montada no cadastro. */
export function requerentesDa(morador) {
  const q = morador?.dados?.qualificacaoRequerente || morador?.qualificacaoRequerente || {};
  const lista = texto(q.assinantes) || texto(q.beneficiarios);
  return lista.replace(/;\s*$/, "").split(";").map((s) => s.trim()).filter(Boolean).join(", ");
}

/** "Lote 07A, Quadra 03" -> { quadra: "03", lote: "07A" } */
export function separarQuadraLote(loteQuadra) {
  const t = texto(loteQuadra);
  if (!t) return { quadra: "", lote: "" };
  const q = t.match(/quadra\s*:?\s*([A-Za-z0-9-]+)/i);
  const l = t.match(/lote\s*:?\s*([A-Za-z0-9-]+)/i);
  if (q || l) return { quadra: q ? q[1] : "", lote: l ? l[1] : "" };
  const partes = t.split(/[,/-]/).map((s) => s.trim()).filter(Boolean);
  return partes.length >= 2 ? { quadra: partes[0], lote: partes[1] } : { quadra: "", lote: t };
}

/* ------------------------------------------------------- mapa completo */

/**
 * @param {Object} ctx { municipio, dadosPRF, nucleo, moradores, elaboracao, emitidoEm }
 * @returns {Object} { marcadores, unidades, faltando }
 */
export function marcadoresPRF({ municipio, dadosPRF, nucleo, moradores = [], elaboracao, emitidoEm } = {}) {
  const d = dadosPRF || {};
  const cont = contarModalidades(moradores);
  const macro = (d.macrozonas || []).find((m) => m.nome === nucleo?.dados?.macrozona) || (d.macrozonas || [])[0] || {};
  const endereco = nucleo?.dados?.endereco || {};

  const marcadores = {
    // núcleo e município
    "nucleo.nome": texto(nucleo?.dados?.nomeIntegrado || nucleo?.nome),
    "nucleo.codigo": texto(nucleo?.dados?.codigo || nucleo?.codigo),
    "nucleo.bairro": texto(endereco.bairro || endereco.localidade),
    "nucleo.zona": texto(nucleo?.dados?.zona) || "Área Urbana",
    "municipio.nome": texto(municipio?.nome || endereco.municipio),
    "municipio.uf": texto(municipio?.uf || endereco.uf),
    "documento.dataExtenso": dataPorExtenso(emitidoEm),

    // contagens — vinham vazias e já existiam no banco
    "nucleo.totalProcessos": cont.total ? String(cont.total) : "",
    "nucleo.processosSocial": cont.total ? String(cont.social) : "",
    "nucleo.processosEspecifico": cont.total ? String(cont.especifico) : "",
    "nucleo.modalidadePredominante": cont.predominante,
    "nucleo.modalidadeSufixo": cont.sufixo,
    "nucleo.negacaoRequisitos": cont.negacao,
    "nucleo.tetoRendaSalarios": texto(nucleo?.dados?.criterio?.salarioMinimo),

    // município — cadastro novo
    "municipio.leiReurb.numero": texto(d.leiReurb?.numero),
    "municipio.leiReurb.data": dataBR(d.leiReurb?.data),
    "municipio.leiReurb.numeroAno": numeroAno(d.leiReurb?.numero, d.leiReurb?.data),
    "municipio.planoDiretor.numero": texto(d.planoDiretor?.numero),
    "municipio.planoDiretor.data": dataBR(d.planoDiretor?.data),
    "municipio.planoDiretor.artigoMacrozona": texto(d.planoDiretor?.artigoMacrozona),
    "municipio.planoDiretor.citacaoMacrozona": texto(macro.citacao),
    "nucleo.macrozona": texto(macro.nome),
    "nucleo.macrozonaSigla": texto(macro.sigla),
    "nucleo.macrozonaDestinacao": texto(macro.destinacao),
    "concessionariaEnergia.nome": texto(d.concessionariaEnergia?.nome),
    "concessionariaEnergia.tipo": texto(d.concessionariaEnergia?.tipo),
    "concessionariaAgua.nome": texto(d.concessionariaAgua?.nome),
    "concessionariaAgua.anoCriacao": texto(d.concessionariaAgua?.anoCriacao),
    "concessionariaAgua.leiContrato.numero": texto(d.concessionariaAgua?.leiContratoNumero),
    "concessionariaAgua.leiContrato.data": dataBR(d.concessionariaAgua?.leiContratoData),
    "concessionaria.nome": texto(d.concessionariaAgua?.nome),
    "comarca.nome": texto(d.comarca?.nome),
    "comarca.estadoPorExtenso": texto(d.comarca?.estadoPorExtenso),
    "prefeitura.cnpj": texto(d.prefeitura?.cnpj),
    "prefeitura.endereco": texto(d.prefeitura?.endereco),
    "prefeitura.prefeito.nome": texto(d.prefeitura?.prefeitoNome),
    "prefeitura.prefeito.cargo": texto(d.prefeitura?.prefeitoCargo),

    // empresa que elabora — vem das configurações, não do município
    "elaboracao.razaoSocial": texto(elaboracao?.razaoSocial),
    "elaboracao.cnpj": texto(elaboracao?.cnpj),
    "elaboracao.endereco": texto(elaboracao?.endereco),
  };

  // logradouro citado na lei de denominação (primeiro cadastrado)
  const lei = (d.leisDenominacao || [])[0];
  if (lei) {
    marcadores["logradouro.leiDenominacao.numero"] = texto(lei.numero);
    marcadores["logradouro.leiDenominacao.data"] = dataBR(lei.data);
    marcadores["logradouro.nome"] = texto(lei.logradouro);
  }

  const unidades = [];
  for (const m of moradores) {
    const lista = m?.dados?.unidades || m?.unidades || [];
    for (const u of lista) {
      const { quadra, lote } = separarQuadraLote(u.loteQuadra);
      unidades.push({
        id: u.id,
        codigo: texto(m.codigo),
        quadra, lote,
        quadraLote: texto(u.loteQuadra),
        area: texto(u.area),
        memorial: texto(u.memorial),
        modalidade: modalidadeDa(m),
        requerentes: requerentesDa(m),
      });
    }
  }

  return { marcadores, unidades, faltando: lacunasPRF(marcadores, unidades) };
}

/* ------------------------------------------------- de onde viria o que falta */

const ORIGEM = [
  [/^municipio\.(leiReurb|planoDiretor)|^concessionaria|^comarca\.|^prefeitura\./, "Cadastro de dados do PRF, na aba Municípios"],
  [/^nucleo\.(macrozona)/, "Macrozona do núcleo + cadastro de macrozonas do município"],
  [/^elaboracao\./, "Configurações — cadastro da empresa"],
  [/^nucleo\.(bairro|zona)$/, "Endereço do núcleo, no cadastro do núcleo"],
  [/^(nucleo|areaPublica|areaApp|areaRisco|logradouro|servidao)\.(area|perimetro)/, "Topografia — aba Memoriais"],
  [/Extenso$/, "Derivado da área e do perímetro, depois da topografia"],
  [/^matricula\.|^fracao\.|^proprietario\.|^reservaLegal\./, "Análise de matrícula do núcleo"],
  [/^unidade\.(quadra|lote)$/, "Quadra e lote da unidade, hoje num campo só (loteQuadra)"],
  [/^unidade\.(energia|agua|esgoto)/, "Levantamento de infraestrutura por unidade"],
  [/^infra\./, "Levantamento de infraestrutura do núcleo"],
  [/^cronograma\./, "Cronograma físico, definido na aprovação do projeto"],
  [/^(quadra|logradouro)\./, "Projeto urbanístico"],
  [/^(app|risco|rodovia)\./, "Estudo ambiental, de risco e faixas de domínio"],
  [/^versao\.|^tecnico\./, "Histórico de versões e equipe técnica"],
];

export function origemDoCampo(campo) {
  for (const [re, origem] of ORIGEM) if (re.test(campo)) return origem;
  return "Sem origem definida";
}

/** Lista o que continua em branco, agrupado por onde o dado teria de nascer. */
export function lacunasPRF(marcadores, unidades = []) {
  const porOrigem = {};
  for (const [campo, valor] of Object.entries(marcadores)) {
    if (texto(valor)) continue;
    const origem = origemDoCampo(campo);
    (porOrigem[origem] ||= []).push(campo);
  }
  const semQuadra = unidades.filter((u) => !u.quadra && !u.lote).length;
  if (semQuadra) {
    (porOrigem["Quadra e lote da unidade, hoje num campo só (loteQuadra)"] ||= [])
      .push(`${semQuadra} unidade(s) sem quadra/lote`);
  }
  const semRequerente = unidades.filter((u) => !u.requerentes).length;
  if (semRequerente) {
    (porOrigem["Qualificação do requerente"] ||= []).push(`${semRequerente} unidade(s) sem requerentes`);
  }
  return porOrigem;
}

/** Os grupos do formulário, para a tela de conferência. */
export const GRUPOS_MUNICIPIO = GRUPOS;

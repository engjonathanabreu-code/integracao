/* Testes. Rode com: node municipio-prf/municipio-prf.test.mjs */

import { GRUPOS, VAZIO, pendencias } from "./camposPRF.js";
import {
  marcadoresPRF, contarModalidades, requerentesDa, separarQuadraLote,
  dataBR, dataPorExtenso, origemDoCampo,
} from "./marcadoresPRF.js";

let falhas = 0;
const ok = (nome, cond, detalhe = "") => {
  if (cond) console.log("  ok   " + nome);
  else { falhas++; console.log("  FALHA " + nome + (detalhe ? "  → " + detalhe : "")); }
};

/* dados de teste espelhados no núcleo real NANT02_01 */
const moradores = [
  { codigo: "ANT02_0001", dados: { social: { modalidade: "REURB-E" },
    qualificacaoRequerente: { assinantes: "Ana Paula de Andrade Besen;Nilson Ribeiro;" },
    unidades: [{ id: "u1", area: "0,00", memorial: "", loteQuadra: "" }] } },
  { codigo: "ANT02_0002", dados: { social: { modalidade: "REURB-S" },
    qualificacaoRequerente: { assinantes: "Cerli Teresinha Borges da Silva;" },
    unidades: [{ id: "u2", area: "312,45", memorial: "Inicia-se...", loteQuadra: "Lote 07A, Quadra 03" }] } },
  { codigo: "ANT02_0003", dados: { social: { modalidade: "REURB-S" },
    qualificacaoRequerente: { beneficiarios: "João Silva;" },
    unidades: [{ id: "u3", area: "", memorial: "", loteQuadra: "Quadra 04 / Lote 12" }] } },
];

const nucleo = { dados: {
  nomeIntegrado: "Coopercampos", codigo: "NANT02_01",
  endereco: { municipio: "Anita Garibaldi", uf: "SC", bairro: "" },
  criterio: { salarioMinimo: "2,00", rendaMaxima: "1412,00" },
  macrozona: "Macrozona Rural",
} };

const dadosPRF = {
  leiReurb: { numero: "1.234", data: "2019-05-02" },
  planoDiretor: { numero: "987/2015", data: "2015-03-10", artigoMacrozona: "12" },
  macrozonas: [{ nome: "Macrozona Rural", sigla: "MZR", destinacao: "agrícola", citacao: "Art. 12. ..." }],
  concessionariaEnergia: { nome: "Celesc", tipo: "sociedade de economia mista" },
  concessionariaAgua: { nome: "Casan", anoCriacao: "1970", leiContratoNumero: "456", leiContratoData: "2003-08-01" },
  comarca: { nome: "Anita Garibaldi", estadoPorExtenso: "Santa Catarina" },
  prefeitura: { cnpj: "00.000.000/0001-00", endereco: "Praça Central, 1", prefeitoNome: "Fulano", prefeitoCargo: "Prefeito Municipal" },
  leisDenominacao: [{ logradouro: "Rua das Flores", numero: "55", data: "2010-02-03" }],
  bibliografia: [{ texto: "ANITA GARIBALDI. Lei nº 1.234/2019." }],
};

console.log("\nauxiliares");
ok("data por extenso", dataPorExtenso(new Date(2026, 8, 16)) === "16 de setembro de 2026", dataPorExtenso(new Date(2026, 8, 16)));
ok("data ISO para BR", dataBR("2019-05-02") === "02/05/2019");
ok("data vazia", dataBR("") === "");
ok("quadra/lote com rótulos", JSON.stringify(separarQuadraLote("Lote 07A, Quadra 03")) === '{"quadra":"03","lote":"07A"}');
ok("quadra/lote invertido", JSON.stringify(separarQuadraLote("Quadra 04 / Lote 12")) === '{"quadra":"04","lote":"12"}');
ok("quadra/lote vazio", JSON.stringify(separarQuadraLote("")) === '{"quadra":"","lote":""}');
ok("requerentes com ponto e vírgula", requerentesDa(moradores[0]) === "Ana Paula de Andrade Besen, Nilson Ribeiro");
ok("cai para beneficiarios", requerentesDa(moradores[2]) === "João Silva");

console.log("\ncontagem de modalidade");
const c = contarModalidades(moradores);
ok("total 3", c.total === 3);
ok("social 2 / específico 1", c.social === 2 && c.especifico === 1);
ok("predominante social", c.predominante === "interesse social", c.predominante);
ok("sufixo S", c.sufixo === "S");
ok("negação vazia em Reurb-S", c.negacao === "");
const cE = contarModalidades([moradores[0], { dados: { social: { modalidade: "REURB-E" } } }]);
ok("predominante específico", cE.predominante === "interesse específico");
ok("negação 'não' em Reurb-E", cE.negacao === "não");
const cEmpate = contarModalidades([moradores[0], moradores[1]]);
ok("empate não escolhe", cEmpate.predominante === "" && cEmpate.sufixo === "");
ok("lista vazia não inventa zero", contarModalidades([]).total === 0);

console.log("\nmarcadores");
const r = marcadoresPRF({
  municipio: { nome: "Anita Garibaldi", uf: "SC" },
  dadosPRF, nucleo, moradores,
  elaboracao: { razaoSocial: "Integral Soluções em Engenharia", cnpj: "29.212.382/0001-07", endereco: "Rua Tiradentes, 262" },
  emitidoEm: new Date(2026, 8, 16),
});
const m = r.marcadores;
ok("contagens preenchidas", m["nucleo.totalProcessos"] === "3" && m["nucleo.processosSocial"] === "2");
ok("teto de renda do núcleo", m["nucleo.tetoRendaSalarios"] === "2,00");
ok("lei de REURB com data BR", m["municipio.leiReurb.data"] === "02/05/2019");
ok("numeroAno monta o ano", m["municipio.leiReurb.numeroAno"] === "1.234/2019", m["municipio.leiReurb.numeroAno"]);
ok("numeroAno respeita barra existente", marcadoresPRF({ dadosPRF: { leiReurb: { numero: "77/2001", data: "2001-01-01" } } }).marcadores["municipio.leiReurb.numeroAno"] === "77/2001");
ok("macrozona casa com a do núcleo", m["nucleo.macrozonaSigla"] === "MZR" && m["municipio.planoDiretor.citacaoMacrozona"] === "Art. 12. ...");
ok("comarca e prefeitura", m["comarca.nome"] === "Anita Garibaldi" && m["prefeitura.prefeito.cargo"] === "Prefeito Municipal");
ok("elaboração vem de fora do município", m["elaboracao.cnpj"] === "29.212.382/0001-07");
ok("bairro vazio continua vazio", m["nucleo.bairro"] === "");
ok("zona tem padrão", m["nucleo.zona"] === "Área Urbana");

console.log("\nunidades");
ok("3 unidades", r.unidades.length === 3);
ok("quadra/lote separados quando há", r.unidades[1].quadra === "03" && r.unidades[1].lote === "07A");
ok("requerentes por unidade", r.unidades[0].requerentes === "Ana Paula de Andrade Besen, Nilson Ribeiro");
ok("modalidade por unidade", r.unidades[0].modalidade === "REURB-E" && r.unidades[1].modalidade === "REURB-S");

console.log("\nlacunas");
const f = r.faltando;
ok("aponta o bairro do núcleo", (f["Endereço do núcleo, no cadastro do núcleo"] || []).includes("nucleo.bairro"));
ok("conta unidades sem quadra/lote",
  (f["Quadra e lote da unidade, hoje num campo só (loteQuadra)"] || []).some((x) => x.includes("1 unidade")),
  JSON.stringify(f["Quadra e lote da unidade, hoje num campo só (loteQuadra)"]));
ok("não reclama do que está preenchido", !JSON.stringify(f).includes("municipio.leiReurb.numero\""));
ok("origem de área é a topografia", origemDoCampo("nucleo.area") === "Topografia — aba Memoriais");
ok("origem de matrícula", origemDoCampo("matricula.numero") === "Análise de matrícula do núcleo");

console.log("\nesquema e pendências");
ok("grupos definidos", GRUPOS.length === 9, String(GRUPOS.length));
ok("vazio tem todos os grupos", Object.keys(VAZIO()).length === GRUPOS.length);
const p = pendencias(VAZIO());
ok("cadastro em branco acusa obrigatórios", p.length > 0);
ok("acusa lista vazia", p.some((x) => x.includes("nenhum item cadastrado")), JSON.stringify(p));
ok("cadastro completo não acusa nada", pendencias(dadosPRF).length === 0, JSON.stringify(pendencias(dadosPRF)));

console.log(falhas ? `\n${falhas} falha(s)\n` : "\ntudo certo\n");
process.exit(falhas ? 1 : 0);

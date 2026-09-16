/* Dados estáveis do município usados no PRF.
   Esquema declarativo: o formulário, a conferência de pendências e o mapa de
   marcadores leem daqui. Mexeu num campo, mexeu nos três de uma vez. */

export const GRUPOS = [
  {
    id: "leiReurb",
    titulo: "Lei municipal de REURB",
    ajuda: "Citada duas vezes no PRF: na apresentação e no enquadramento de modalidade.",
    campos: [
      { id: "numero", rotulo: "Número da lei", exemplo: "1.234/2019", obrigatorio: true },
      { id: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
    ],
  },
  {
    id: "planoDiretor",
    titulo: "Plano diretor",
    ajuda: "Usado no capítulo de desconformidades urbanísticas.",
    campos: [
      { id: "numero", rotulo: "Número da lei", exemplo: "987/2015", obrigatorio: true },
      { id: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
      { id: "citacaoMacrozona", rotulo: "Citação da macrozona no plano diretor", tipo: "texto" },
      { id: "artigoMacrozona", rotulo: "Artigo que define as macrozonas", exemplo: "12" },
    ],
  },
  {
    id: "macrozonas",
    titulo: "Macrozonas",
    ajuda: "Cada núcleo aponta para uma destas. A citação é o texto do plano diretor, transcrito.",
    lista: true,
    rotuloItem: "macrozona",
    campos: [
      { id: "nome", rotulo: "Nome", exemplo: "Macrozona Rural", obrigatorio: true },
      { id: "sigla", rotulo: "Sigla", exemplo: "MZR", obrigatorio: true },
      { id: "destinacao", rotulo: "Destinação predominante", exemplo: "agrícola" },
      { id: "citacao", rotulo: "Citação do plano diretor", tipo: "texto" },
    ],
  },
  {
    id: "concessionariaEnergia",
    titulo: "Concessionária de energia",
    campos: [
      { id: "nome", rotulo: "Nome", exemplo: "Celesc Distribuição S.A.", obrigatorio: true },
      { id: "tipo", rotulo: "Natureza", exemplo: "sociedade de economia mista" },
    ],
  },
  {
    id: "concessionariaAgua",
    titulo: "Concessionária de água e esgoto",
    campos: [
      { id: "nome", rotulo: "Nome", exemplo: "Casan", obrigatorio: true },
      { id: "anoCriacao", rotulo: "Ano de criação", exemplo: "1970" },
      { id: "leiContratoNumero", rotulo: "Lei do contrato de concessão", exemplo: "456/2003" },
      { id: "leiContratoData", rotulo: "Data da lei do contrato", tipo: "data" },
    ],
  },
  {
    id: "comarca",
    titulo: "Registro de imóveis",
    ajuda: "Também alimenta o requerimento de protocolo no cartório.",
    campos: [
      { id: "nome", rotulo: "Comarca do ORI", exemplo: "Anita Garibaldi", obrigatorio: true },
      { id: "estadoPorExtenso", rotulo: "Estado por extenso", exemplo: "Santa Catarina" },
    ],
  },
  {
    id: "prefeitura",
    titulo: "Prefeitura",
    ajuda: "Usado no requerimento de protocolo, assinado pelo representante legal.",
    campos: [
      { id: "cnpj", rotulo: "CNPJ" },
      { id: "endereco", rotulo: "Endereço da sede" },
      { id: "prefeitoNome", rotulo: "Representante legal" },
      { id: "prefeitoCargo", rotulo: "Cargo", exemplo: "Prefeito Municipal" },
    ],
  },
  {
    id: "leisDenominacao",
    titulo: "Leis de denominação de logradouros",
    ajuda: "Uma por via. O PRF lista as que dão acesso ao núcleo.",
    lista: true,
    rotuloItem: "lei",
    campos: [
      { id: "logradouro", rotulo: "Logradouro", obrigatorio: true },
      { id: "numero", rotulo: "Número da lei", obrigatorio: true },
      { id: "data", rotulo: "Data", tipo: "data" },
    ],
  },
  {
    id: "bibliografia",
    titulo: "Bibliografia municipal",
    ajuda: "Leis e documentos do município citados na bibliografia específica do PRF.",
    lista: true,
    rotuloItem: "referência",
    campos: [{ id: "texto", rotulo: "Referência", tipo: "texto", obrigatorio: true }],
  },
];

export const VAZIO = () => {
  const d = {};
  for (const g of GRUPOS) d[g.id] = g.lista ? [] : Object.fromEntries(g.campos.map((c) => [c.id, ""]));
  return d;
};

/** Campos obrigatórios ainda em branco, na forma "Grupo — Campo". */
export function pendencias(dados) {
  const faltando = [];
  for (const g of GRUPOS) {
    const valor = dados?.[g.id];
    if (g.lista) {
      if (!Array.isArray(valor) || !valor.length) {
        if (g.campos.some((c) => c.obrigatorio)) faltando.push(`${g.titulo} — nenhum item cadastrado`);
        continue;
      }
      valor.forEach((item, i) => {
        for (const c of g.campos) {
          if (c.obrigatorio && !String(item?.[c.id] || "").trim()) {
            faltando.push(`${g.titulo} (${i + 1}) — ${c.rotulo}`);
          }
        }
      });
    } else {
      for (const c of g.campos) {
        if (c.obrigatorio && !String(valor?.[c.id] || "").trim()) faltando.push(`${g.titulo} — ${c.rotulo}`);
      }
    }
  }
  return faltando;
}

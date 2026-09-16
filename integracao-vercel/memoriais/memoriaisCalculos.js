/* Memoriais — leitura de vértices e cálculos topográficos.
   Porte do GM 7.5 (mod_importar_vertices, mod_calcular_topografia,
   mod_renomear_vertices). Sem dependência externa. */

/* ---------------------------------------------------------------- números */

// Aceita "1.234.567,89" e "1234567.89". Devolve null quando não é número.
export function paraNumero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (valor === null || valor === undefined) return null;
  let t = String(valor).trim().replace(/\s/g, "");
  if (!t) return null;
  const temVirgula = t.includes(",");
  const temPonto = t.includes(".");
  if (temVirgula && temPonto) {
    // o separador decimal é o último que aparece
    t = t.lastIndexOf(",") > t.lastIndexOf(".")
      ? t.replace(/\./g, "").replace(",", ".")
      : t.replace(/,/g, "");
  } else if (temVirgula) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (temPonto) {
    // "1.234.567" é separador de milhar; "1234.56" é decimal
    const partes = t.split(".");
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3 && !/^0/.test(partes[0]))) {
      t = partes.join("");
    }
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const formatarCoordenada = (n) =>
  n === null || n === undefined || !Number.isFinite(n) ? "" :
    n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const formatarMedida = (n) =>
  n === null || n === undefined || !Number.isFinite(n) ? "" :
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------- leitura */

const DELIMITADORES = [";", ",", "\t", "|"];

function separar(linha) {
  for (const d of DELIMITADORES) {
    if (linha.includes(d)) {
      // vírgula só vale como delimitador se não estiver servindo de decimal
      if (d === "," && /\d,\d/.test(linha) && !/,\s/.test(linha)) continue;
      return linha.split(d).map((p) => p.trim());
    }
  }
  return linha.trim().split(/\s{1,}/);
}

const SEM_ACENTO = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const COLUNAS = {
  nome: ["nome", "ponto", "vertice", "estacao", "id", "pt", "n do ponto"],
  e: ["e", "este", "leste", "utm e", "x", "coord e", "easting"],
  n: ["n", "norte", "utm n", "y", "coord n", "northing"],
  longitude: ["longitude", "long", "lon"],
  latitude: ["latitude", "lat"],
  confrontante: ["confrontante", "confrontacao", "divisa", "limite"],
};

function mapearCabecalho(campos) {
  const mapa = {};
  campos.forEach((campo, i) => {
    const c = SEM_ACENTO(campo);
    for (const [chave, apelidos] of Object.entries(COLUNAS)) {
      if (mapa[chave] === undefined && apelidos.includes(c)) mapa[chave] = i;
    }
  });
  return (mapa.e !== undefined && mapa.n !== undefined) ? mapa : null;
}

// Formato "chave: valor" numa linha só, como o da estação total:
// "ponto V-1 UTM E: 712345,678 UTM N: 7012345,123"
function lerChaveValor(linha) {
  const nome = linha.match(/(?:ponto|vertice|v[eé]rtice|estacao|esta[çc][ãa]o)\s+([A-Za-z0-9._-]+)/i);
  const e = linha.match(/(?:utm\s*)?e\s*[:=]\s*(-?[\d.,]+)/i);
  const n = linha.match(/(?:utm\s*)?n\s*[:=]\s*(-?[\d.,]+)/i);
  if (!e || !n) return null;
  return {
    nome: nome ? nome[1] : "",
    e: paraNumero(e[1]),
    n: paraNumero(n[1]),
  };
}

/**
 * Lê vértices de um texto colado ou de um arquivo TXT/CSV.
 * Devolve { vertices, avisos }. Nunca lança: o que não deu para ler vira aviso.
 */
export function interpretarVertices(texto) {
  const avisos = [];
  const vertices = [];
  const linhas = String(texto || "").split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { vertices, avisos: ["Nenhuma linha para ler."] };

  let mapa = null;
  let inicio = 0;
  const primeira = separar(linhas[0]);
  const candidato = mapearCabecalho(primeira);
  if (candidato) { mapa = candidato; inicio = 1; }

  for (let i = inicio; i < linhas.length; i++) {
    const linha = linhas[i];
    let v = null;

    if (mapa) {
      const p = separar(linha);
      v = {
        nome: mapa.nome !== undefined ? (p[mapa.nome] || "") : "",
        e: paraNumero(p[mapa.e]),
        n: paraNumero(p[mapa.n]),
        longitude: mapa.longitude !== undefined ? (p[mapa.longitude] || "") : "",
        latitude: mapa.latitude !== undefined ? (p[mapa.latitude] || "") : "",
        confrontante: mapa.confrontante !== undefined ? (p[mapa.confrontante] || "") : "",
      };
    } else {
      v = lerChaveValor(linha);
      if (!v) {
        // sem cabeçalho: procura os dois primeiros números grandes da linha
        const p = separar(linha);
        const numeros = p.map(paraNumero);
        const iE = numeros.findIndex((x) => x !== null && Math.abs(x) > 1000);
        const iN = numeros.findIndex((x, k) => k > iE && x !== null && Math.abs(x) > 1000);
        if (iE >= 0 && iN > iE) {
          v = {
            nome: iE > 0 ? p[0] : "",
            e: numeros[iE],
            n: numeros[iN],
            longitude: "", latitude: "", confrontante: "",
          };
        }
      }
    }

    if (!v || v.e === null || v.n === null) {
      avisos.push(`Linha ${i + 1} ignorada: não foi possível ler E e N.`);
      continue;
    }
    vertices.push({
      nome: String(v.nome || "").trim(),
      e: v.e, n: v.n,
      longitude: v.longitude || "",
      latitude: v.latitude || "",
      confrontante: v.confrontante || "",
    });
  }

  vertices.forEach((v, i) => {
    const prox = vertices[(i + 1) % vertices.length];
    if (vertices.length > 1 && prox.e === v.e && prox.n === v.n) {
      avisos.push(`Vértices ${i + 1} e ${((i + 1) % vertices.length) + 1} têm as mesmas coordenadas.`);
    }
  });
  if (vertices.length && vertices.length < 3) {
    avisos.push("São necessários pelo menos 3 vértices para fechar um perímetro.");
  }
  return { vertices, avisos };
}

/* ---------------------------------------------------------- renomeação */

export function renomearVertices(vertices, prefixo = "V", inicio = 1, digitos = 2) {
  return vertices.map((v, i) => ({
    ...v,
    nome: `${prefixo}${String(inicio + i).padStart(digitos, "0")}`,
  }));
}

/* ------------------------------------------------------------- cálculos */

const RAD = Math.PI / 180;

/** Azimute plano em graus decimais, contado do Norte no sentido horário. */
export function azimuteDecimal(de, dn) {
  let g = Math.atan2(de, dn) / RAD;
  if (g < 0) g += 360;
  if (g >= 360) g -= 360;
  return g;
}

/** Graus decimais para o formato do memorial: 123°45'67" */
export function grausParaGMS(decimal) {
  if (!Number.isFinite(decimal)) return "";
  let g = Math.floor(decimal);
  let m = Math.floor((decimal - g) * 60);
  let s = Math.round(((decimal - g) * 60 - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; g += 1; }
  if (g === 360) g = 0;
  return `${g}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

export const distanciaEntre = (a, b) => Math.hypot(b.e - a.e, b.n - a.n);

/**
 * Calcula azimute e distância de cada lado. O polígono é fechado: o último
 * vértice liga de volta ao primeiro, como faz a planilha.
 */
export function calcularLados(vertices) {
  const total = vertices.length;
  if (total < 2) return vertices.map((v) => ({ ...v, azimute: "", azimuteDecimal: null, distancia: null }));
  return vertices.map((v, i) => {
    const prox = vertices[(i + 1) % total];
    const de = prox.e - v.e;
    const dn = prox.n - v.n;
    const dec = azimuteDecimal(de, dn);
    return {
      ...v,
      azimuteDecimal: dec,
      azimute: grausParaGMS(dec),
      distancia: Math.hypot(de, dn),
    };
  });
}

/** Área pela fórmula dos determinantes (Gauss), em m², com 2 casas. */
export function calcularArea(vertices) {
  const total = vertices.length;
  if (total < 3) return 0;
  let en = 0, ne = 0;
  for (let i = 0; i < total; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % total];
    en += a.e * b.n;
    ne += b.e * a.n;
  }
  return Math.round((Math.abs(en - ne) / 2) * 100) / 100;
}

/** Perímetro em metros, com 2 casas. */
export function calcularPerimetro(vertices) {
  const total = vertices.length;
  if (total < 2) return 0;
  let p = 0;
  for (let i = 0; i < total; i++) p += distanciaEntre(vertices[i], vertices[(i + 1) % total]);
  return Math.round(p * 100) / 100;
}

/** Faz tudo de uma vez: lados calculados, área e perímetro. */
export function processarVertices(vertices) {
  const comLados = calcularLados(vertices);
  return {
    vertices: comLados,
    area: calcularArea(vertices),
    perimetro: calcularPerimetro(vertices),
  };
}

/** Problemas que impedem ou comprometem a geração do memorial. */
export function conferirPoligono(vertices) {
  const erros = [];
  const alertas = [];
  if (vertices.length < 3) erros.push("O perímetro precisa de pelo menos 3 vértices.");
  vertices.forEach((v, i) => {
    if (!v.nome) alertas.push(`O vértice ${i + 1} está sem nome.`);
    if (!Number.isFinite(v.e) || !Number.isFinite(v.n)) erros.push(`O vértice ${i + 1} está sem coordenadas.`);
  });
  const nomes = vertices.map((v) => v.nome).filter(Boolean);
  const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i);
  if (repetidos.length) alertas.push(`Nome de vértice repetido: ${[...new Set(repetidos)].join(", ")}.`);
  return { erros, alertas, valido: erros.length === 0 };
}

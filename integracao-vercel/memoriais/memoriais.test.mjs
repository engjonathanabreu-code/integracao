/* Testes dos módulos de memorial. Rode com:  node memoriais/memoriais.test.mjs
   Sem framework: falha com código 1 e imprime o que quebrou. */

import {
  paraNumero, interpretarVertices, renomearVertices, azimuteDecimal, grausParaGMS,
  calcularArea, calcularPerimetro, processarVertices, conferirPoligono,
} from "./memoriaisCalculos.js";
import { montarMemorial, SISTEMAS } from "./memoriaisTexto.js";

let falhas = 0;
const ok = (nome, condicao, detalhe = "") => {
  if (condicao) { console.log("  ok   " + nome); }
  else { falhas++; console.log("  FALHA " + nome + (detalhe ? "  → " + detalhe : "")); }
};
const perto = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

console.log("\nnúmeros");
ok("decimal com vírgula", paraNumero("712.345,678") === 712345.678);
ok("decimal com ponto", paraNumero("712345.678") === 712345.678);
ok("milhar com ponto", paraNumero("7.012.345") === 7012345);
ok("texto vazio", paraNumero("") === null);
ok("lixo", paraNumero("abc") === null);

console.log("\nazimute");
ok("norte", azimuteDecimal(0, 100) === 0);
ok("leste", azimuteDecimal(100, 0) === 90);
ok("sul", azimuteDecimal(0, -100) === 180);
ok("oeste", azimuteDecimal(-100, 0) === 270);
ok("nordeste 45", perto(azimuteDecimal(100, 100), 45, 1e-9));
ok("sudoeste 225", perto(azimuteDecimal(-100, -100), 225, 1e-9));
ok("noroeste 315", perto(azimuteDecimal(-100, 100), 315, 1e-9));
ok("gms", grausParaGMS(123.7625) === `123°45'45"`, grausParaGMS(123.7625));
ok("gms arredonda 60s", grausParaGMS(89.99999) === `90°00'00"`, grausParaGMS(89.99999));

console.log("\npolígono quadrado de 100 m");
const quadrado = [
  { nome: "V01", e: 700000, n: 7000000 },
  { nome: "V02", e: 700000, n: 7000100 },
  { nome: "V03", e: 700100, n: 7000100 },
  { nome: "V04", e: 700100, n: 7000000 },
];
const q = processarVertices(quadrado);
ok("área 10.000 m²", q.area === 10000, String(q.area));
ok("perímetro 400 m", q.perimetro === 400, String(q.perimetro));
ok("azimutes 0/90/180/270", q.vertices.map((v) => Math.round(v.azimuteDecimal)).join("/") === "0/90/180/270",
  q.vertices.map((v) => v.azimute).join(" "));
ok("todas as distâncias 100", q.vertices.every((v) => perto(v.distancia, 100)));

console.log("\npolígono no sentido inverso dá a mesma área");
const inverso = [...quadrado].reverse();
ok("área igual", calcularArea(inverso) === 10000);
ok("perímetro igual", calcularPerimetro(inverso) === 400);

console.log("\ntriângulo 3-4-5");
const tri = [
  { nome: "V01", e: 0, n: 0 },
  { nome: "V02", e: 30, n: 0 },
  { nome: "V03", e: 0, n: 40 },
];
ok("área 600", calcularArea(tri) === 600, String(calcularArea(tri)));
ok("perímetro 120", calcularPerimetro(tri) === 120, String(calcularPerimetro(tri)));

console.log("\nleitura de vértices");
const comCabecalho = `Nome;E;N;Confrontante
V01;712345,678;7012345,123;Rua das Flores
V02;712355,678;7012345,123;João da Silva
V03;712355,678;7012335,123;
V04;712345,678;7012335,123;Maria Souza`;
const r1 = interpretarVertices(comCabecalho);
ok("4 vértices lidos", r1.vertices.length === 4, JSON.stringify(r1.avisos));
ok("coordenada correta", r1.vertices[0].e === 712345.678);
ok("confrontante lido", r1.vertices[1].confrontante === "João da Silva");

const tabulado = "PONTO\tX\tY\nV01\t712345.678\t7012345.123\nV02\t712355.678\t7012345.123\nV03\t712350.000\t7012335.000";
ok("aceita tabulação e X/Y", interpretarVertices(tabulado).vertices.length === 3);

const semCabecalho = "V01 712345,678 7012345,123\nV02 712355,678 7012345,123\nV03 712350,000 7012335,000";
const r3 = interpretarVertices(semCabecalho);
ok("lê sem cabeçalho", r3.vertices.length === 3, JSON.stringify(r3.avisos));
ok("nome preservado", r3.vertices[0].nome === "V01");

const chaveValor = "ponto V-1 UTM E: 712345,678 UTM N: 7012345,123\nponto V-2 UTM E: 712355,678 UTM N: 7012345,123\nponto V-3 UTM E: 712350,000 UTM N: 7012335,000";
const r4 = interpretarVertices(chaveValor);
ok("lê formato chave: valor", r4.vertices.length === 3, JSON.stringify(r4.avisos));
ok("nome do ponto", r4.vertices[0].nome === "V-1", r4.vertices[0]?.nome);

const sujo = "Nome;E;N\nV01;712345,678;7012345,123\nlinha estragada\nV02;712355,678;7012345,123";
const r5 = interpretarVertices(sujo);
ok("pula linha ruim e avisa", r5.vertices.length === 2 && r5.avisos.length >= 1, JSON.stringify(r5.avisos));

console.log("\nrenomeação");
const renomeado = renomearVertices(quadrado, "V", 1);
ok("prefixo e numeração", renomeado.map((v) => v.nome).join(",") === "V01,V02,V03,V04");
const outro = renomearVertices(quadrado, "P-", 10, 3);
ok("prefixo e início livres", outro[0].nome === "P-010", outro[0].nome);

console.log("\nconferência");
ok("polígono válido", conferirPoligono(quadrado).valido);
ok("dois vértices não fecham", !conferirPoligono(quadrado.slice(0, 2)).valido);

console.log("\ntexto do memorial (UTM)");
const comConfrontante = quadrado.map((v, i) => ({ ...v, confrontante: i === 0 ? "Rua Central" : "" }));
const textoUtm = montarMemorial(comConfrontante, { sistema: SISTEMAS.UTM, meridiano: "51° WGr" });
ok("abre com a frase da planilha", textoUtm.startsWith("Inicia-se a descrição deste perímetro no vértice V01, de coordenadas N "));
ok("usa 'confrontando com' quando há confrontante", textoUtm.includes("deste, segue confrontando com Rua Central, com os seguintes azimute plano e distância: "));
ok("omite confrontante quando vazio", textoUtm.includes("V02, de coordenadas N 7.000.100,000 m e E 700.000,000 m, deste, segue com os seguintes"),
  textoUtm.slice(0, 400));
ok("fecha com meridiano e DATUM", textoUtm.endsWith("Inicial, encerrando esta descrição. Todas as coordenadas aqui descritas encontram-se representadas no sistema UTM, referenciadas ao Meridiano Central 51° WGr, tendo como DATUM SIRGAS 2000. Todos os azimutes e distâncias, área e perímetro foram calculados no plano de projeção UTM."));
ok("coordenada com 3 casas e milhar", textoUtm.includes("N 7.000.000,000 m e E 700.000,000 m"));
ok("distância com 2 casas", textoUtm.includes("e 100,00 m; até o Vértice "));

console.log("\ntexto do memorial (geográfica)");
const geo = quadrado.map((v, i) => ({ ...v, latitude: `-26°58'0${i}\"`, longitude: `-49°31'0${i}\"` }));
const textoGeo = montarMemorial(geo, { sistema: SISTEMAS.GEOGRAFICA });
ok("usa latitude e longitude", textoGeo.includes(`V01, de Latitude -26°58'00" e Longitude -49°31'00", deste, segue`));
ok("fecho geográfico", textoGeo.endsWith("referenciadas ao DATUM SIRGAS 2000."));
ok("não cita meridiano", !textoGeo.includes("Meridiano Central"));

console.log(falhas ? `\n${falhas} falha(s)\n` : "\ntudo certo\n");
process.exit(falhas ? 1 : 0);

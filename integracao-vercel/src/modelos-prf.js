import { removerCronogramaNao } from "./cadastros-prf.js";
import { aplicarCondicionais, expandirLacos, marcadorControle } from './modelos-html.js';
import { preenchido } from './requisitos-moradores.js';

export function modeloPRFEstruturado(html, valores) {
  const texto = String(html || '').replace(/<[^>]*>/g, '');
  return [...texto.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].some(([, c]) => marcadorControle(c) || (c.includes('.') && !Object.hasOwn(valores, c.trim())));
}

// Compatibilidade com Modelo_PRF_INTEGRACAO.docx: no resumo de áreas,
// o rótulo de outras áreas públicas veio como um {{senao}} avulso.
// Corrige apenas essa célula reconhecível e fora de qualquer bloco. Não
// descarta controles desconhecidos nem modifica o modelo armazenado.
function corrigirRotuloResumoPRF(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let alterado = false;
  for (const linha of doc.querySelectorAll('tr')) {
    const celulas = [...linha.cells];
    if (celulas.length !== 2 || !/^\s*\{\{\s*senao\s*\}\}\s*$/.test(celulas[0].textContent) || !/^\s*\{\{\s*resumo\.outrasAreasPublicas\s*\}\}\s*$/.test(celulas[1].textContent)) continue;
    const antes = doc.createRange(); antes.selectNodeContents(doc.body); antes.setEndBefore(celulas[0]);
    const pilha = []; let valido = true;
    for (const [, chave] of antes.toString().matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      if (/^#(se|cada):/.test(chave)) pilha.push(chave.startsWith('#se:') ? 'se' : 'cada');
      else if (chave === '/se' || chave === '/cada') { if (pilha.pop() !== chave.slice(1)) valido = false; }
      else if (chave === 'senao' && pilha.at(-1) !== 'se') valido = false;
    }
    if (!valido || pilha.length) continue;
    celulas[0].textContent = 'Outras áreas públicas'; alterado = true;
  }
  return alterado ? doc.body.innerHTML : html;
}

// Os offsets da correspondência manual só são calculados DEPOIS da expansão.
// Marcadores do catálogo antigo preservam seus blocos HTML e sua formatação.
export function prepararModeloPRF(html, dados) {
  const filtrarCronograma = /cronograma\./.test(html || '') && Object.values(dados.estrutura?.nucleo?.cronograma || {}).includes(false);
  if (!html || (!filtrarCronograma && !modeloPRFEstruturado(html, dados.valores))) return { html, estruturado: false, erro: '' };
  try {
    const condicional = aplicarCondicionais(corrigirRotuloResumoPRF(html), dados.estrutura);
    return { html: expandirLacos(removerCronogramaNao(condicional, dados.estrutura.nucleo || {}), dados.estrutura, { preservar: Object.keys(dados.valores) }), estruturado: true, erro: '' };
  } catch (e) {
    return { html: null, estruturado: true, erro: `Não foi possível preparar o PRF: ${e.message}` };
  }
}

export function mapaDoModeloPRF(salvo, preparo, lacunas) {
  if (preparo.erro) return null;
  if (salvo?.modelo === preparo.html && salvo.valores) return salvo.valores;
  // Caminhos explícitos já têm correspondência. Sublinhados continuam editáveis.
  return preparo.estruturado ? Object.fromEntries(lacunas.filter(l => l.explicita).map(l => [l.id, l.explicita])) : null;
}

// Não infere proprietário registral, dimensões ou vínculos a partir do nome do
// ocupante. Só agrupa unidades quando a matrícula consta expressamente no cadastro.
export function contextoPRF({ municipio, remessa, nucleo, unidades, cpfDe }) {
  const seguro = (valor, chave = '') => {
    if (/cpf/i.test(chave) && typeof valor === 'string') return cpfDe(valor);
    if (Array.isArray(valor)) return valor.map(v => seguro(v));
    if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).filter(([k]) => !['__proto__','constructor','prototype'].includes(k)).map(([k,v]) => [k,seguro(v,k)]));
    return valor;
  };
  const n = seguro(nucleo || {}), m = seguro(municipio || {});
  const us = seguro(unidades);
  const agrupar = (lista, campo, item) => [...new Set(lista.map(u => u[campo]).filter(Boolean))].map(nome => ({ ...item(nome), unidades: lista.filter(u => u[campo] === nome) }));
  const logradouros = lista => agrupar(lista, 'logradouro', nome => ({nome}));
  const matriculas = agrupar(us, 'matricula', numero => ({ numero, nome:numero }));
  for (const mat of matriculas) { mat.logradouros = logradouros(mat.unidades); mat.remanescentes = []; mat.proprietarios = []; }
  const explicitas = Array.isArray(n.matriculas) && n.matriculas.length ? n.matriculas.map(mat => {
    const agrupada = matriculas.find(m => String(m.numero).trim() === String(mat.numero).trim());
    return {...agrupada,...mat,unidades:agrupada?.unidades || mat.unidades || [],logradouros:agrupada?.logradouros || mat.logradouros || []};
  }) : null;
  const vincular = lista => (Array.isArray(lista) ? lista : []).map(item => ({...us.find(u => u.id === item.unidadeId),...item}));
  const tipos = us.map(u => u.modalidade);
  const social = tipos.length > 0 && tipos.every(t => t === 'REURB-S');
  const especifica = tipos.length > 0 && tipos.every(t => t === 'REURB-E');
  const cronograma = n.cronograma ?? n.campos?.cronograma;
  return {
    municipio:m, remessa:seguro(remessa || {}),
    nucleo:{ ...n, nome:n.nome || n.codigo || '', modalidadeSocial:social, modalidadeEspecifica:especifica, estudoAmbiental:n.campos?.estudoAmbiental === 'sim', estudoRisco:n.campos?.estudoRisco === 'sim' },
    unidades:us, matriculas:explicitas ? [...explicitas,...matriculas.filter(m=>!explicitas.some(e=>String(e.numero).trim()===String(m.numero).trim()))] : matriculas, logradouros:logradouros(us),
    quadras:agrupar(us, 'quadra', nome => ({nome,numero:nome})),
    // Sem especialização é uma situação jurídica; não se presume só pela falta de matrícula.
    unidadesSemEspecializacao:vincular(n.unidadesSemEspecializacao),
    areasUsucapidas:vincular(n.areasUsucapidas),
    versoes:Array.isArray(n.versoes) ? n.versoes : [], equipeTecnica:Array.isArray(n.equipeTecnica) ? n.equipeTecnica : [],
    proprietariosCadeiaDominial:Array.isArray(n.proprietariosCadeiaDominial) ? n.proprietariosCadeiaDominial : [],
    unidadesAtingidasRodovia:vincular(n.unidadesAtingidasRodovia),
    unidadesAtingidasCursoAgua:vincular(n.unidadesAtingidasCursoAgua),
    medida:{...n.medida,unidades:vincular(n.medida?.unidades)}, bibliografia:n.bibliografia || m.bibliografia || {},
    cronograma, modalidadeSocial:social, modalidadeEspecifica:especifica,
  };
}

export const REGEX_LACUNA = /\{\{\s*([\w.]+)\s*\}\}|_{4,}/g;
export function encontrarLacunas(html) {
  const lacunas = []; let m; let i = 0;
  const re = new RegExp(REGEX_LACUNA.source, "g");
  while ((m = re.exec(html))) {
    if (m[1] && marcadorControle(m[1])) continue;
    i++;
    const textoAntes = html.slice(Math.max(0, m.index - 500), m.index).replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|h\d|div|li|td|tr)>/gi, " | ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const segmentos = textoAntes.split(/_{4,}|\{\{[^}]*\}\}/);
    const depois = html.slice(m.index + m[0].length, m.index + m[0].length + 160).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    lacunas.push({ id: `L${i}`, inicio: m.index, fim: m.index + m[0].length, explicita: m[1] || null, antes: textoAntes.slice(-100).trim(), trecho: (segmentos[segmentos.length - 1] || "").slice(-70), depois: depois.split(/_{4,}/)[0].slice(0, 50).trim() });
  }
  return lacunas;
}

export function montarPRF(html, lacunas, mapa, valores) {
  let saida = html; const faltando = [];
  [...lacunas].sort((a, b) => b.inicio - a.inicio).forEach((l) => {
    const chave = mapa[l.id];
    const v = chave ? valores[chave] : null;
    let trecho;
    if (chave && preenchido(v)) trecho = v;
    else { if (chave) faltando.push({ id: l.id, chave }); trecho = `<span style="background:#fff3cd">${html.slice(l.inicio, l.fim)}</span>`; }
    saida = saida.slice(0, l.inicio) + trecho + saida.slice(l.fim);
  });
  return { html: saida, faltando };
}

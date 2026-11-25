// Conferência de formato das respostas da IA de devolutivas (Metas), no mesmo espírito de
// validarResultadoDocumentoCliente: nada que venha da IA entra na meta sem passar por aqui.
// Funções puras: não chamam a IA, a rede nem o armazenamento.
export const CATEGORIAS_DEVOLUTIVA_IA = ['pessoas', 'areas', 'memoriais', 'lei', 'decreto', 'tabela_planta', 'vertices', 'nome_lote', 'outro'];
export const STATUS_CONFERENCIA_DEVOLUTIVA = ['corrigido', 'nao_corrigido', 'nao_verificavel'];
export const ERRO_FORMATO_DEVOLUTIVA_IA = 'A IA retornou uma análise em formato inválido. Nada foi gravado na meta; tente novamente.';
export const MAX_ITENS_DEVOLUTIVA_IA = 200;
const MAX_TEXTO = 4000;

const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const invalido = () => new Error(ERRO_FORMATO_DEVOLUTIVA_IA);
const texto = v => String(v).trim().slice(0, MAX_TEXTO);
// Campo de texto opcional: ausente ou null vira vazio; qualquer outro tipo é resposta inválida.
function textoOpcional(v) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw invalido();
  return texto(v);
}
function textoObrigatorio(v) {
  if (typeof v !== 'string' || !v.trim()) throw invalido();
  return texto(v);
}
function listaTextos(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_ITENS_DEVOLUTIVA_IA || v.some(x => typeof x !== 'string')) throw invalido();
  return v.map(texto).filter(Boolean);
}
function listaObjetos(v) {
  if (!Array.isArray(v) || v.length > MAX_ITENS_DEVOLUTIVA_IA || v.some(x => !objeto(x))) throw invalido();
  return v;
}

// JSON quebrado vira a mesma mensagem de formato; falhas de rede/serviço passam como vieram.
export function erroRespostaDevolutivaIA(e) {
  throw e instanceof SyntaxError ? invalido() : e;
}

// Etapa 1 (teor da devolutiva). Devolve só os campos conhecidos; campos extras da IA são descartados.
// Um item sem descrição não é descartado em silêncio (seria perder uma exigência): a resposta inteira é recusada.
export function validarAnaliseTeorDevolutiva(res) {
  if (!objeto(res)) throw invalido();
  const itens = listaObjetos(res.itens).map(it => ({
    categoria: CATEGORIAS_DEVOLUTIVA_IA.includes(it.categoria) ? it.categoria : 'outro',
    descricao: textoObrigatorio(it.descricao),
    statusEsperado: textoOpcional(it.statusEsperado),
  }));
  return { resumo: textoOpcional(res.resumo), itens, naoIdentificado: listaTextos(res.naoIdentificado) };
}

// Regra única de "pronto para reenviar": TODAS as exigências conferidas e corrigidas, sem pendências.
// Lista vazia, item sem status, item faltando ou resposta inválida nunca contam como pronto.
// Com itensEtapa1, exige também uma conferência para cada exigência registrada.
export function prontoParaReenviarDevolutiva(etapa2, itensEtapa1 = null) {
  if (!objeto(etapa2) || etapa2.pronto === false) return false;
  if (etapa2.pronto !== undefined && etapa2.pronto !== true) return false;
  const itens = etapa2.itens, pendencias = etapa2.pendencias ?? [];
  if (!Array.isArray(itens) || !itens.length || !Array.isArray(pendencias) || pendencias.length) return false;
  if (!itens.every(it => objeto(it) && it.status === 'corrigido')) return false;
  if (itensEtapa1 === null || itensEtapa1 === undefined) return true;
  if (!Array.isArray(itensEtapa1) || !itensEtapa1.length || itens.length !== itensEtapa1.length) return false;
  const conferidos = new Set(itens.map(it => it.refItemId));
  return conferidos.size === itens.length && itensEtapa1.every(it => objeto(it) && typeof it.id === 'string' && conferidos.has(it.id));
}

// Etapa 2 (conferência do trabalho corrigido). O resultado tem exatamente um item por exigência da etapa 1,
// na mesma ordem: item sem status ou com status desconhecido, e exigência que a IA não devolveu, entram como
// "nao_verificavel"; itens que não correspondem a nenhuma exigência são ignorados e avisados ao técnico.
export function validarConferenciaDevolutiva(res, itensEtapa1 = []) {
  if (!objeto(res)) throw invalido();
  const recebidos = listaObjetos(res.itens);
  const pendenciasBrutas = listaObjetos(res.pendencias);
  const exigencias = Array.isArray(itensEtapa1) ? itensEtapa1.filter(it => objeto(it) && typeof it.id === 'string' && it.id) : [];
  const ids = new Set(exigencias.map(it => it.id));
  const porId = new Map();
  let extras = 0;
  for (const it of recebidos) {
    const observacao = textoOpcional(it.observacao);
    if (typeof it.refItemId !== 'string' || !ids.has(it.refItemId)) { extras++; continue; }
    const conhecido = STATUS_CONFERENCIA_DEVOLUTIVA.includes(it.status);
    const item = { refItemId: it.refItemId, status: conhecido ? it.status : 'nao_verificavel', observacao: conhecido ? observacao : (observacao || 'A IA não informou a situação deste item.') };
    const anterior = porId.get(item.refItemId);
    // Respostas repetidas para a mesma exigência: vale a menos favorável.
    if (!anterior || (anterior.status === 'corrigido' && item.status !== 'corrigido')) porId.set(item.refItemId, item);
  }
  const itens = exigencias.map(it => porId.get(it.id) || { refItemId: it.id, status: 'nao_verificavel', observacao: 'A IA não devolveu a conferência deste item.' });
  const pendencias = pendenciasBrutas.map(p => ({
    refItemId: typeof p.refItemId === 'string' && ids.has(p.refItemId) ? p.refItemId : '',
    descricao: textoObrigatorio(p.descricao),
    oQueFazer: textoOpcional(p.oQueFazer),
  }));
  const naoIdentificado = listaTextos(res.naoIdentificado);
  if (extras) naoIdentificado.push(`A IA devolveu ${extras} ${extras === 1 ? 'item que não corresponde' : 'itens que não correspondem'} a nenhuma exigência da lista; ${extras === 1 ? 'foi ignorado' : 'foram ignorados'}.`);
  const pronto = res.pronto === true && prontoParaReenviarDevolutiva({ pronto: true, itens, pendencias }, exigencias);
  return { resumo: textoOpcional(res.resumo), pronto, itens, pendencias, naoIdentificado };
}

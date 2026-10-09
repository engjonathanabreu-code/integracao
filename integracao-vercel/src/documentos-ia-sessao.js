// Cache somente em memória da aba Documentos. Nunca grava arquivos, tokens ou OCR no storage.
export const VERSAO_DOCUMENTOS_CLIENTE = 'documentos-cliente-v1';
const copiar = valor => structuredClone(valor);
const serializar = valor => JSON.stringify(valor, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
async function hash(valor) {
  const bytes = typeof valor === 'string' ? new TextEncoder().encode(valor) : valor;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
export function regrasDocumentoCliente(regras, tipo) {
  // Não omite silenciosamente regras além das primeiras vinte.
  return (regras || []).filter(r => r.ativa && (tipo === 'auto' || r.tipos.includes(tipo)));
}
export function validarResultadoDocumentoCliente(res, regras = [], tipos = null) {
  const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const textos = v => Array.isArray(v) && v.every(x => typeof x === 'string');
  const textoOpcional = (v, k) => v[k] === undefined || typeof v[k] === 'string';
  const valido = objeto(res) && typeof res.tipo === 'string' && res.tipo.length > 0
    && typeof res.legivel === 'boolean' && Number.isFinite(res.confianca) && res.confianca >= 0 && res.confianca <= 1
    && ['requerente', 'conjuge', 'outro_familiar', 'terceiro', 'indefinido'].includes(res.pessoa)
    && objeto(res.campos) && Object.values(res.campos).every(x => typeof x === 'string' || Number.isFinite(x))
    && Array.isArray(res.regras) && res.regras.every(r => objeto(r) && typeof r.id === 'string'
      && ['atende', 'nao_atende', 'nao_aplicavel'].includes(r.resultado) && textoOpcional(r, 'observacao'))
    && textos(res.alertas)
    && (res.vinculo === undefined || (objeto(res.vinculo) && ['sim', 'provavel', 'nao', 'indefinido'].includes(res.vinculo.pertenceAoProcesso)
      && textoOpcional(res.vinculo, 'explicacao') && textos(res.vinculo.divergencias)))
    && (res.analise === undefined || (objeto(res.analise) && textoOpcional(res.analise, 'resumo')
      && ['boa', 'regular', 'ruim'].includes(res.analise.qualidade) && textos(res.analise.encontrado) && textos(res.analise.melhorar)));
  if (!valido || (tipos && !Object.prototype.hasOwnProperty.call(tipos, res.tipo))) throw new Error('A IA retornou uma análise em formato inválido. O arquivo foi preservado; tente novamente.');
  const tipo = res.tipo === 'identidade' && res.pessoa === 'conjuge' ? 'identidade_conjuge' : res.tipo;
  const obrigatorias = regrasDocumentoCliente(regras, tipo);
  if (obrigatorias.some(r => res.regras.filter(x => x.id === r.id).length !== 1)) {
    throw new Error('A análise não verificou todas as regras aplicáveis. Use identificação automática ou confira o tipo selecionado e tente novamente. O arquivo foi preservado.');
  }
  return res;
}
export async function obterConfiguracaoDocumentosIA(url, headers, fetcher = fetch) {
  const resposta = await fetcher(url, {
    method: 'POST', headers, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ purpose: 'documentos_cliente', action: 'documentos_config' }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível confirmar o acesso à análise documental.');
  if (!dados.model || !dados.ocr_model || !dados.version) throw new Error('Configuração documental indisponível. Atualize a página.');
  return { model: dados.model, ocr_model: dados.ocr_model, version: dados.version };
}
export function criarSessaoDocumentosIA({ ttlMs = 15 * 60 * 1000, maxEntradas = 20, maxBytes = 8 * 1024 * 1024, agora = Date.now } = {}) {
  let geracao = 0, escopoAtual = null;
  const entradas = new Map();
  const limpar = () => { geracao++; entradas.clear(); escopoAtual = null; };
  const verificarAtual = () => {
    const atual = geracao;
    return () => { if (atual !== geracao) throw new Error('A sessão ou o contexto mudou. Analise novamente neste cadastro.'); };
  };
  function limitar() {
    for (const [chave, entrada] of entradas) if (!entrada.promise && agora() - entrada.criada >= ttlMs) entradas.delete(chave);
    let bytes = [...entradas.values()].reduce((n, e) => n + e.bytes, 0);
    for (const [chave, entrada] of entradas) {
      if (entradas.size <= maxEntradas && bytes <= maxBytes) break;
      if (!entrada.promise) { entradas.delete(chave); bytes -= entrada.bytes; }
    }
  }
  return {
    limpar, verificarAtual,
    async executar({ arquivo, usuario, autorizacao, escopo, contexto, configuracao }, analisar) {
      if (!usuario || !autorizacao) { limpar(); throw new Error('Entre novamente para analisar documentos.'); }
      const aindaAtual = verificarAtual();
      const escopoSessao = await hash(serializar({ usuario, autorizacao, escopo, contexto, configuracao, versao: VERSAO_DOCUMENTOS_CLIENTE }));
      aindaAtual();
      if (escopoAtual !== null && escopoAtual !== escopoSessao) limpar();
      escopoAtual = escopoSessao;
      const verificar = verificarAtual();
      const impressao = await hash(await arquivo.arrayBuffer());
      verificar();
      // A chave pública não contém token nem identificador de sessão.
      const chave = await hash(serializar({ impressao, tipo: arquivo.type, escopo, contexto, configuracao, versao: VERSAO_DOCUMENTOS_CLIENTE }));
      verificar(); limitar();
      let entrada = entradas.get(chave);
      if (!entrada) {
        entrada = { criada: agora(), paginas: new Map(), resultado: null, promise: null, bytes: 0 };
        entradas.set(chave, entrada);
      } else { entradas.delete(chave); entradas.set(chave, entrada); }
      if (entrada.resultado) return { ...copiar(entrada.resultado), metaIA: { ...entrada.resultado.metaIA, reutilizada: true } };
      if (entrada.promise) return copiar(await entrada.promise);
      const paginas = {
        obter(numero, total) { verificar(); return entrada.paginas.get(`${numero}/${total}`); },
        guardar(numero, total, texto) {
          verificar();
          const tamanho = new TextEncoder().encode(texto).length;
          // Limite de memória afeta só o cache; nunca corta a transcrição ou bloqueia a análise.
          if (entrada.bytes + tamanho > maxBytes) return;
          entrada.paginas.set(`${numero}/${total}`, texto); entrada.bytes += tamanho;
        },
      };
      entrada.promise = (async () => {
        const resultado = await analisar({ paginas, verificar });
        verificar();
        const completo = { ...resultado, metaIA: { ...(resultado.metaIA || {}), chave, impressao, reutilizada: false } };
        const tamanho = new TextEncoder().encode(JSON.stringify(completo)).length;
        // Depois de uma análise completa o OCR intermediário pode ser descartado.
        entrada.paginas.clear(); entrada.bytes = 0;
        if (tamanho <= maxBytes) { entrada.resultado = copiar(completo); entrada.bytes = tamanho; }
        return completo;
      })();
      try { return copiar(await entrada.promise); }
      finally { entrada.promise = null; limitar(); }
    },
  };
}

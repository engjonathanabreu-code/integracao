// Retry reads only. A lost write response does not prove that the write failed.
// `options.leitura` marks an explicit read (e.g. a STABLE RPC sent by POST);
// without it, only GET is treated as a read. Writes are never repeated here.
const TENTATIVAS_STATUS = 3;   // 429/500/502/503/504 and network failures
const TENTATIVAS_PRAZO = 2;    // timeouts/aborts: each attempt may already take 25 s
const TETO_RETRY_AFTER_MS = 5000;
const STATUS_TRANSITORIOS = [429, 500, 502, 503, 504];

const esperar = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const fim = () => { clearTimeout(t); signal?.removeEventListener?.('abort', abortar); };
  const abortar = () => { fim(); reject(signal.reason); };
  const t = setTimeout(() => { fim(); resolve(); }, ms);
  signal?.addEventListener?.('abort', abortar, {once: true});
});

// Transport signal for the connection monitor (conexao-rede.js): any HTTP
// response proves reachability; a network failure without a caller abort is a
// real transport failure. Never carries request data.
const sinalizarTransporte = ok => { try { globalThis.window?.dispatchEvent?.(new CustomEvent('integracao:transporte', {detail: {ok}})); } catch {} };

export async function buscarREST(url, opcoes = {}) {
  const {leitura: marcadaLeitura, ...options} = opcoes;
  const leitura = marcadaLeitura === undefined ? (options.method || 'GET').toUpperCase() === 'GET' : marcadaLeitura === true;
  for (let tentativa = 0; ; tentativa++) {
    try {
      // A caller's cancellation must not replace the deadline. Each safe read
      // attempt gets its own deadline, including while receiving the body.
      const timeout = AbortSignal.timeout(25000);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      const response = await fetch(url, {...options, signal});
      sinalizarTransporte(true);
      let body = null;
      if (response.status !== 204) {
        const texto = await response.text();
        if (texto) { try { body = JSON.parse(texto); } catch { throw new Error('O servidor retornou uma resposta inválida. Tente novamente.'); } }
      }
      if (!response.ok) {
        const erro = new Error(body?.message || `Não foi possível acessar os dados (${response.status}).`);
        erro.status = response.status;
        const retry=response.headers?.get?.('Retry-After');
        if(retry){const segundos=Number(retry),ms=Number.isFinite(segundos)?segundos*1000:Date.parse(retry)-Date.now();if(Number.isFinite(ms)&&ms>=0)erro.retryAfterMs=ms;}
        erro.code = body?.code;
        // Some gateways expose the name separately. The queue still validates
        // it against its fixed rules; never persist the response body.
        if(typeof body?.constraint==='string')erro.constraint=body.constraint;
        erro.details = body?.details;
        throw erro;
      }
      return body;
    } catch (erro) {
      const prazo = ['AbortError', 'TimeoutError'].includes(erro.name);
      const rede = erro instanceof TypeError;
      const porStatus = STATUS_TRANSITORIOS.includes(erro.status);
      // Only a network failure (no response) signals unreachability; a slow server is not "offline".
      if (rede && !options.signal?.aborted) sinalizarTransporte(false);
      const limite = prazo ? TENTATIVAS_PRAZO : TENTATIVAS_STATUS;
      if (leitura && (prazo || rede || porStatus) && tentativa + 1 < limite && !options.signal?.aborted
        && !(erro.retryAfterMs > TETO_RETRY_AFTER_MS)) {
        // Short backoff; a server-provided Retry-After (up to the cap) takes precedence.
        const espera = prazo ? 0 : (erro.retryAfterMs ?? 250 * 2 ** tentativa);
        if (espera > 0) {
          try { await esperar(espera, options.signal); } catch { throw erro; }
        }
        continue;
      }
      // 429/500 keep their status and server message, as before; the queue classifies them.
      if (prazo || rede || [502,503,504].includes(erro.status)) {
        const mensagem = leitura
          ? 'A conexão demorou ou foi interrompida. Tente carregar novamente; os dados já exibidos foram preservados.'
          : 'A conexão foi interrompida antes da confirmação. Seus campos foram preservados. Verifique o registro antes de tentar salvar novamente.';
        throw new Error(mensagem, {cause: erro});
      }
      throw erro;
    }
  }
}

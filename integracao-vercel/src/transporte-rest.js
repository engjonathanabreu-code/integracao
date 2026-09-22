// Retry reads only. A lost write response does not prove that the write failed.
export async function buscarREST(url, options = {}) {
  const leitura = (options.method || 'GET').toUpperCase() === 'GET';
  for (let tentativa = 0; ; tentativa++) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(25000), ...options});
      let body = null;
      if (response.status !== 204) {
        const texto = await response.text();
        if (texto) { try { body = JSON.parse(texto); } catch { throw new Error('O servidor retornou uma resposta inválida. Tente novamente.'); } }
      }
      if (!response.ok) {
        const erro = new Error(body?.message || `Não foi possível acessar os dados (${response.status}).`);
        erro.status = response.status;
        throw erro;
      }
      return body;
    } catch (erro) {
      const transitorio = ['AbortError', 'TimeoutError'].includes(erro.name) || erro instanceof TypeError || [502,503,504].includes(erro.status);
      if (leitura && transitorio && tentativa === 0 && !options.signal?.aborted) continue;
      if (transitorio) {
        const mensagem = leitura
          ? 'A conexão demorou ou foi interrompida. Tente carregar novamente; os dados já exibidos foram preservados.'
          : 'A conexão foi interrompida antes da confirmação. Seus campos foram preservados. Verifique o registro antes de tentar salvar novamente.';
        throw new Error(mensagem, {cause: erro});
      }
      throw erro;
    }
  }
}

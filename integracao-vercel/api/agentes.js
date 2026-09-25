import { chamarOpenAI, ErroIA } from '../server/openai.js';
import { AGENTES, AGENTE_VALIDO, INSTRUCOES, montarPedido, perguntaValida } from '../src/agentes-ia.js';
export const config = { maxDuration: 150 };

const ERP = () => process.env.VITE_ERP_SUPABASE_URL || 'https://ycdsyilyvaxslkwbkxyo.supabase.co';
const CHAVE = () => process.env.VITE_ERP_SUPABASE_KEY || 'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4';
const data = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
const numero = (v, padrao) => Number.isInteger(Number(v)) ? Number(v) : padrao;

// The caller's own token reaches the database, so the director check runs in
// Postgres against their session. No service key is used here: an account
// outside the diretoria gets 42501 from the RPC, not a filtered answer.
async function panorama(agente, authorization, corpo) {
  const rota = agente === 'comercial' ? 'integracao_agente_comercial' : 'integracao_agente_tecnico';
  const argumentos = agente === 'comercial'
    ? { p_inicio: data(corpo?.inicio), p_fim: data(corpo?.fim), p_parado_dias: numero(corpo?.paradoDias, 14), p_limite: 20 }
    : { p_parado_dias: numero(corpo?.paradoDias, 45), p_limite: 20 };
  const r = await fetch(`${ERP()}/rest/v1/rpc/${rota}`, {
    method: 'POST',
    headers: { apikey: CHAVE(), Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(argumentos),
    signal: AbortSignal.timeout(25000),
  });
  if (r.status === 401) throw new ErroIA('Sua sessão expirou. Entre novamente.', 401);
  if (r.status === 403 || r.status === 404) throw new ErroIA('Este painel é da diretoria.', 403);
  const corpoResposta = await r.json().catch(() => null);
  if (!r.ok) {
    if (String(corpoResposta?.code) === '42501' || /diretoria/i.test(corpoResposta?.message || '')) throw new ErroIA('Este painel é da diretoria.', 403);
    throw new ErroIA('Não foi possível ler os dados do painel agora. Tente novamente.');
  }
  if (!corpoResposta || typeof corpoResposta !== 'object') throw new ErroIA('O painel voltou vazio. Tente novamente.');
  return corpoResposta;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erro: 'Use POST.' }); }
  try {
    const origem = req.headers.origin;
    if (origem && req.headers.host && new URL(origem).host !== req.headers.host) return res.status(403).json({ erro: 'Pedido de outro endereço recusado.' });
    const authorization = req.headers.authorization;
    if (!/^Bearer \S+$/.test(authorization || '')) throw new ErroIA('Entre novamente e atualize a página para abrir o painel.', 401);
    let corpo;
    try { corpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch { return res.status(400).json({ erro: 'Pedido inválido.' }); }
    const agente = String(corpo?.agente || 'tecnico');
    if (!AGENTE_VALIDO(agente)) throw new ErroIA('Agente desconhecido.', 400);
    if (!perguntaValida(corpo?.pergunta)) throw new ErroIA('Escreva a pergunta com pelo menos 3 caracteres.', 400);

    const dados = await panorama(agente, authorization, corpo);
    if (corpo?.somentePanorama) return res.status(200).json({ agente, panorama: dados });

    const resposta = await chamarOpenAI({
      messages: [{ role: 'user', content: montarPedido(agente, dados, corpo?.pergunta) }],
      system: `Neste pedido você atua como o ${AGENTES[agente].nome} da Integral, encarregado de ${AGENTES[agente].papel}. ${INSTRUCOES}`,
      max_tokens: 1800,
    });
    const texto = (resposta.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return res.status(200).json({ agente, panorama: dados, leitura: texto, modelo: resposta.model, gerado_em: new Date().toISOString() });
  } catch (e) {
    const status = e instanceof ErroIA ? e.status : 503;
    if (status >= 500) console.error('agentes', { tipo: e.name, mensagem: e.message });
    return res.status(status).json({ erro: e instanceof ErroIA ? e.message : 'Não foi possível montar a leitura agora. Tente novamente.' });
  }
}

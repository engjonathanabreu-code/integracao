import {cabecalhosAnthropic,erroAnthropic} from '../server/anthropic.js';
// Função da Vercel que chama a IA com a chave guardada no servidor.
// O navegador nunca recebe a chave: ele manda o pedido para /api/claude e esta função repassa à Anthropic.
export const config = { maxDuration: 60 };

const MODELO = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_TOKENS = 8000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ erro: "Use POST." });
  }
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    return res.status(500).json({ erro: "a chave da IA ainda não foi configurada na Vercel (variável ANTHROPIC_API_KEY)" });
  }
  // Só aceita pedidos vindos do próprio site
  const origem = req.headers.origin;
  if (origem && req.headers.host && new URL(origem).host !== req.headers.host) {
    return res.status(403).json({ erro: "pedido de outro endereço recusado" });
  }
  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { return res.status(400).json({ erro: "pedido inválido" }); }
  }
  if (!corpo || !Array.isArray(corpo.messages) || !corpo.messages.length) {
    return res.status(400).json({ erro: "pedido sem mensagens" });
  }
  try {
    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: cabecalhosAnthropic(),
      body: JSON.stringify({ model: MODELO, max_tokens: Math.min(Number(corpo.max_tokens) || 1000, MAX_TOKENS), messages: corpo.messages }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      return res.status(resposta.status).json({ erro: erroAnthropic(dados,resposta.status) });
    }
    return res.status(200).json(dados);
  } catch (e) {
    return res.status(502).json({ erro: `não foi possível falar com a IA: ${e.message}` });
  }
}

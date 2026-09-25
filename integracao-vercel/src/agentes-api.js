import { tokenTempoReal } from './dados-compartilhados.js';

// Every call to /api/agentes goes with the director's own session token: the
// database decides who may read, not this screen.
export async function pedirAgentes(corpo, timeoutMs = 150000) {
  const token = await tokenTempoReal();
  if (!token) throw new Error('Entre novamente para abrir o painel da diretoria.');
  const r = await fetch('/api/agentes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new Error(dados?.erro || 'Não foi possível falar com o agente agora.');
  return dados;
}

// sessionStorage can be missing or blocked; the screen works without it.
export const guardado = {
  ler(chave) { try { return JSON.parse(sessionStorage.getItem(chave) || 'null'); } catch { return null; } },
  gravar(chave, valor) { try { sessionStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ } },
  apagar(chave) { try { sessionStorage.removeItem(chave); } catch { /* sem armazenamento */ } },
};

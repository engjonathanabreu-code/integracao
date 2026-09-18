const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const ehRecusa = h => ['conclusao recusada', 'conclusao rejeitada', 'conclusao reprovada'].includes(normalizar(h.acao));
const ehSolicitacao = h => normalizar(h.acao) === 'conclusao solicitada';

function autorId(h, usuarios) {
  if (h?.autorId) return h.autorId;
  const candidatos = usuarios.filter(u => u.nome === h?.autor);
  return candidatos.length === 1 ? candidatos[0].id : null;
}

// Explicit refusal events remain attached to the original requester, not current assignees.
export function recusasDaMeta(meta, usuarios = []) {
  const eventos = new Map((meta.recusasConclusao || []).map(e => [e.id, e]));
  let solicitanteId = null;
  const historico = [...(meta.historico || [])].reverse().sort((a,b) => String(a.data || '').localeCompare(String(b.data || '')));
  for (const h of historico) {
    if (ehSolicitacao(h)) solicitanteId = autorId(h, usuarios);
    else if (ehRecusa(h)) {
      if (!eventos.has(h.id)) eventos.set(h.id, {id:h.id, solicitanteId, motivo:h.descricao, data:h.data});
      solicitanteId = null;
    } else if (normalizar(h.acao) === 'conclusao aprovada') solicitanteId = null;
  }
  return [...eventos.values()];
}

export const totalRecusasMeta = meta => recusasDaMeta(meta).length;
export const totalRecusasUsuario = (metas, usuarioId, usuarios = []) => (metas || []).reduce((total,m) => total + recusasDaMeta(m,usuarios).filter(e => e.solicitanteId === usuarioId).length, 0);

export function solicitarConclusaoMeta(meta, usuario, id, data) {
  if (usuario.setor === 'diretoria' || !(meta.responsaveis || []).includes(usuario.id)) throw new Error('Sem permissão para solicitar conclusão.');
  if (meta.status !== 'Em andamento') return false;
  meta.status = 'Aguardando aprovação';
  meta.solicitacaoConclusao = {id, solicitanteId:usuario.id, data};
  meta.historico = [{id,acao:'Conclusão solicitada',descricao:`${usuario.nome} enviou a meta para aprovação.`,autor:usuario.nome,autorId:usuario.id,data},...(meta.historico || [])];
  return true;
}

export function recusarConclusaoMeta(meta, usuario, motivo, id, data, usuarios = []) {
  if (usuario.setor !== 'diretoria') throw new Error('Somente a Diretoria pode recusar a conclusão.');
  if (meta.status !== 'Aguardando aprovação') return false;
  if (!motivo.trim()) throw new Error('Informe o motivo da recusa.');
  const ultima = [...(meta.historico || [])].filter(ehSolicitacao).sort((a,b) => String(b.data || '').localeCompare(String(a.data || '')))[0];
  const solicitanteId = meta.solicitacaoConclusao?.solicitanteId || autorId(ultima,usuarios);
  meta.recusasConclusao = [...(meta.recusasConclusao || []),{id,solicitanteId,solicitacaoId:meta.solicitacaoConclusao?.id || ultima?.id || null,recusadoPor:usuario.id,motivo:motivo.trim(),data}];
  meta.historico = [{id,acao:'Conclusão recusada',descricao:motivo.trim(),autor:usuario.nome,autorId:usuario.id,data},...(meta.historico || [])];
  meta.solicitacaoConclusao = null;
  meta.status = 'Em andamento';
  return true;
}

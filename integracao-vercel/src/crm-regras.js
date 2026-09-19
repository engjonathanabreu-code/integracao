export const ETAPAS_CRM = ['Cliente novo', 'Negociação', 'Contrato', 'Cliente ativo'];
export const normalizarCRM = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function acessoCRM(u) {
  const tipo = normalizarCRM(u?.tipoERP || u?.tipo);
  const admin = u?.ativo !== false && ['administrador', 'diretor tecnico', 'diretor de projetos'].includes(tipo);
  const ativo = !!u && u.ativo !== false;
  return {admin, comercial: ativo && (admin || tipo === 'comercial'), pos: ativo && (admin || tipo === 'pos-protocolo'), marketing: ativo && (admin || ['marketing','pos-protocolo'].includes(tipo))};
}
// Remove only an exact, known code; never discard the first token of a person's name.
export function nomeSemPrefixo(nome, codigo) {
  const text = normalizarCRM(nome), code = normalizarCRM(codigo);
  if (!code || !text.startsWith(code)) return text;
  const suffix = text.slice(code.length);
  return /^[\s_:–—-]/.test(suffix) ? suffix.replace(/^[\s_:–—-]+/, '') : text;
}
export function candidatosIdentidade(clientes, {nome, cidade, documento}) {
  const doc = String(documento || '').replace(/\D/g, '');
  if (doc) return clientes.filter(c => String(c.cpf_cnpj || '').replace(/\D/g, '') === doc).map(c => ({id:c.id, motivo:'documento', confirmar:true}));
  const n = normalizarCRM(nome), city = normalizarCRM(cidade);
  if (n.length < 5) return [];
  const tokens = n.split(' ').filter(t => t.length > 2);
  return clientes.map(c => {
    const candidate = nomeSemPrefixo(c.nome, c.codigo), parts = candidate.split(' ');
    const score = tokens.length ? tokens.filter(t => parts.some(p => p === t || (t.length >= 4 && (p.startsWith(t)||distancia(t,p)<=1)))).length / tokens.length : 0;
    return {id:c.id, score, cidadeConfere:!!city && normalizarCRM(c.municipio) === city, confirmar:true};
  }).filter(c => c.score >= .75).sort((a,b) => Number(b.cidadeConfere)-Number(a.cidadeConfere) || b.score-a.score).slice(0,5);
}
function distancia(a,b){let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+Number(a[i-1]!==b[j-1]));prev=row;}return prev[b.length];}
export function progressoMarketing(etapas, registros) {
  const done = new Set(registros.filter(r => r.concluida).map(r => r.etapa_id));
  const sorted = [...etapas].sort((a,b) => a.fase_numero-b.fase_numero || a.ordem-b.ordem);
  const concluidas = sorted.filter(e => done.has(e.id)).length;
  return {concluidas,total:sorted.length,percentual:sorted.length ? Math.round(100*concluidas/sorted.length) : 0,fase:sorted.find(e => !done.has(e.id))?.fase_nome || (sorted.length ? 'Concluído' : 'Sem etapas')};
}

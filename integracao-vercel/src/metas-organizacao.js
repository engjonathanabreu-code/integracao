const comparar = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base', numeric: true });
const chaveSetor = nome => String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ordemSetores = ['topografia', 'projetos', 'posprotocolo'];
// Ordenação apenas visual: conserva objetos, responsáveis, IDs e ordem persistida.
export function ordenarMetasContinuas(metas = []) {
  const prioridade = nome => { const i = ordemSetores.indexOf(chaveSetor(nome)); return i < 0 ? 3 : i; };
  return [...metas].sort((a, b) => prioridade(a.setor) - prioridade(b.setor)
    || comparar(a.setor || 'Sem setor', b.setor || 'Sem setor')
    || comparar(a.prazo || '9999', b.prazo || '9999')
    || comparar(a.titulo, b.titulo) || comparar(a.id, b.id));
}
// Uma entrada visual por nome; os IDs originais e vínculos no ERP permanecem intactos.
export function setoresUnicos(setores = []) {
  const grupos = new Map();
  for (const setor of setores || []) {
    const anterior = grupos.get(setor.nome);
    if (!anterior || (anterior.ativo === false && setor.ativo !== false)) grupos.set(setor.nome, setor);
  }
  return [...grupos.values()];
}
export function agruparMetas(metas, usuarios = []) {
  const setores = new Map();
  for (const meta of metas) {
    const setor = meta.setor || 'Sem setor';
    if (!setores.has(setor)) setores.set(setor, new Map());
    const pessoas = setores.get(setor);
    for (const id of new Set(meta.responsaveis?.length ? meta.responsaveis : [''])) {
      if (!pessoas.has(id)) pessoas.set(id, { id, nome: usuarios.find(u => u.id === id)?.nome || (id ? 'Usuário indisponível' : 'Sem responsável'), metas: [] });
      pessoas.get(id).metas.push(meta);
    }
  }
  return [...setores].sort(([a], [b]) => comparar(a, b)).map(([nome, pessoas]) => ({ nome, pessoas: [...pessoas.values()].sort((a,b) => comparar(a.nome,b.nome)).map(p => ({ ...p, metas: p.metas.sort((a,b) => comparar(a.prazo || '9999', b.prazo || '9999') || comparar(a.titulo,b.titulo) || comparar(a.id,b.id)) })) }));
}
export function agruparOrdens(ordens) {
  const grupos = new Map();
  for (const ordem of ordens) {
    const nome = ordem.municipio?.trim() || 'Sem município';
    const chave = `${nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}|${ordem.estado || ''}`;
    if (!grupos.has(chave)) grupos.set(chave, { chave, nome, estado: ordem.estado, ordens: [] });
    grupos.get(chave).ordens.push(ordem);
  }
  return [...grupos.values()].sort((a,b) => comparar(a.nome,b.nome) || comparar(a.estado,b.estado)).map(g => ({...g, ordens:g.ordens.sort((a,b) => comparar(a.nome,b.nome) || comparar(a.id,b.id))}));
}
export function corSetor(setor, setores = []) {
  const cadastro = setores.find(s => s.nome === setor || s.id === setor);
  if (/^#[\da-f]{6}$/i.test(cadastro?.cor)) return cadastro.cor;
  const paleta = ['#2563eb','#7c3aed','#0f766e','#b45309','#be185d','#0369a1','#4d7c0f','#a21caf'];
  const indice = setores.findIndex(s => s === cadastro);
  const hash = [...String(setor || '')].reduce((v,c) => (v * 31 + c.charCodeAt(0)) >>> 0, 0);
  return paleta[(indice < 0 ? hash : indice) % paleta.length];
}

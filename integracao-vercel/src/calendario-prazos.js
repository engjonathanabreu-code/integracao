const normalizar = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const setorCalendario = value => ({atendimentos:'comercial',projetos:'projeto',diretortecnico:'diretoria',diretordeprojetos:'diretoria',administrador:'diretoria'}[normalizar(value)] || normalizar(value));
const encerrado = status => ['concluido','concluida','cancelado','cancelada','arquivado','arquivada','inativo','inativa'].includes(normalizar(status));
const dataPrazo = valor => /^\d{4}-\d{2}-\d{2}/.test(valor || '') ? valor.slice(0,10) : '';

// The input is already limited by Supabase RLS. Filters never request another account's session.
export function prazosDoCalendario(db, {usuarioId='',setor='',hoje=new Date().toISOString().slice(0,10)}={}) {
  const usuarios = new Map((db.usuarios || []).map(u=>[u.id,u]));
  const corresponde = (responsaveis, setorItem) => {
    if(usuarioId && !responsaveis.includes(usuarioId))return false;
    return !setor || setorCalendario(setorItem) === setorCalendario(setor) || responsaveis.some(id=>setorCalendario(usuarios.get(id)?.setor) === setorCalendario(setor));
  };
  const nomes = ids => ids.map(id=>usuarios.get(id)?.nome || 'Responsável indisponível').join(', ') || 'Sem responsável';
  const itens=[];
  for(const meta of db.metas || []) {
    const dia=dataPrazo(meta.prazo),responsaveis=meta.responsaveis || [];
    if(!dia || encerrado(meta.status) || !corresponde(responsaveis,meta.setor))continue;
    const atrasada=dia<hoje;
    itens.push({tipo:'meta',id:`mt_${meta.id}`,chave:`meta:${meta.id}`,meta,dia,responsaveisTexto:nomes(responsaveis),titulo:`${atrasada?'Atrasada':'Meta'}: ${meta.titulo}`,cor:atrasada?'#B63A3A':'#B87912',atrasada});
  }
  for(const plano of db.planos || []) {
    if(encerrado(plano.status))continue;
    for(const etapa of plano.etapas || []) {
      const dia=dataPrazo(etapa.prazo),responsaveis=etapa.responsaveis || [];
      if(normalizar(etapa.status)!=='emandamento' || !dia || !responsaveis.length || !corresponde(responsaveis,etapa.setor))continue;
      const atrasada=dia<hoje;
      itens.push({tipo:'plano',id:`pl_${etapa.id}`,chave:`plano:${etapa.id}`,plano,etapa,dia,responsaveisTexto:nomes(responsaveis),titulo:`${plano.titulo}: ${etapa.titulo}`,cor:atrasada?'#B63A3A':'#2563B8',atrasada});
    }
  }
  return itens;
}

export function eventoDoFiltro(evento,db,{usuarioId='',setor=''}={}) {
  const envolvidos=[...(evento.participantes || []),evento.criadoPor].filter(Boolean);
  return (!usuarioId || envolvidos.includes(usuarioId)) && (!setor || (db.usuarios || []).some(u=>envolvidos.includes(u.id)&&setorCalendario(u.setor)===setorCalendario(setor)));
}
export const rotuloPrazo = item => item.responsaveisTexto ? `${item.titulo} — ${item.responsaveisTexto}` : item.titulo;

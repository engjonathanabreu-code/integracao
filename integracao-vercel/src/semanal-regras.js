// Both entry points read the same records; archived cards remain in the history.
export function historicoMunicipal(dados, municipioId, cardId) {
  const cards=new Map((dados?.municipios||[]).filter(c=>municipioId?c.municipio_id===municipioId:c.id===cardId).map(c=>[c.id,c]));
  const semanas=new Map((dados?.semanas||[]).filter(s=>cards.has(s.municipio_id)).map(s=>[s.id,{...s,card:cards.get(s.municipio_id)}]));
  const contextualizar=rows=>(rows||[]).filter(r=>semanas.has(r.semana_id)).map(r=>({...r,semana:semanas.get(r.semana_id)})).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  return {registros:contextualizar(dados?.registros),arquivos:contextualizar(dados?.arquivos)};
}

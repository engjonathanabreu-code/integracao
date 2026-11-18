// Projection only: never feed these rows to the synchronization/write pipeline.
export const AGENDAS_VEICULOS = Object.freeze({
  hb20: {id:'ee6fe017-981f-406a-9813-0eea37877543',nome:'HB20',cor:'#2563B8'},
  gol: {id:'financeiro-agenda-gol',nome:'Gol',cor:'#7C3AED',somenteLeitura:true},
});
export function projetarViagensCalendario(db, rows) {
  const agendas=[...(db.agendas||[])],eventos=[...(db.eventos||[])],ids=new Set();
  for(const r of rows||[]){
    const a=AGENDAS_VEICULOS[r.veiculo_id];
    if(!a||!r.solicitacao_id||!r.solicitante_id||ids.has(r.solicitacao_id))continue;
    const inicio=String(r.inicio||''),fim=String(r.fim||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fim)||fim<inicio)continue;
    ids.add(r.solicitacao_id);
    if(!agendas.some(x=>x.id===a.id))agendas.push({...a,somenteLeitura:true});
    const pessoa=(db.usuarios||[]).find(u=>u.erpRef===r.solicitante_id||u.id===r.solicitante_id);
    const solicitante=pessoa?.id||`erp_${r.solicitante_id}`;
    eventos.push({id:`financeiro-viagem-${r.solicitacao_id}`,origemFinanceiro:true,diaInteiro:true,
      solicitacaoId:r.solicitacao_id,solicitanteNome:r.solicitante_nome||pessoa?.nome||'Solicitante',
      titulo:`Viagem • ${a.nome} • ${r.solicitante_nome||pessoa?.nome||'Solicitante'}`,
      inicio:`${inicio}T00:00:00-03:00`,fim:`${fim}T23:59:59-03:00`,agendaId:a.id,
      participantes:[solicitante],criadoPor:solicitante,publico:true,status:r.status==='concluido'?'concluido':'ativo',cor:a.cor,
      recorrencia:'nenhuma',respostas:{},periodoInicio:inicio,periodoFim:fim});
  }
  return {...db,agendas,eventos};
}
export function conflitosViagens(eventos){
  return eventos.filter(e=>e.origemFinanceiro&&e.status==='ativo'&&eventos.some(outro=>outro.id!==e.id&&outro.agendaId===e.agendaId&&!['cancelado','concluido'].includes(outro.status)&&new Date(outro.inicio)<new Date(e.fim)&&new Date(outro.fim)>new Date(e.inicio)));
}

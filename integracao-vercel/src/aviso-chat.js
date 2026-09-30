export function mensagensNovasChat(db,usuario,vistas){
 const minhas=(db.conversas||[]).filter(c=>(c.participantes||[]).includes(usuario.id));
 const ids=new Set(minhas.flatMap(c=>(c.mensagens||[]).map(m=>m.id))),novas=[];
 for(const conversa of minhas){
  const lidaAte=conversa.lidaPor?.[usuario.id]||'';
  for(const mensagem of conversa.mensagens||[]){
   if(mensagem.autorId===usuario.id||mensagem.data<=lidaAte||vistas?.has(mensagem.id))continue;
   const autor=(db.usuarios||[]).find(u=>u.id===mensagem.autorId);
   novas.push({conversa,mensagem,autor});
  }
 }
 novas.sort((a,b)=>a.mensagem.data.localeCompare(b.mensagem.data));
 return {ids,novas};
}

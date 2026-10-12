export const podeVerNotificacao = (n,u) => u.setor==='diretoria'||(n.setores||[]).includes(u.setor)||(n.usuarios||[]).includes(u.id);
const prefs=(db,u)=>db.usuarios.find(x=>x.id===u.id)?.notificacoesPreferencias||{};
export function notificacaoLida(db,n,u){return prefs(db,u)[n.id]?.lida===true||(n.lidaPor||[]).includes(u.id);}
export function notificacoesUsuario(db,u,{arquivadas=false}={}) {
  const p=prefs(db,u);return (db.notificacoes||[]).filter(n=>podeVerNotificacao(n,u)&&!!p[n.id]?.arquivada===arquivadas).sort((a,b)=>(Date.parse(b.data)||0)-(Date.parse(a.data)||0)||String(b.id).localeCompare(String(a.id)));
}
export function alterarNotificacoes(db,u,ids,acao,data=new Date().toISOString(),versao=crypto.randomUUID()) {
  const usuario=db.usuarios.find(x=>x.id===u.id);if(!usuario)return {db,undo:[]};
  const permitidas=new Set((db.notificacoes||[]).filter(n=>podeVerNotificacao(n,u)).map(n=>n.id));const next={...(usuario.notificacoesPreferencias||{})};const undo=[];
  for(const id of new Set(ids)){if(!permitidas.has(id))continue;const before=next[id]?structuredClone(next[id]):null;const prior=next[id]||{};const patch=acao==='ler'?{lida:true}:acao==='arquivar'?{arquivada:true,arquivadaEm:data}:acao==='restaurar'?{arquivada:false}:null;if(!patch)throw Error('Ação de notificação inválida.');next[id]={...prior,...patch,alteradaEm:data,versao};undo.push({id,before,versao});}
  usuario.notificacoesPreferencias=next;return {db,undo};
}
export function desfazerNotificacoes(db,u,undo) {
  const usuario=db.usuarios.find(x=>x.id===u.id);if(!usuario)return db;const next={...(usuario.notificacoesPreferencias||{})};
  for(const item of undo){if(next[item.id]?.versao!==item.versao)continue;if(item.before)next[item.id]=item.before;else delete next[item.id];}
  usuario.notificacoesPreferencias=next;return db;
}

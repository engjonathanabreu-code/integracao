export const ideiaPlanejamento = m => m?.planejamento?.tipo === 'ideia';
export const metaOperacional = m => !ideiaPlanejamento(m);
export const gerenciaPlanejamento = u => u?.setor === 'diretoria';
export function segundaPlanejamento(date = new Date(), offset = 0) {
  const d = new Date(typeof date === 'string' ? date + 'T12:00:00' : date);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7 + offset * 7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function diaPlanejamento(date, n) {const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function ordenarPlanejamento(metas) {
  return [...metas].sort((a,b)=>(a.planejamento?.ordem??Number.MAX_SAFE_INTEGER)-(b.planejamento?.ordem??Number.MAX_SAFE_INTEGER)||String(a.prazo||'9999').localeCompare(String(b.prazo||'9999'))||String(a.titulo||'').localeCompare(String(b.titulo||''),'pt-BR',{numeric:true})||String(a.id).localeCompare(String(b.id)));
}
function exigirGestao(usuario) {if(!gerenciaPlanejamento(usuario))throw Error('A administração atual de Metas é necessária para alterar o planejamento.');}
export function moverPlanejamento(db,id,semana,antes=null,usuario) {
  exigirGestao(usuario);if(!/^\d{4}-\d{2}-\d{2}$/.test(semana))throw Error('Semana inválida.');
  const m=db.metas.find(m=>m.id===id);if(!m)return db;const destino=segundaPlanejamento(semana);
  const lista=ordenarPlanejamento(db.metas.filter(x=>x.id!==id&&x.semana_inicio&&segundaPlanejamento(x.semana_inicio)===destino));
  const at=antes?lista.findIndex(x=>x.id===antes):-1;lista.splice(at<0?lista.length:at,0,m);m.semana_inicio=destino;
  lista.forEach((x,i)=>{x.planejamento={...(x.planejamento||{}),ordem:i};});return db;
}
export function criarIdeiaPlanejamento(db,{id=crypto.randomUUID(),titulo,semana,setor=''},usuario) {
  exigirGestao(usuario);if(!titulo?.trim())throw Error('Informe um título.');if(db.metas.some(m=>m.id===id))return db;
  db.metas.push({id,titulo:titulo.trim(),observacoes:'',semana_inicio:segundaPlanejamento(semana),prazo:'',status:'Ideia',setor,criadoPor:usuario.id,associacao_tipo:'avulsa',associacao_id:'',responsaveis:[],nucleos:[],checklist:[],comentarios:[],historico:[],arquivos:[],planejamento:{tipo:'ideia',ordem:Date.now(),criadaPor:usuario.id,criadaEm:new Date().toISOString()}});return db;
}
export function converterIdeiaPlanejamento(db,id,usuario,data=new Date().toISOString()) {
  exigirGestao(usuario);const m=db.metas.find(m=>m.id===id);if(!ideiaPlanejamento(m))return db;
  m.planejamento={...m.planejamento,tipo:'meta',convertidaEm:data};m.status='Em andamento';
  m.historico=[{id:crypto.randomUUID(),acao:'Criada',descricao:'Ideia do planejamento convertida em meta.',autor:usuario.nome,autorId:usuario.id,data},...(m.historico||[])];return db;
}

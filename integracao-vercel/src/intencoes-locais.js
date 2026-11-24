import {igualSemantico} from './igualdade-semantica.js';
import {edicaoDerivada} from './projecoes-derivadas.js';
const acessos=new Set(['Entrou no sistema','Saiu do sistema','Sessão encerrada por inatividade']);
// setorERP is canonical (profiles.setor): the login form writes '' where the
// projection returns null, and no write of it is ever read back.
const semPresenca=registro=>{const r={...registro};delete r.online;delete r.ultimaAtividade;if(r.setorERP==null||r.setorERP==='')delete r.setorERP;return r;};
// Same exclusions as complementos(): these fields/events never produce a write.
// Creation, deletion, profile changes and unknown formats always remain pending.
export function edicaoSomenteLocal(e){
 if(!e?.id)return false;
 if(e.colecao==='usuarios')return e.antes?.existe===true&&e.depois?.existe===true&&e.antes.valor?.id===e.id&&e.depois.valor?.id===e.id&&igualSemantico(semPresenca(e.antes.valor),semPresenca(e.depois.valor));
 if(e.colecao==='auditoria')return [e.antes,e.depois].some(v=>v?.existe===true)&&[e.antes,e.depois].every(v=>v?.existe===false||(v?.existe===true&&v.valor?.id===e.id&&acessos.has(v.valor.acao)));
 return false;
}
export function pendenciaSomenteLocal(item){
 const o=item.original,edicoes=o?.intencao?.edicoes;
 return item.estado==='pendente_local'&&item.tentativas===0&&(item.tentativasTotais??0)===0&&!item.payload&&!item.recibo&&item.preparado==null&&item.enviadoEm==null&&item.confirmadoEm==null&&item.lidoEm==null&&!o?.legado&&o?.preparar===true&&o.operacoes?.length===0&&Object.keys(o.intencao?.arquivos||{}).length===0&&Array.isArray(edicoes)&&edicoes.length>0&&edicoes.every(e=>edicaoSomenteLocal(e)||edicaoDerivada(e));
}

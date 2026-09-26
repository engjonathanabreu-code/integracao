import { agruparMetas, corSetor } from './metas-organizacao.js';
export default function MetasAgrupadas({ metas, db, renderMeta }) {
  return agruparMetas(metas, db.usuarios).map(setor => <section key={setor.nome} style={{borderLeft:`4px solid ${corSetor(setor.nome,db.setoresMeta)}`, paddingLeft:12, marginBottom:20}}>
    <h3>{setor.nome}</h3>
    {setor.pessoas.map(p => <section key={p.id} style={{marginBottom:16}}><h4 style={{margin:'8px 0'}}>{p.nome} <small>({p.metas.length})</small></h4><div className="grade-metas">{p.metas.map(renderMeta)}</div></section>)}
  </section>);
}

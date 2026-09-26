import { agruparMetas, corSetor } from './metas-organizacao.js';
export default function MetasAgrupadas({ metas, db, renderMeta }) {
  return <div className="metas-grupos">{agruparMetas(metas, db.usuarios).map(setor => <details open key={setor.nome} className="metas-grupo-setor" style={{borderLeftColor:corSetor(setor.nome,db.setoresMeta)}}>
    <summary>{setor.nome} <span className="tag">{new Set(setor.pessoas.flatMap(p => p.metas.map(m => m.id))).size} metas</span></summary>
    <div className="metas-grupo-pessoas">{setor.pessoas.map(p => <section key={p.id} className="metas-grupo-pessoa"><h4>{p.nome} <small>({p.metas.length})</small></h4><div className="grade-metas">{p.metas.map(renderMeta)}</div></section>)}</div>
  </details>)}</div>;
}

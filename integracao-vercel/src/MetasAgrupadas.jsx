import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ordenarMetasContinuas } from './metas-organizacao.js';

export default function MetasAgrupadas({ metas, renderMeta }) {
  const grade = useRef(null);
  const [colunas, setColunas] = useState(1);
  const [pagina, setPagina] = useState(0);
  const ordenadas = useMemo(() => ordenarMetasContinuas(metas), [metas]);
  const identidade = ordenadas.map(m => m.id).join('|');
  useEffect(() => { setPagina(0); }, [identidade, colunas]);
  useEffect(() => {
    const elemento = grade.current;
    const medir = () => setColunas(Math.max(1, getComputedStyle(elemento).gridTemplateColumns.split(' ').length));
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);
  const porPagina = colunas * 4;
  const paginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const atual = Math.min(pagina, paginas - 1);
  return <div className="metas-continuas">
    <div className="metas-grade-continua" ref={grade}>
      {ordenadas.slice(atual * porPagina, (atual + 1) * porPagina).map(renderMeta)}
    </div>
    {paginas > 1 && <nav className="metas-paginacao" aria-label="Páginas de metas">
      <span className="ajuda" aria-live="polite">{atual * porPagina + 1}–{Math.min((atual + 1) * porPagina, ordenadas.length)} de {ordenadas.length} metas · Página {atual + 1} de {paginas}</span>
      <button className="btn btn-sm" disabled={atual === 0} onClick={() => setPagina(atual - 1)}><ChevronLeft size={16} />Anterior</button>
      <button className="btn btn-sm" disabled={atual === paginas - 1} onClick={() => setPagina(atual + 1)}>Próxima<ChevronRight size={16} /></button>
    </nav>}
  </div>;
}

export default function CardFunilInstitucional({tipo,titulo,municipio,referencia,etiquetas=[],compacto=false,controleEtapa,abrirDetalhes,abrirNegocio}) {
  const texto = valor => valor || 'Não informado';
  const tags = etiquetas.filter(Boolean);
  return <article className={`crm-card fi-registro fi-card${compacto?' fi-card-compacto':''}`}>
    <span className="crm-ficha-legenda">{tipo}</span>
    <h4 className="fi-card-titulo" title={texto(titulo)}>{texto(titulo)}</h4>
    {!compacto&&<><dl className="fi-card-campo"><dt>Município</dt><dd title={texto(municipio)}>{texto(municipio)}</dd></dl><dl className="fi-card-campo"><dt>Etapa</dt><dd title={texto(referencia)}>{texto(referencia)}</dd></dl></>}
    <div className="fi-card-etiquetas" aria-label={tags.length?`Etiquetas: ${tags.join(', ')}`:'Sem etiquetas'} title={tags.join(' · ')}>{tags.length?tags.map((tag,i)=><span className="pill" key={`${tag}-${i}`}>{tag}</span>):<span className="ajuda">Sem etiquetas</span>}</div>
    {!compacto&&<div className="fi-card-etapa">{controleEtapa||<span className="ajuda">Somente consulta</span>}</div>}
    <div className="fi-card-acoes"><button className="btn" onClick={abrirDetalhes}>Detalhes</button>{!compacto&&(abrirNegocio?<button className="btn" onClick={abrirNegocio}>Abrir negócio</button>:<span aria-hidden="true"/>)}</div>
  </article>;
}

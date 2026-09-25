// Small charts for the agents' dashboard, in plain HTML so they follow the
// app's theme tokens in light and dark. Every bar carries its number as text
// and a title for hover, so nothing depends on colour alone.
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = v => num(v).toLocaleString('pt-BR');

export function Grafico({ titulo, detalhe, children, acao }) {
  return (
    <section className="card agente-grafico">
      <header><div><h3>{titulo}</h3>{detalhe && <p className="ajuda">{detalhe}</p>}</div>{acao}</header>
      {children}
    </section>
  );
}

export const Vazio = ({ children }) => <p className="agente-grafico-vazio">{children}</p>;

// Horizontal bars. Each row may be split in parts ({valor, tom}), drawn with a
// 2px gap between them; the row total is printed at the end.
export function BarrasH({ linhas, vazio = 'Nada para mostrar.', unidade = '', onEscolher }) {
  const lista = (linhas || []).filter(l => num(l.total ?? l.valor) > 0 || l.mostrarZero);
  if (!lista.length) return <Vazio>{vazio}</Vazio>;
  const maximo = Math.max(1, ...lista.map(l => num(l.total ?? l.valor)));
  return (
    <ul className="agente-barras">
      {lista.map(l => {
        const total = num(l.total ?? l.valor);
        const partes = l.partes || [{ valor: total, tom: l.tom }];
        const conteudo = <>
          <span className="agente-barra-rotulo">{l.rotulo}</span>
          <span className="agente-barra-trilho" aria-hidden="true">
            {partes.filter(p => num(p.valor) > 0).map((p, i) => (
              <span key={i} className={`agente-barra${p.tom ? ` agente-barra-${p.tom}` : ''}`} style={{ width: `${(num(p.valor) / maximo) * 100}%` }} />
            ))}
          </span>
          <span className="agente-barra-valor">{fmt(total)}{unidade}{l.extra ? <small> {l.extra}</small> : null}</span>
        </>;
        const dica = `${l.rotulo}: ${fmt(total)}${unidade}${l.extra ? ` (${l.extra})` : ''}`;
        return <li key={l.rotulo} title={dica}>{onEscolher ? <button type="button" className="agente-barra-linha" onClick={() => onEscolher(l)}>{conteudo}</button> : <div className="agente-barra-linha">{conteudo}</div>}</li>;
      })}
    </ul>
  );
}

// One stacked bar that splits a whole (e.g. open goals by deadline status),
// with a legend that repeats each count.
export function Empilhada({ partes, vazio = 'Nada para mostrar.' }) {
  const total = (partes || []).reduce((s, p) => s + num(p.valor), 0);
  if (!total) return <Vazio>{vazio}</Vazio>;
  return (
    <div className="agente-empilhada">
      <div className="agente-empilhada-barra" role="img" aria-label={partes.map(p => `${p.rotulo}: ${fmt(p.valor)}`).join(', ')}>
        {partes.filter(p => num(p.valor) > 0).map(p => (
          <span key={p.rotulo} className={`agente-barra agente-barra-${p.tom || 'base'}`} style={{ flexGrow: num(p.valor) }} title={`${p.rotulo}: ${fmt(p.valor)} de ${fmt(total)}`} />
        ))}
      </div>
      <ul className="agente-legenda">
        {partes.map(p => (
          <li key={p.rotulo}><span className={`agente-marca agente-barra-${p.tom || 'base'}`} aria-hidden="true" /><strong>{fmt(p.valor)}</strong> {p.rotulo}</li>
        ))}
      </ul>
    </div>
  );
}

// Vertical columns over time (weeks). The latest column is labelled; the
// others show their number on hover.
export function Colunas({ pontos, vazio = 'Nada registrado no período.' }) {
  const lista = pontos || [];
  if (!lista.some(p => num(p.valor) > 0)) return <Vazio>{vazio}</Vazio>;
  const maximo = Math.max(1, ...lista.map(p => num(p.valor)));
  return (
    <div className="agente-colunas" role="img" aria-label={lista.map(p => `${p.rotulo}: ${fmt(p.valor)}`).join(', ')}>
      {lista.map((p, i) => (
        <div key={p.rotulo} className="agente-coluna" title={`${p.dica || p.rotulo}: ${fmt(p.valor)}`}>
          <span className="agente-coluna-valor">{num(p.valor) > 0 && (i === lista.length - 1 || num(p.valor) === maximo) ? fmt(p.valor) : ''}</span>
          <span className="agente-coluna-trilho"><span className="agente-barra" style={{ height: `${Math.max(num(p.valor) ? 4 : 0, (num(p.valor) / maximo) * 100)}%` }} /></span>
          <span className="agente-coluna-rotulo">{p.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

// The model writes plain text; it is rendered as text, never as markup.
export function Leitura({ texto }) {
  const partes = String(texto || '').split(/\n{2,}/).filter(p => p.trim());
  return <div className="agente-leitura">{partes.map((parte, i) => {
    const linhas = parte.split('\n').filter(l => l.trim());
    if (linhas.every(l => /^\s*[-•*]\s+/.test(l))) return <ul key={i}>{linhas.map((l, j) => <li key={j}>{l.replace(/^\s*[-•*]\s+/, '').replace(/\*\*/g, '')}</li>)}</ul>;
    if (linhas.length === 1 && /^#{1,3}\s+/.test(linhas[0])) return <h3 key={i}>{linhas[0].replace(/^#{1,3}\s+/, '')}</h3>;
    return <p key={i}>{linhas.join(' ').replace(/\*\*/g, '')}</p>;
  })}</div>;
}

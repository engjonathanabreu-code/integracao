import './carregando-loteamento.css';

const lotes = [
  [94, 74], [182, 74], [270, 74], [402, 74], [490, 74],
  [94, 254], [182, 254], [270, 254], [402, 254], [490, 254],
];

export default function CarregandoLoteamento() {
  return <div className="loteamento-carregando" role="status" aria-label="Carregando o início">
    <svg viewBox="0 0 680 430" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="loteamento-grade" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".12" />
        </pattern>
      </defs>
      <rect x="38" y="28" width="604" height="374" rx="32" fill="url(#loteamento-grade)" />
      <g className="loteamento-projeto">
        <path className="loteamento-traco loteamento-limite" pathLength="100" d="M76 58H590Q608 58 608 76V350Q608 368 590 368H76Q58 368 58 350V76Q58 58 76 58Z" />
        <path className="loteamento-traco loteamento-rua" style={{'--atraso':'.15s'}} pathLength="100" d="M58 186H344V58M608 186H380V58M58 230H344V368M608 230H380V368" />
        <path className="loteamento-eixo" d="M70 208H594M362 72V352" />
        {lotes.map(([x,y], i) => <g key={`${x}-${y}`}>
          <path className="loteamento-traco loteamento-lote" style={{'--atraso':`${.25+i*.09}s`}} pathLength="100" d={`M${x-10} ${y-8}h78v106h-78Z`} />
          <g className="loteamento-casa" style={{'--atraso':`${.6+i*.13}s`}}>
            <path className="loteamento-telhado" d={`M${x+4} ${y+32}l24-20 24 20-24 20Z`} />
            <path className="loteamento-traco" pathLength="100" d={`M${x+4} ${y+32}l24-20 24 20-24 20ZM${x+4} ${y+32}v25l24 20 24-20V${y+32}M${x+28} ${y+52}v25M${x+35} ${y+71}V${y+57}l9-7v14`} />
          </g>
        </g>)}
        {[[79,166],[167,166],[255,166],[430,166],[558,166],[79,344],[167,344],[430,344],[558,344]].map(([x,y],i) => <g className="loteamento-arvore" key={`${x}-${y}`} style={{'--atraso':`${1.5+i*.08}s`,transformOrigin:`${x}px ${y}px`}}>
          <path d={`M${x} ${y}v9`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx={x} cy={y-4} r="7" fill="#91C8AA" />
          <path d={`M${x} ${y-7}v7`} stroke="#0F5F5B" strokeWidth="1.5" strokeLinecap="round" />
        </g>)}
        <g className="loteamento-carro"><rect x="110" y="196" width="18" height="9" rx="4.5" fill="#D9A64D" /><path d="M116 198v5" stroke="#FFF9EB" strokeWidth="2" /></g>
      </g>
      <g className="loteamento-lapis" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m554 335 29-29 8 8-29 29-12 4Z" fill="#F4D598" />
        <path d="m550 347 4-12 8 8ZM579 310l8 8" />
      </g>
    </svg>
  </div>;
}

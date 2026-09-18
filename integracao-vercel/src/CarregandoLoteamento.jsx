import './carregando-loteamento.css';

const casas = [[138,150,-12],[236,119,-5],[350,133,12],[471,170,15],[531,252,-8],[408,296,-12],[290,268,12],[167,286,-8]];
export default function CarregandoLoteamento() {
  return <div className="loteamento-carregando" role="status" aria-label="Carregando o início">
    <svg viewBox="0 0 680 430" fill="none" aria-hidden="true" focusable="false">
      <g className="loteamento-projeto">
        <path className="loteamento-terreno" d="M80 178C66 79 199 49 315 73S548 88 591 204S529 368 398 354S105 389 80 278Z" />
        <path className="loteamento-traco loteamento-limite" pathLength="100" d="M80 178C66 79 199 49 315 73S548 88 591 204S529 368 398 354S105 389 80 278Z" />
        {[0,1].map(i=><path key={i} className="loteamento-traco loteamento-rua" pathLength="100" style={{'--atraso':`${i*.2}s`}} d={i?'M93 231C195 167 240 197 336 239S510 276 582 226':'M87 204C189 140 247 169 348 212S505 249 574 199'} />)}
        <path className="loteamento-traco loteamento-rua" pathLength="100" style={{'--atraso':'.5s'}} d="M334 80C302 131 293 159 309 196M359 84C328 136 322 164 335 207M239 207C215 251 231 303 261 353M266 216C244 256 255 307 286 355" />
        {casas.map(([x,y,r],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <path className="loteamento-traco loteamento-lote" pathLength="100" style={{'--atraso':`${.5+i*.12}s`}} d="M-34-27Q0-36 35-23L38 26Q0 36-35 25Z" />
          <g className="loteamento-casa" style={{'--atraso':`${.9+i*.16}s`}}>
            <path className="loteamento-telhado" d="M-18-3Q-7-17 0-19Q8-16 18-3L0 9Z" />
            <path className="loteamento-traco" pathLength="100" d="M-18-3Q-7-17 0-19Q8-16 18-3L0 9ZM-18-3V13L0 25L18 13V-3M0 9V25" />
          </g>
        </g>)}
        {[[108,266],[195,100],[401,105],[556,298],[342,324]].map(([x,y],i)=><circle key={i} className="loteamento-arvore" cx={x} cy={y} r="8" style={{'--atraso':`${1.5+i*.2}s`}} />)}
        <circle r="4" fill="#105553" className="loteamento-fluxo"><animateMotion dur="7s" repeatCount="indefinite" path="M90 218C192 154 244 183 342 225S508 262 578 212" /></circle>
      </g>
    </svg>
  </div>;
}

import { caminhoPoligonoSVG, poligonosDaGeometria } from './geometria-geografica.js';

export default function PreviaGeometria({geojson,altura=260}){
  const poligonos=(geojson?.features||[]).flatMap(f=>poligonosDaGeometria(f.geometry));
  const pontos=poligonos.flat(2);
  if(!pontos.length)return null;
  const xs=pontos.map(p=>p[0]),ys=pontos.map(p=>p[1]);
  const oeste=Math.min(...xs),leste=Math.max(...xs),sul=Math.min(...ys),norte=Math.max(...ys);
  const fator=Math.max(.01,Math.cos((sul+norte)/2*Math.PI/180));
  const largura=(leste-oeste)*fator,vertical=norte-sul,escala=Math.min(600/(largura||1),220/(vertical||1));
  const projetar=p=>[320+(p[0]-(leste+oeste)/2)*fator*escala,130-(p[1]-(norte+sul)/2)*escala];
  return <svg role="img" aria-label="Prévia dos polígonos selecionados, com anéis internos preservados" viewBox="0 0 640 260" width="100%" height={altura} style={{display:'block',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8}}>
    <title>Prévia da geometria — confira os contornos antes de salvar</title>
    {poligonos.map((aneis,i)=><path key={i} d={caminhoPoligonoSVG(aneis,projetar)} fill="rgba(26,154,146,.22)" fillRule="evenodd" stroke="#0F766E" strokeWidth="2" strokeLinejoin="round"/>)}
  </svg>;
}

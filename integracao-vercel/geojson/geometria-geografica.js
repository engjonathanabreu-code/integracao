// Coordenadas geográficas WGS84. Não calcula nem preenche área/perímetro métricos.
export const LIMITES_GEOGRAFIA = Object.freeze({ bytes:10*1024*1024, feicoes:2000, verticesAnel:2000, verticesTotal:10000 });
const falhar = mensagem => { throw new Error(mensagem); };
const nomeLocal = elemento => String(elemento.localName || elemento.nodeName || '').split(':').at(-1);
const filhos = (elemento,nome) => [...(elemento.children || [])].filter(e=>nomeLocal(e)===nome);
const descendentes = (elemento,nome) => [...elemento.querySelectorAll('*')].filter(e=>nomeLocal(e)===nome);
const mesmo = (a,b) => a.length===b.length && a.every((n,i)=>n===b[i]);
const orientacao=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function segmentosCruzam(a,b,c,d) {
  if(Math.max(a[0],b[0])<Math.min(c[0],d[0]) || Math.max(c[0],d[0])<Math.min(a[0],b[0]) || Math.max(a[1],b[1])<Math.min(c[1],d[1]) || Math.max(c[1],d[1])<Math.min(a[1],b[1]))return false;
  return orientacao(a,b,c)*orientacao(a,b,d)<=0 && orientacao(c,d,a)*orientacao(c,d,b)<=0;
}
function dentro(p,anel) {
  let resultado=false;
  for(let i=0,j=anel.length-2;i<anel.length-1;j=i++){
    const a=anel[i],b=anel[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])resultado=!resultado;
  }
  return resultado;
}
function validarAnel(anel,estado) {
  if(!Array.isArray(anel)||anel.length<4||anel.length>LIMITES_GEOGRAFIA.verticesAnel+1)falhar('Cada contorno precisa de 3 a 2.000 vértices e do ponto de fechamento.');
  estado.vertices+=anel.length-1;
  if(estado.vertices>LIMITES_GEOGRAFIA.verticesTotal)falhar('O arquivo excede 10.000 vértices. Divida o levantamento.');
  for(const p of anel){
    if(!Array.isArray(p)||![2,3].includes(p.length)||p.some(v=>typeof v!=='number'||!Number.isFinite(v)))falhar('Há uma coordenada inválida. Use longitude, latitude e, opcionalmente, altitude numéricas.');
    if(p[0]<-180||p[0]>180||p[1]<-90||p[1]>90)falhar('Coordenadas fora do intervalo de longitude/latitude. Confira o sistema de coordenadas do arquivo.');
  }
  if(!mesmo(anel[0],anel.at(-1)))falhar('O contorno não está fechado. Corrija a geometria antes de importar.');
  const pontos=anel.slice(0,-1);
  if(new Set(pontos.map(p=>p.slice(0,2).join(','))).size!==pontos.length)falhar('O contorno contém vértices repetidos.');
  for(let i=0;i<pontos.length;i++){
    if(Math.abs(anel[i+1][0]-anel[i][0])>180)falhar('O contorno atravessa o antimeridiano. Divida-o no antimeridiano antes de importar.');
    for(let j=i+2;j<pontos.length;j++)if(!(i===0&&j===pontos.length-1)&&segmentosCruzam(anel[i],anel[i+1],anel[j],anel[j+1]))falhar('O contorno se cruza. Corrija a geometria antes de importar.');
  }
  // Só verifica degeneração topológica: esta expressão NÃO é área em metros.
  if(pontos.reduce((s,p,i)=>s+p[0]*anel[i+1][1]-anel[i+1][0]*p[1],0)===0)falhar('O contorno não delimita uma superfície válida.');
}
function aneisCruzam(a,b){for(let i=0;i<a.length-1;i++)for(let j=0;j<b.length-1;j++)if(segmentosCruzam(a[i],a[i+1],b[j],b[j+1]))return true;return false;}
function validarPoligono(aneis,estado){
  if(!Array.isArray(aneis)||!aneis.length)falhar('Polígono sem contorno externo.');
  aneis.forEach(anel=>validarAnel(anel,estado));
  for(let i=1;i<aneis.length;i++){
    if(!dentro(aneis[i][0],aneis[0])||aneisCruzam(aneis[0],aneis[i]))falhar('Um anel interno está fora do contorno externo ou cruza seu limite.');
    for(let j=1;j<i;j++)if(aneisCruzam(aneis[i],aneis[j])||dentro(aneis[i][0],aneis[j])||dentro(aneis[j][0],aneis[i]))falhar('Há anéis internos sobrepostos.');
  }
}
export function validarGeometriaGeografica(geometria,estado={vertices:0}){
  if(!geometria||!['Polygon','MultiPolygon'].includes(geometria.type))falhar('Este mapa importa Polygon e MultiPolygon. Converta outros tipos antes de importar.');
  const poligonos=geometria.type==='Polygon'?[geometria.coordinates]:geometria.coordinates;
  if(!Array.isArray(poligonos)||!poligonos.length)falhar('Geometria sem polígonos.');
  poligonos.forEach(p=>validarPoligono(p,estado));
  return {type:geometria.type,coordinates:structuredClone(geometria.coordinates)};
}
export function lerGeoJSONGeografico(texto){
  if(typeof texto!=='string'||new TextEncoder().encode(texto).length>LIMITES_GEOGRAFIA.bytes)falhar('O arquivo deve ter até 10 MB.');
  let dados;try{dados=JSON.parse(texto);}catch{falhar('O GeoJSON não contém um JSON válido.');}
  if(!dados||typeof dados!=='object'||Array.isArray(dados))falhar('O arquivo não contém um objeto GeoJSON.');
  // RFC 7946 não usa o membro crs. Não presumimos nem descartamos uma projeção declarada.
  if(Object.hasOwn(dados,'crs'))falhar('Para este fluxo, exporte em GeoJSON RFC 7946, longitude/latitude WGS84, sem o campo crs. Levantamentos UTM usam a importação UTM existente.');
  const origem=dados.type==='FeatureCollection'?dados.features:dados.type==='Feature'?[dados]:['Polygon','MultiPolygon'].includes(dados.type)?[{type:'Feature',properties:{},geometry:dados}]:null;
  if(!Array.isArray(origem)||!origem.length||origem.length>LIMITES_GEOGRAFIA.feicoes)falhar('Envie de 1 a 2.000 feições Polygon ou MultiPolygon.');
  const estado={vertices:0};
  const features=origem.map((f,i)=>{
    if(!f||f.type!=='Feature'||Object.hasOwn(f,'crs')||Object.hasOwn(f.geometry||{},'crs'))falhar(`Feição ${i+1}: estrutura ou sistema de coordenadas inválido.`);
    const properties={};
    if(f.properties!=null&&(typeof f.properties!=='object'||Array.isArray(f.properties)))falhar(`Feição ${i+1}: propriedades inválidas.`);
    for(const [k,v] of Object.entries(f.properties||{}))if(!['__proto__','constructor','prototype'].includes(k)&&['string','number','boolean'].includes(typeof v))properties[k]=v;
    const geometry=validarGeometriaGeografica(f.geometry,estado);
    return {type:'Feature',...(typeof f.id==='string'||typeof f.id==='number'?{id:f.id}:{}),properties,geometry};
  });
  return {type:'FeatureCollection',features};
}
export function lerKMLGeografico(texto,Parser=globalThis.DOMParser){
  if(typeof texto!=='string'||new TextEncoder().encode(texto).length>LIMITES_GEOGRAFIA.bytes)falhar('O KML deve ter até 10 MB.');
  if(/<!\s*(DOCTYPE|ENTITY)\b/i.test(texto))falhar('KML com declaração de entidades ou referências externas não é permitido.');
  if(!Parser)falhar('A leitura de KML não está disponível neste navegador.');
  const doc=new Parser().parseFromString(texto,'application/xml');
  if(!doc.documentElement||nomeLocal(doc.documentElement)!=='kml'||descendentes(doc,'parsererror').length)falhar('O KML está com erro de formatação.');
  // Nunca resolve URLs, estilos remotos, imagens, entidades ou links de rede.
  const elementos=[...doc.querySelectorAll('*')];
  if(elementos.some(e=>['NetworkLink','NetworkLinkControl','Link','href','script'].includes(nomeLocal(e))))falhar('Remova links de rede, referências externas e conteúdo ativo do KML antes de importar.');
  const placemarks=descendentes(doc,'Placemark');
  const origem=placemarks.length?placemarks:[doc.documentElement];
  const features=[];
  for(const [i,marca] of origem.entries()){
    const poligonos=descendentes(marca,'Polygon');
    if(!poligonos.length){if(descendentes(marca,'Point').length||descendentes(marca,'LineString').length)falhar('O KML contém feições que não são polígonos. Exporte somente os contornos pertinentes.');continue;}
    if(descendentes(marca,'Point').length||descendentes(marca,'LineString').length)falhar('Uma feição mistura polígonos com pontos ou linhas. Exporte os polígonos separadamente.');
    const coordinates=poligonos.map(p=>{
      const externos=filhos(p,'outerBoundaryIs');
      if(externos.length!==1)falhar('Cada polígono deve conter exatamente um contorno externo.');
      return [...externos,...filhos(p,'innerBoundaryIs')].map(limite=>{
        const aneis=filhos(limite,'LinearRing');
        if(aneis.length!==1)falhar('O limite do polígono precisa de um único LinearRing.');
        const coords=filhos(aneis[0],'coordinates');
        if(coords.length!==1||!coords[0].textContent.trim())falhar('Contorno KML sem coordenadas.');
        return coords[0].textContent.trim().split(/\s+/).map(v=>{
          const partes=v.split(',');
          if(![2,3].includes(partes.length)||partes.some(p=>!p.trim()))falhar('Uma coordenada KML está incompleta.');
          return partes.map(Number);
        });
      });
    });
    const nome=filhos(marca,'name')[0]?.textContent?.trim()||`Área ${i+1}`;
    features.push({type:'Feature',properties:{nome},geometry:coordinates.length===1?{type:'Polygon',coordinates:coordinates[0]}:{type:'MultiPolygon',coordinates}});
  }
  return lerGeoJSONGeografico(JSON.stringify({type:'FeatureCollection',features}));
}
export function poligonosDaGeometria(geometria){return geometria?.type==='Polygon'?[geometria.coordinates]:geometria?.type==='MultiPolygon'?geometria.coordinates:[];}
export function poligonosParaMapa(geo){
  if(geo?.geojson?.features)return geo.geojson.features.flatMap(f=>poligonosDaGeometria(f.geometry));
  return (geo?.poligonos||[]).map(anel=>[anel]);
}
export function geometriaDaFeicao(feicao){return feicao?.geometria || (feicao?.poligono?.length?{type:'Polygon',coordinates:[[...feicao.poligono,...(mesmo(feicao.poligono[0],feicao.poligono.at(-1))?[]:[feicao.poligono[0]])]]}:null);}
export function caminhoPoligonoSVG(aneis,projetar){return aneis.map(anel=>anel.map((p,i)=>`${i?'L':'M'}${projetar(p).join(',')}`).join(' ')+' Z').join(' ');}
export function enquadrarGeometrias(geojson){
  const pontos=geojson.features.flatMap(f=>poligonosDaGeometria(f.geometry).flat(2));
  const limites=pontos.reduce((a,p)=>({oeste:Math.min(a.oeste,p[0]),leste:Math.max(a.leste,p[0]),sul:Math.min(a.sul,p[1]),norte:Math.max(a.norte,p[1])}),{oeste:180,leste:-180,sul:90,norte:-90});
  return {limites,centro:{lng:(limites.oeste+limites.leste)/2,lat:(limites.sul+limites.norte)/2}};
}
export function salvarPerimetroGeografico(db,nucleoId,geojson,{anterior,confirmarSubstituicao=false,arquivo='',por='',agora=new Date().toISOString()}={}){
  const n=db.nucleos.find(x=>x.id===nucleoId);
  if(!n)falhar('Núcleo não encontrado. Reabra o cadastro.');
  if(JSON.stringify(n.geo||null)!==JSON.stringify(anterior||null))falhar('O perímetro foi alterado por outra pessoa. Reabra a prévia antes de salvar.');
  if((n.geo?.geojson?.features?.length||n.geo?.poligonos?.length)&&!confirmarSubstituicao)falhar('Confirme a substituição do perímetro existente.');
  const validado=lerGeoJSONGeografico(JSON.stringify(geojson));
  const {limites,centro}=enquadrarGeometrias(validado);
  // Reutiliza n.geo e mantém área numérica/metadados anteriores. Furos/partes vivem em geojson.
  n.geo={...n.geo,arquivo,geojson:validado,poligonos:validado.features.flatMap(f=>poligonosDaGeometria(f.geometry).map(p=>p[0])),limites,centro,importadoEm:agora,por};
  return db;
}
export function gerarKMLGeografico(geo){
  const escapar=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  const features=geo?.geojson?.features||[{type:'Feature',properties:{nome:geo?.nome||'Área do núcleo'},geometry:{type:'MultiPolygon',coordinates:poligonosParaMapa(geo)}}];
  const poligono=aneis=>'<Polygon>'+aneis.map((anel,i)=>{
    const fechado=mesmo(anel[0],anel.at(-1))?anel:[...anel,anel[0]];
    const tag=i?'innerBoundaryIs':'outerBoundaryIs';
    return `<${tag}><LinearRing><coordinates>${fechado.map(p=>p.join(',')).join(' ')}</coordinates></LinearRing></${tag}>`;
  }).join('')+'</Polygon>';
  return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+features.map((f,i)=>`<Placemark><name>${escapar(f.properties?.nome||f.properties?.name||`Área ${i+1}`)}</name><MultiGeometry>${poligonosDaGeometria(f.geometry).map(poligono).join('')}</MultiGeometry></Placemark>`).join('')+'</Document></kml>';
}

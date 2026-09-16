import { processarVertices } from '../memoriais/memoriaisCalculos.js';
import { montarMemorial } from '../memoriais/memoriaisTexto.js';
import { salvarUnidadeMemorial } from '../memoriais/integracaoMemoriais.js';
import { salvarMemorialNucleo } from '../memoriais/memorialNucleo.js';

// Inversa UTM (Snyder), GRS80. Só usada para exibir o mapa; medidas usam E/N originais.
// Parâmetros EPSG 31978–31985: SIRGAS 2000, fusos 18–25S, k0=.9996.
export function utmParaMapa(e, n, fuso) {
  if (!Number.isFinite(e) || !Number.isFinite(n) || e < 100000 || e > 900000 || n < 1000000 || n > 10000000) throw new Error('Coordenadas fora do intervalo UTM Sul suportado.');
  const a=6378137, f=1/298.257222101, ex=f*(2-f), ep=ex/(1-ex), k=.9996;
  const mu=((n-10000000)/k)/(a*(1-ex/4-3*ex**2/64-5*ex**3/256));
  const q=(1-Math.sqrt(1-ex))/(1+Math.sqrt(1-ex));
  const p=mu+(3*q/2-27*q**3/32)*Math.sin(2*mu)+(21*q**2/16-55*q**4/32)*Math.sin(4*mu)+151*q**3/96*Math.sin(6*mu)+1097*q**4/512*Math.sin(8*mu);
  const t=Math.tan(p)**2, c=ep*Math.cos(p)**2, nn=a/Math.sqrt(1-ex*Math.sin(p)**2), r=a*(1-ex)/(1-ex*Math.sin(p)**2)**1.5, d=(e-500000)/(nn*k);
  const lat=(p-nn*Math.tan(p)/r*(d*d/2-(5+3*t+10*c-4*c*c-9*ep)*d**4/24+(61+90*t+298*c+45*t*t-252*ep-3*c*c)*d**6/720))*180/Math.PI;
  const lng=fuso*6-183+(d-(1+2*t+c)*d**3/6+(5-2*c+28*t-3*c*c+8*ep+24*t*t)*d**5/120)/Math.cos(p)*180/Math.PI;
  if (Math.abs(lng-(fuso*6-183))>3.1 || lat < -80 || lat > .001) throw new Error('Coordenada fora do fuso declarado. Confira o SRC no QGIS.');
  return [lng,lat];
}
export const coordenadaGMS=(v,latitude=false)=>{const ms=Math.round(Math.abs(v)*3600000),g=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),seg=(ms%60000/1000).toFixed(3).replace('.',',');return `${g}°${String(m).padStart(2,'0')}'${seg}" ${latitude?(v<0?'S':'N'):(v<0?'O':'L')}`;};
const normalizar=v=>String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function lerGeoJSON(texto) {
  const dados=JSON.parse(texto);
  if(dados.type!=='FeatureCollection' || !Array.isArray(dados.features) || !dados.features.length)throw new Error('Envie uma coleção de feições GeoJSON não vazia.');
  if(dados.features.length>2000)throw new Error('Importe até 2.000 feições por arquivo.');
  const epsg=Number(String(dados.crs?.properties?.name || '').match(/EPSG(?::|\/)+(\d+)$/i)?.[1]);
  if(epsg<31978 || epsg>31985 || !epsg)throw new Error('Exporte no QGIS como SIRGAS 2000 / UTM Sul (EPSG 31978 a 31985), incluindo o SRC no GeoJSON. Coordenadas em graus não serão tratadas como metros.');
  const campos=[...new Set(dados.features.flatMap(f=>Object.keys(f.properties || {})))].filter(k=>!['__proto__','constructor','prototype'].includes(k));
  return {dados,epsg,campos};
}
function conferirContorno(pontos) {
  if(pontos.length<4 || pontos.length>2001)throw new Error('O contorno precisa de 3 a 2.000 vértices e fechamento.');
  if(pontos.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw new Error('Contorno com coordenada inválida.');
  const mesmo=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  if(!mesmo(pontos[0],pontos.at(-1)))throw new Error('Contorno não fechado. Corrija a geometria no QGIS.');
  const ps=pontos.slice(0,-1);
  if(new Set(ps.map(p=>JSON.stringify(p.slice(0,2)))).size!==ps.length)throw new Error('Há vértices repetidos no contorno.');
  const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const cruza=(a,b,c,d)=>{
    if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))return false;
    return orient(a,b,c)*orient(a,b,d)<=0 && orient(c,d,a)*orient(c,d,b)<=0;
  };
  for(let i=0;i<ps.length;i++)for(let j=i+2;j<ps.length;j++)if(!(i===0&&j===ps.length-1)&&cruza(ps[i],ps[(i+1)%ps.length],ps[j],ps[(j+1)%ps.length]))throw new Error('O contorno se cruza. Corrija a geometria no QGIS.');
  return ps;
}
export function prepararFeicoes(lido,campo) {
  if(!lido.campos.includes(campo))throw new Error('Escolha o campo de código das feições.');
  const codigos=new Set(), nomes=new Map();
  let totalVertices=0;
  const feicoes=lido.dados.features.map((f,i)=>{
    const valor=f.properties?.[campo];
    if(!['string','number'].includes(typeof valor)||!normalizar(valor))throw new Error(`Feição ${i+1}: código vazio ou inválido.`);
    const codigo=String(valor).trim();
    if(codigos.has(normalizar(codigo)))throw new Error(`Código repetido: ${codigo}. Escolha um campo único por lote.`);
    codigos.add(normalizar(codigo));
    const g=f.geometry;
    const aneis=g?.type==='Polygon'?g.coordinates:g?.type==='MultiPolygon'&&g.coordinates.length===1?g.coordinates[0]:null;
    if(!aneis || aneis.length!==1)throw new Error(`${codigo}: use um polígono simples, sem ilhas, furos ou partes separadas. Nenhuma parte será descartada.`);
    totalVertices+=aneis[0]?.length||0;
    if(totalVertices>10000)throw new Error("O arquivo excede 10.000 vértices. Divida o levantamento no QGIS.");
    const pontos=conferirContorno(aneis[0]);
    const poligono=pontos.map(([e,n])=>utmParaMapa(e,n,lido.epsg-31960));
    const vertices=pontos.map(([e,n],j)=>{
      const chave=`${e},${n}`; // Não arredonda nem funde vértices próximos.
      if(!nomes.has(chave))nomes.set(chave,`V${nomes.size+1}`);
      return {nome:nomes.get(chave),e,n,longitude:coordenadaGMS(poligono[j][0]),latitude:coordenadaGMS(poligono[j][1],true),confrontante:''};
    });
    const calculado=processarVertices(vertices);
    if(calculado.area<=0)throw new Error(`${codigo}: área nula.`);
    return {id:crypto.randomUUID(),codigo,poligono,...calculado};
  });
  return {campo,epsg:lido.epsg,feicoes};
}
export function salvarImportacao(db,nucleoId,pacote,por) {
  const n=db.nucleos.find(n=>n.id===nucleoId);
  if(!n || n.etapa!==1)throw new Error('A importação é liberada na etapa Topografia.');
  if(n.levantamentoGeoJSON?.feicoes?.length)throw new Error('Este núcleo já possui um levantamento importado. A substituição não é automática, para preservar os vínculos existentes.');
  n.levantamentoGeoJSON={...n.levantamentoGeoJSON,...structuredClone(pacote),por,importadoEm:new Date().toISOString()};
  return db;
}
export function vincularFeicao(db,nucleoId,feicao,alvo,anterior,por) {
  const n=db.nucleos.find(n=>n.id===nucleoId);
  const atual=n?.levantamentoGeoJSON?.feicoes?.find(f=>f.id===feicao.id);
  if(!n || n.etapa!==1 || !atual)throw new Error('Reabra o levantamento na etapa Topografia.');
  if(atual.vinculo || JSON.stringify(atual)!==JSON.stringify(feicao))throw new Error('Esta feição foi alterada ou já vinculada. Reabra o levantamento.');
  const meridiano=`${Math.abs((n.levantamentoGeoJSON.epsg-31960)*6-183)}° O`;
  const texto=montarMemorial(atual.vertices,{sistema:'UTM',meridiano});
  if(alvo.tipo==='unidade'){
    const p=db.processos.find(p=>p.id===alvo.moradorId && p.nucleoId===nucleoId && !p._resumo);
    if(!p || p.situacao!=='Ativo' || p.arquivado || p.excluido)throw new Error('Morador indisponível.');
    if(n.levantamentoGeoJSON.feicoes.some(f=>f.vinculo?.moradorId===alvo.moradorId&&f.vinculo?.unidadeId===alvo.unidadeId))throw new Error('A unidade já tem um lote vinculado neste levantamento.');
    salvarUnidadeMemorial(db,{...anterior,moradorId:alvo.moradorId,unidadeId:alvo.unidadeId},{vertices:atual.vertices,area:atual.area,perimetro:atual.perimetro,memorial:texto},nucleoId);
  }else{
    if(!['nucleo','via','app','risco','publica','servidao'].includes(alvo.tipo))throw new Error('Escolha o destino do levantamento.');
    const id=alvo.tipo==='nucleo'?null:atual.id;
    salvarMemorialNucleo(db,nucleoId,anterior,{vertices:atual.vertices,area:atual.area,perimetro:atual.perimetro,texto,nome:alvo.nome?.trim()||atual.codigo,tipo:alvo.tipo},id,por);
  }
  atual.vinculo={...alvo,por,em:new Date().toISOString()};
  return db;
}

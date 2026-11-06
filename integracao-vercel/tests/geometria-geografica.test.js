import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from 'linkedom';
import {lerGeoJSONGeografico,lerKMLGeografico,poligonosParaMapa,caminhoPoligonoSVG,enquadrarGeometrias,salvarPerimetroGeografico,gerarKMLGeografico,geometriaDaFeicao} from '../geojson/geometria-geografica.js';
import {lerGeoJSON,prepararFeicoes,salvarImportacao,vincularFeicao,memorialDaFeicao,sugerirVinculos} from '../geojson/levantamento.js';
const exterior=[[-50,-27,0],[-49.9,-27,0],[-49.9,-26.9,0],[-50,-26.9,0],[-50,-27,0]];
const interior=[[-49.98,-26.98,2],[-49.98,-26.96,2],[-49.96,-26.96,2],[-49.96,-26.98,2],[-49.98,-26.98,2]];
const geometria=()=>({type:'Polygon',coordinates:[structuredClone(exterior),structuredClone(interior)]});
const arquivo=()=>({type:'FeatureCollection',features:[{type:'Feature',properties:{nome:'Contorno & área',codigo:'GEO_01'},geometry:geometria()}]});
const kml=()=>gerarKMLGeografico({geojson:arquivo()});

test('RFC 7946 preserva todas as coordenadas, altitude, fechamento e anéis internos',()=>{
 const a=arquivo(),lido=lerGeoJSONGeografico(JSON.stringify(a));assert.deepEqual(lido,a);assert.notEqual(lido.features[0].geometry,a.features[0].geometry);
});
test('RFC 7946 aceita geometria e Feature isoladas, rejeita projeção declarada sem presumir',()=>{
 assert.equal(lerGeoJSONGeografico(JSON.stringify(geometria())).features.length,1);
 assert.equal(lerGeoJSONGeografico(JSON.stringify(arquivo().features[0])).features.length,1);
 for(const crs of [null,{type:'name',properties:{name:'EPSG:4326'}},{properties:{name:'EPSG:31982'}}])assert.throws(()=>lerGeoJSONGeografico(JSON.stringify({...arquivo(),crs})),/crs/);
});
test('coordenadas fora do intervalo, texto, anéis abertos e autointerseção são rejeitados',()=>{
 for(const p of [[181,0],[0,91],['-50',-27],[NaN,-27]]){const a=arquivo();a.features[0].geometry.coordinates[0][1]=p;assert.throws(()=>lerGeoJSONGeografico(JSON.stringify(a)),/coordenada|longitude/);}
 const a=arquivo();a.features[0].geometry.coordinates[0].pop();assert.throws(()=>lerGeoJSONGeografico(JSON.stringify(a)),/fechado/);
 const b=arquivo();const ring=b.features[0].geometry.coordinates[0];[ring[1],ring[2]]=[ring[2],ring[1]];assert.throws(()=>lerGeoJSONGeografico(JSON.stringify(b)),/cruza/);
});
test('furos fora do contorno e sobrepostos não são aceitos',()=>{
 const a=arquivo();a.features[0].geometry.coordinates[1]=interior.map(p=>[p[0]+1,p[1],p[2]]);assert.throws(()=>lerGeoJSONGeografico(JSON.stringify(a)),/fora/);
 const b=arquivo();b.features[0].geometry.coordinates.push(structuredClone(interior));assert.throws(()=>lerGeoJSONGeografico(JSON.stringify(b)),/sobrepostos/);
});
test('multipolígonos preservam todas as partes na gravação e no enquadramento',()=>{
 const a=arquivo();a.features[0].geometry={type:'MultiPolygon',coordinates:[geometria().coordinates,[exterior.map(p=>[p[0]+.3,p[1],p[2]])]]};
 const lido=lerGeoJSONGeografico(JSON.stringify(a));assert.equal(poligonosParaMapa({geojson:lido}).length,2);assert.deepEqual(lido,a);
 const {centro,limites}=enquadrarGeometrias(lido);assert.ok(Number.isFinite(centro.lat));assert.equal(limites.oeste,-50);assert.equal(limites.leste,-49.6);
});
test('KML ida e volta preserva furos, coordenadas, altitude e nome escapado',()=>{
 const original=arquivo(),retorno=lerKMLGeografico(kml(),DOMParser);
 assert.deepEqual(retorno.features[0].geometry,original.features[0].geometry);assert.equal(retorno.features[0].properties.nome,'Contorno & área');
});
test('KML rejeita entidades, redes, links externos e mistura de linhas com polígonos',()=>{
 assert.throws(()=>lerKMLGeografico('<!DOCTYPE kml [<!ENTITY x SYSTEM "https://example.test/">]>'+kml(),DOMParser),/entidades/);
 for(const payload of ['<NetworkLink/>','<Link/>','<Icon><href>https://example.test/x.png</href></Icon>','<script>alert(1)</script>'])assert.throws(()=>lerKMLGeografico(kml().replace('<Document>','<Document>'+payload),DOMParser),/referências externas/);
 assert.throws(()=>lerKMLGeografico(kml().replace('</Placemark>','<LineString><coordinates>-50,-27 -49.9,-27</coordinates></LineString></Placemark>'),DOMParser),/mistura/);
});
test('KML com mais de uma feição retorna seleções independentes',()=>{
 const a=arquivo();a.features.push({...a.features[0],properties:{nome:'Outro'},geometry:{type:'Polygon',coordinates:[exterior.map(p=>[p[0]+.3,p[1],p[2]])]}});
 const lido=lerKMLGeografico(gerarKMLGeografico({geojson:a}),DOMParser);assert.equal(lido.features.length,2);assert.equal(lido.features[1].properties.nome,'Outro');
});
test('perímetro só substitui por confirmação e comparação de concorrência preserva dados',()=>{
 const anterior={poligonos:[exterior],area:12345,arquivo:'anterior.kml',campo:'preservar'},db={nucleos:[{id:'n',etapa:0,geo:structuredClone(anterior),memorial:{texto:'não alterar'},area:987}]};
 assert.throws(()=>salvarPerimetroGeografico(db,'n',arquivo(),{anterior}),/Confirme/);assert.deepEqual(db.nucleos[0].geo,anterior);
 salvarPerimetroGeografico(db,'n',arquivo(),{anterior,confirmarSubstituicao:true,por:'Teste',arquivo:'novo.kml'});
 assert.equal(db.nucleos[0].geo.area,12345);assert.equal(db.nucleos[0].area,987);assert.equal(db.nucleos[0].geo.campo,'preservar');assert.equal(db.nucleos[0].memorial.texto,'não alterar');assert.equal(db.nucleos[0].etapa,0);
 assert.deepEqual(db.nucleos[0].geo.geojson,arquivo());assert.throws(()=>salvarPerimetroGeografico(db,'n',arquivo(),{anterior,confirmarSubstituicao:true}),/alterado/);
});
test('persistência por JSON e outra sessão mantém furos; download independe de localStorage',()=>{
 const db={nucleos:[{id:'n'}]};salvarPerimetroGeografico(db,'n',arquivo(),{anterior:null});const reaberto=JSON.parse(JSON.stringify(db));
 const geo=reaberto.nucleos[0].geo;assert.equal(poligonosParaMapa(geo)[0].length,2);assert.deepEqual(lerKMLGeografico(gerarKMLGeografico(geo),DOMParser).features[0].geometry,geometria());
 const path=caminhoPoligonoSVG(poligonosParaMapa(geo)[0],p=>p.slice(0,2));assert.equal(path.split('M').length-1,2);assert.equal(path.split(' Z').length-1,2);
});
test('GeoJSON geográfico importa antes da Topografia sem preencher medidas ou memoriais',()=>{
 const preparado=prepararFeicoes(lerGeoJSON(JSON.stringify(arquivo())),'codigo'),db={nucleos:[{id:'n',etapa:0,memorial:{texto:'original',area:100}}],processos:[]};
 salvarImportacao(db,'n',preparado,'Projetos');const f=db.nucleos[0].levantamentoGeoJSON.feicoes[0];assert.deepEqual(f.geometria,geometria());assert.equal(f.area,undefined);assert.deepEqual(db.nucleos[0].memorial,{texto:'original',area:100});assert.equal(db.nucleos[0].etapa,0);
 assert.throws(()=>vincularFeicao(db,'n',f,{tipo:'nucleo'},db.nucleos[0].memorial,'Projetos'),/coordenadas geográficas/);
 assert.deepEqual(geometriaDaFeicao(f),geometria());assert.throws(()=>salvarImportacao(db,'n',preparado,'Projetos'),/Código repetido/);
});
test('feições sem propriedades têm opção explícita de numeração e não geram titularidade',()=>{
 const lido=lerGeoJSON(JSON.stringify(geometria())),p=prepararFeicoes(lido,'__sequencia__');assert.equal(p.feicoes[0].codigo,'Feição 1');assert.equal(p.feicoes[0].codigoMorador,'');assert.equal(p.feicoes[0].vinculo,undefined);
});
test('GeoJSON geográfico pode complementar UTM sem alterar fonte, medidas ou feições antigas',()=>{
 const utm={type:'FeatureCollection',crs:{type:'name',properties:{name:'EPSG:31982'}},features:[{type:'Feature',properties:{codigo:'UTM_01'},geometry:{type:'Polygon',coordinates:[[[500000,7000000],[500020,7000000],[500020,7000010],[500000,7000010],[500000,7000000]]]}}]};
 const db={nucleos:[{id:'n',etapa:0}],processos:[]};salvarImportacao(db,'n',prepararFeicoes(lerGeoJSON(JSON.stringify(utm)),'codigo'),'T');
 const antes=structuredClone(db.nucleos[0].levantamentoGeoJSON.feicoes[0]);salvarImportacao(db,'n',prepararFeicoes(lerGeoJSON(JSON.stringify(arquivo())),'codigo'),'P');
 const levantamento=db.nucleos[0].levantamentoGeoJSON;assert.deepEqual(levantamento.feicoes[0],antes);assert.equal(levantamento.epsg,31982);assert.equal(levantamento.feicoes[1].epsg,4326);assert.equal(levantamento.feicoes[0].area,200);
 assert.match(memorialDaFeicao(levantamento.feicoes[0],4326),/SIRGAS 2000/);assert.equal(sugerirVinculos(levantamento.feicoes,[]).length,1);
});

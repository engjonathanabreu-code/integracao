import test from 'node:test';
import assert from 'node:assert/strict';
import { lerGeoJSON, prepararFeicoes, salvarImportacao, vincularFeicao, utmParaMapa } from '../geojson/levantamento.js';
import { complementoNucleoPRF } from '../src/cadastros-prf.js';
const arquivo=()=>({type:'FeatureCollection',crs:{type:'name',properties:{name:'urn:ogc:def:crs:EPSG::31982'}},features:[{type:'Feature',properties:{Lote:'Lote teste',Codprocess:'TESTE_001'},geometry:{type:'Polygon',coordinates:[[[500000,7000000],[500020,7000000],[500020,7000010],[500000,7000010],[500000,7000000]]]}}]});
const preparar=(d=arquivo(),campo='Lote')=>prepararFeicoes(lerGeoJSON(JSON.stringify(d)),campo);
const banco=()=>({nucleos:[{id:'n',etapa:1,outro:'preservar',memorial:{chave:'preservar'}}],processos:[{id:'p',nucleoId:'n',situacao:'Ativo',requerente:{nome:'Teste'},unidades:[{id:'u',caracteristicas:'preservar',memorial:'anterior'},{id:'irma',outro:123}]}]});
test('GeoJSON reconhece códigos alternativos, remove só fechamento e calcula retângulo',()=>{
 const p=preparar();assert.equal(p.feicoes.length,1);assert.equal(p.feicoes[0].vertices.length,4);assert.equal(p.feicoes[0].area,200);assert.equal(p.feicoes[0].perimetro,60);assert.equal(p.feicoes[0].vertices[0].azimuteDecimal,90);assert.equal(preparar(arquivo(),'Codprocess').feicoes[0].codigo,'TESTE_001');
});
test('inversa UTM mantém meridiano central e hemisfério',()=>{const [lng,lat]=utmParaMapa(500000,7000000,22);assert.ok(Math.abs(lng+51)<1e-10);assert.ok(lat<-27&&lat>-28);});
test('pontos comuns compartilham nome, sem fundir pontos apenas próximos',()=>{const a=arquivo();a.features.push(structuredClone(a.features[0]));a.features[1].properties.Lote='Outro';const fs=preparar(a).feicoes;assert.equal(fs[0].vertices[0].nome,fs[1].vertices[0].nome);});
test('códigos vazios ou duplicados, SRC ausente e graus não são importados',()=>{
 const a=arquivo();a.features[0].properties.Lote='';assert.throws(()=>preparar(a),/vazio/);
 const b=arquivo();b.features.push(structuredClone(b.features[0]));assert.throws(()=>preparar(b),/repetido/);
 const c=arquivo();delete c.crs;assert.throws(()=>preparar(c),/SRC/);
 const d=arquivo();d.crs.properties.name='EPSG:4326';assert.throws(()=>preparar(d),/graus/);
});
test('furos, multipartes, autointerseção e anel aberto não perdem geometria silenciosamente',()=>{
 const a=arquivo();a.features[0].geometry.coordinates.push(a.features[0].geometry.coordinates[0]);assert.throws(()=>preparar(a),/furos/);
 const b=arquivo();b.features[0].geometry={type:'MultiPolygon',coordinates:[b.features[0].geometry.coordinates,b.features[0].geometry.coordinates]};assert.throws(()=>preparar(b),/partes/);
 const c=arquivo();[c.features[0].geometry.coordinates[0][1],c.features[0].geometry.coordinates[0][2]]=[c.features[0].geometry.coordinates[0][2],c.features[0].geometry.coordinates[0][1]];assert.throws(()=>preparar(c),/cruza/);
 const d=arquivo();d.features[0].geometry.coordinates[0].pop();assert.throws(()=>preparar(d),/fechado/);
});
test('importação é aditiva e não altera morador nem substitui levantamento já existente',()=>{
 const db=banco(),antes=structuredClone(db.processos);salvarImportacao(db,'n',preparar(),'Agente');assert.deepEqual(db.processos,antes);assert.equal(db.nucleos[0].outro,'preservar');assert.throws(()=>salvarImportacao(db,'n',preparar(),'Outro'),/Código repetido/);
});
test('vínculo preenche memorial da unidade preservando demais chaves e unidades',()=>{
 const db=banco();salvarImportacao(db,'n',preparar(),'Agente');const f=structuredClone(db.nucleos[0].levantamentoGeoJSON.feicoes[0]),antes=structuredClone(db.processos[0].unidades[0]);
 vincularFeicao(db,'n',f,{tipo:'unidade',moradorId:'p',unidadeId:'u'},antes,'Agente');const u=db.processos[0].unidades[0];assert.equal(u.area,200);assert.equal(u.caracteristicas,'preservar');assert.deepEqual(db.processos[0].unidades[1],{id:'irma',outro:123});assert.match(u.memorial,/SIRGAS 2000/);assert.equal(db.nucleos[0].levantamentoGeoJSON.feicoes[0].vinculo.por,'Agente');assert.throws(()=>vincularFeicao(db,'n',f,{tipo:'app'},null,'Agente'),/já vinculada/);
});
test('edição concorrente de memorial é bloqueada',()=>{const db=banco();salvarImportacao(db,'n',preparar(),'A');const antes=structuredClone(db.processos[0].unidades[0]);db.processos[0].unidades[0].memorial='Revisado';assert.throws(()=>vincularFeicao(db,'n',db.nucleos[0].levantamentoGeoJSON.feicoes[0],{tipo:'unidade',moradorId:'p',unidadeId:'u'},antes,'A'),/mudou/);assert.equal(db.processos[0].unidades[0].memorial,'Revisado');});
test('APP, risco, via, área pública e servidão alimentam dados do PRF',()=>{
 for(const tipo of ['app','risco','via','publica','servidao']){const db=banco();salvarImportacao(db,'n',preparar(),'A');vincularFeicao(db,'n',db.nucleos[0].levantamentoGeoJSON.feicoes[0],{tipo,nome:'Área teste'},null,'A');const n=db.nucleos[0];assert.equal(n.memorial.vias[0].area,200);assert.equal(n.memorial.chave,'preservar');assert.ok(JSON.stringify(complementoNucleoPRF(n)).includes('200'));}
});
test('sugestões usam código do morador separado do lote e exigem confirmação',async()=>{
 const {sugerirVinculos,confirmarSugestoes}=await import('../geojson/levantamento.js');
 const a=arquivo();a.features[0].properties.Codigo='TST01_0001';delete a.features[0].properties.Codprocess;
 const db=banco();db.processos[0].codigo='TST01_001';db.processos[0].unidades=db.processos[0].unidades.slice(0,1);
 salvarImportacao(db,'n',preparar(a),'A');
 const {unidadesParaMemoriais}=await import('../memoriais/integracaoMemoriais.js');
 const sugestoes=sugerirVinculos(db.nucleos[0].levantamentoGeoJSON.feicoes,unidadesParaMemoriais(db.processos,'n'));
 assert.equal(sugestoes[0].unidade.moradorId,'p');assert.equal(db.processos[0].unidades[0].memorial,'anterior');
 const novo=confirmarSugestoes(db,'n',sugestoes,'Revisor');assert.equal(novo.processos[0].unidades[0].area,200);assert.equal(db.processos[0].unidades[0].memorial,'anterior');
});
test('códigos ausentes, duplicados e unidades ambíguas não geram vínculo automático',async()=>{
 const {sugerirVinculos}=await import('../geojson/levantamento.js');const u={id:'u',codigo:'TST_001',moradorId:'p',unidadeId:'u'};
 assert.equal(sugerirVinculos([{codigo:'Q01_L01'}],[u])[0].unidade,null);
 assert.equal(sugerirVinculos([{codigo:'TST_001'}],[u,{...u,id:'outra'}])[0].unidade,null);
 assert(sugerirVinculos([{codigo:'A',codigoMorador:'TST_001'},{codigo:'B',codigoMorador:'TST_001'}],[u]).every(s=>!s.unidade));
});
test('revogação preserva histórico e outras unidades e libera a feição',async()=>{
 const {revogarMemorial}=await import('../memoriais/revogacao.js');const db=banco();salvarImportacao(db,'n',preparar(),'A');
 const alvo={tipo:'unidade',moradorId:'p',unidadeId:'u'};vincularFeicao(db,'n',db.nucleos[0].levantamentoGeoJSON.feicoes[0],alvo,structuredClone(db.processos[0].unidades[0]),'A');
 const anterior=structuredClone(db.processos[0].unidades[0]);
 assert.throws(()=>revogarMemorial(db,'n',alvo,anterior,'','A'),/motivo/);
 revogarMemorial(db,'n',alvo,anterior,'Destino incorreto','A');
 assert.equal(db.processos[0].unidades[0].memorial,'');assert.equal(db.processos[0].unidades[0].caracteristicas,'preservar');assert.equal(db.nucleos[0].memoriaisRevogados[0].memorial.memorial,anterior.memorial);assert.equal(db.nucleos[0].levantamentoGeoJSON.feicoes[0].vinculo,null);
 assert.throws(()=>revogarMemorial(db,'n',alvo,anterior,'Repetido','A'),/mudou/);
});
test('revogar via não remove o contorno do núcleo ou outras vias',async()=>{
 const {revogarMemorial}=await import('../memoriais/revogacao.js');const db=banco();salvarImportacao(db,'n',preparar(),'A');const f=db.nucleos[0].levantamentoGeoJSON.feicoes[0];vincularFeicao(db,'n',f,{tipo:'via',nome:'Rua'},null,'A');
 const anterior=structuredClone(db.nucleos[0].memorial.vias[0]);db.nucleos[0].memorial.vias.push({id:'outra',texto:'Preservado'});
 revogarMemorial(db,'n',{tipo:'via',viaId:f.id},anterior,'Revisão','A');assert.equal(db.nucleos[0].memorial.chave,'preservar');assert.equal(db.nucleos[0].memorial.vias[0].texto,'Preservado');
});
test('antes da Topografia não importa',()=>{for(const etapa of [0]){const db=banco();db.nucleos[0].etapa=etapa;assert.throws(()=>salvarImportacao(db,'n',preparar(),'A'),/Topografia/);}});

test('arquivos complementares preservam vínculos e reutilizam vértices comuns',()=>{
 const db=banco();salvarImportacao(db,'n',preparar(),'A');
 const f=db.nucleos[0].levantamentoGeoJSON.feicoes[0];vincularFeicao(db,'n',f,{tipo:'app',nome:'APP'},null,'A');const antes=structuredClone(f);
 const a=arquivo();a.features[0].properties.Lote='Estrada';a.features[0].geometry.coordinates[0]=[[500020,7000000],[500040,7000000],[500040,7000010],[500020,7000010],[500020,7000000]];
 salvarImportacao(db,'n',preparar(a),'B');const fs=db.nucleos[0].levantamentoGeoJSON.feicoes;
 assert.deepEqual(fs[0],antes);assert.equal(fs.length,2);assert.equal(fs[1].vertices[0].nome,fs[0].vertices[1].nome);assert.notEqual(fs[1].vertices[1].nome,fs[0].vertices[0].nome);assert.equal(fs[1].area,200);
 const estado=structuredClone(db);const pacote=preparar(a);pacote.epsg=31983;assert.throws(()=>salvarImportacao(db,'n',pacote,'B'),/mesmo SRC/);assert.deepEqual(db,estado);
});
test('núcleo após Topografia gera memorial e áreas expõem texto para PRF',()=>{
 for(const etapa of [1,2,3,4,5]){const db=banco();db.nucleos[0].etapa=etapa;salvarImportacao(db,'n',preparar(),'A');vincularFeicao(db,'n',db.nucleos[0].levantamentoGeoJSON.feicoes[0],{tipo:'nucleo',nome:'Núcleo'},structuredClone(db.nucleos[0].memorial),'A');assert.match(db.nucleos[0].memorial.texto,/SIRGAS 2000/);assert.equal(db.nucleos[0].memorial.area,200);}
 const db=banco();salvarImportacao(db,'n',preparar(),'A');vincularFeicao(db,'n',db.nucleos[0].levantamentoGeoJSON.feicoes[0],{tipo:'app',nome:'APP'},null,'A');assert.ok(JSON.stringify(complementoNucleoPRF(db.nucleos[0])).includes('Inicia-se'));
});

import test from 'node:test';import assert from 'node:assert/strict';
import {prepararContrato,como,id} from './atribuicoes-contrato.fixture.js';
import {requisitosEtapa,aplicarAjustesRequisitos,preenchido} from '../src/requisitos-moradores.js';
import fs from 'node:fs';
import {CONFRONTANTES} from '../src/confrontantes.js';
const completo=(etapa=3)=>({etapa,situacao:'Ativo',nucleoId:id(201),checks:{medicao:true,lepac:true,conferencia:true,confrontacoes:true,termoAssinado:true},campos:{},extras:{...Object.fromEntries(CONFRONTANTES.map(c=>[c.id,'Confrontante fictício'])),cp_uso:'Residencial'},campo:{fotos:[{tipo:'fachada'}],respostas:{}},unidades:[{area:'123,45',memorial:'Descrição fictícia detalhada de todos os limites da unidade.',loteQuadra:'Lote 1 Quadra A'}],documentosGerados:[{tipo:'termo_compromisso'}],docs:[]});
function preencher(p,config){for(const c of config.checklist||[])p.campo.respostas[c.id]=c.tipo==='check'?true:c.tipo==='simnao'?'nao':'1';return p;}
const ordenado=x=>x.toSorted();
test('SQL versionado conserva os defaults reais e a fonte do avaliador',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),trecho=app.slice(app.indexOf('const CAMPOS_PADRAO ='),app.indexOf('const USUARIOS_PADRAO ='));
 const padrao=new Function(trecho+';return {campos:CAMPOS_PADRAO,checklist:CHECKLIST_CAMPO_PADRAO};')();
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261014113728_atribuicoes_contrato_especifico.sql',import.meta.url),'utf8');
 assert.ok(sql.includes('$padroes$'+JSON.stringify(padrao)+'$padroes$'));
 assert.ok(sql.includes(fs.readFileSync(new URL('../supabase/operacoes/atribuicoes-fluxo.sql',import.meta.url),'utf8')));
});
test('avaliador de nucleo coincide com funcao real da UI, inclusive ajustes opcionais e municipais',async()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const etapas=app.slice(app.indexOf('const NUCLEO_ETAPAS ='),app.indexOf('const TOTAL_NUCLEO ='));
 const fn=app.slice(app.indexOf('function requisitosPadraoNucleo('),app.indexOf('const pendenciasNucleo ='));
 const requisitos=new Function('preenchido','progressoNucleo',etapas+fn+';return requisitosPadraoNucleo;')(preenchido,db=>db.pg);
 const {db}=await prepararContrato();try{
 for(const etapa of [1,2])for(let i=0;i<64;i++){
  const nome=etapa===1?'topografia':'projeto',n={campos:{artPrf:i&1?'ART':'',estudoAmbiental:i&2?'sim':'nao',artAmbiental:i&4?'ART ambiental':'',estudoRisco:i&8?'sim':''},checks:{termos:!!(i&16),'extra-local':!!(i&32)}};
  const ativos=i%5,prontos=i%3,municipal=i%2===0,ajuste=i%3?{}:{opcionais:['moradores','artPrf'],desativados:['estudoRisco'],extras:[{id:'extra-local',tipo:'manual'}]};
  const ajustes={['nucleo:'+nome]:ajuste,...(municipal?{_municipal:true}:{})};
  const esperado=aplicarAjustesRequisitos(requisitos({pg:{ativos,prontos}},n,nome),'nucleo:'+nome,ajustes,n).filter(r=>!r.ok).map(r=>r.id);
  const atual=(await db.query('select integracao_atribuicoes_privado.avaliar_nucleo($1,$2,$3,$4,$5) falhas',[JSON.stringify(n),etapa,JSON.stringify({ajustes,municipal}),ativos,prontos])).rows[0].falhas;
  assert.deepEqual(ordenado(atual),ordenado(esperado),`${nome}/${i}`);
 }
 }finally{await db.close();}
});
test('avaliador PostgreSQL coincide com as regras reais da UI nas duas etapas e nos ajustes municipais',async()=>{
 const {db}=await prepararContrato();try{
 const padrao=(await db.query('select integracao_atribuicoes_privado.padroes_fluxo() p')).rows[0].p;
 for(const etapa of [3,4])for(let i=0;i<96;i++){
  const p=preencher(completo(etapa),padrao),nome=etapa===3?'topografia':'projeto';
  const config={...structuredClone(padrao),ajustes:{},municipal:i%3===0};
  if(i&1)p.checks.medicao=false;if(i&2)p.campo.fotos=[];if(i&4)p.extras[CONFRONTANTES[0].id]='';if(i&8)p.unidades[0].area='0';if(i&16)p.unidades[0].memorial='curto';if(i&32)p.unidades[0].loteQuadra='';if(i&64)p.documentosGerados=[];
  if(i%5===0){config.ajustes[nome]={opcionais:['medicao','info_campo','termo_gerado'],desativados:['confrontantes','loteQuadra'],extras:[{id:'manual-local'},{id:'campo-local',tipo:'campo'},{id:'opcional-local',opcional:true}]};p.campos['campo-local']=i%2?'valor':'';}
  config.campos.lista.push({id:'grupo-local',ativo:true,tipo:'grupo',repetir:true,subcampos:[{id:'a'},{id:'b'}],obrigatorioEtapa:nome});p.extras['grupo-local']=i%2?[{a:'Texto',b:0}]:[];
  const ctx={nucleo:{id:id(201),etapa:2},checklist:config.checklist,campos:config.campos.lista,ajustesReq:{...config.ajustes,...(config.municipal?{_municipal:true}:{})}};
  const esperadas=requisitosEtapa(nome,p,ctx).filter(r=>!r.ok).map(r=>r.id);
  const atuais=(await db.query('select integracao_atribuicoes_privado.avaliar_fluxo($1,$2,$3,$4) falhas',[JSON.stringify(p),etapa,JSON.stringify(config),JSON.stringify(ctx.nucleo)])).rows[0].falhas;
  assert.deepEqual(ordenado(atuais),ordenado(esperadas),`${nome}/${i}`);
 }
 }finally{await db.close();}
});

test('nucleo exige moradores prontos e requisitos de projeto; municipio canonico vence JSON forjado',async()=>{
 const {db}=await prepararContrato();try{
 await db.exec(`insert into fin_receb_municipios values('${id(450)}','São Modelo','SC');update processos_kanban set municipio='Sao Modelo',estado='SC';`);
 await db.query(`insert into integracao_nucleos values('nucleos',$1,$2,'processos_kanban',$1::text::uuid,$3)`,[id(201),JSON.stringify({etapa:1,municipioId:'forjado'}),id(4)]);
 await db.query(`update integracao_moradores set dados=$1,referencia_id=$2`,[JSON.stringify({etapa:3,nucleoId:id(201),situacao:'Ativo'}),id(200)]);
 const advance=(ator,etapa)=>como(db,ator,`update integracao_nucleos set dados=jsonb_set(dados,'{etapa}',$1) where registro_id=$2`,[JSON.stringify(etapa),id(201)]);
 await assert.rejects(advance(2,2),e=>e.code==='PT409'&&e.detail.includes('moradores'));
 await db.exec(`update integracao_moradores set dados=jsonb_set(dados,'{etapa}','4')`);
 await assert.rejects(como(db,2,`update integracao_nucleos set dados=jsonb_set(dados,'{checks}','{"moradores":true}')`),/automatico/);
 await advance(2,2);await assert.rejects(advance(2,3),/setorial/);
 await assert.rejects(advance(1,3),e=>e.detail.includes('artPrf')&&e.detail.includes('moradores'));
 await db.exec(`update integracao_moradores set dados=jsonb_set(dados,'{etapa}','5')`);
 await db.query(`update integracao_nucleos set dados=$1`,[JSON.stringify({etapa:2,municipioId:'forjado',campos:{artPrf:'ART fictícia',estudoAmbiental:'nao',estudoRisco:'nao'},checks:{termos:true}})]);
 await advance(1,3);
 // A municipal rule cannot be bypassed by changing municipioId in the JSON.
 await db.query(`insert into integracao_configuracoes values('config','ajustesMunicipio',$1)`,[JSON.stringify({valor:{[id(450)]:{ajustesRequisitos:{'nucleo:topografia':{extras:[{id:'vistoria-local',tipo:'manual'}]}}}}})]);
 await db.query(`update integracao_nucleos set dados=$1`,[JSON.stringify({etapa:1,municipioId:'forjado'})]);
 await assert.rejects(advance(2,0),/motivo/);
 await assert.rejects(advance(2,3),/pular/);
 assert.equal((await db.query(`select integracao_atribuicoes_privado.normalizar_municipio(' São Modelo ') valor`)).rows[0].valor,'sao modelo');
 await assert.rejects(advance(2,2),e=>e.code==='PT409'&&e.detail.includes('vistoria-local'));
 await como(db,2,`update integracao_nucleos set dados=jsonb_set(dados,'{checks}','{"vistoria-local":true}')`);
 await advance(2,2);
 }finally{await db.close();}
});
test('UPDATE real nega avanço incompleto, núcleo atrasado, campo automático forjado e aceita fluxo completo',async()=>{
 const {db}=await prepararContrato();try{
 const padrao=(await db.query('select integracao_atribuicoes_privado.padroes_fluxo() p')).rows[0].p;
 await db.query(`insert into integracao_nucleos values('nucleos',$1,'{"etapa":0}','processos_kanban',$2,$3)`,[id(201),id(201),id(4)]);
 await db.query(`update fin_receb_clientes set municipio_id=$1 where id=$2`,[id(450),id(200)]);
 const seed=async p=>db.query('update integracao_moradores set dados=$1,referencia_id=$2 where registro_id=$3',[JSON.stringify(p),id(200),id(200)]);
 const avancar=(ator,etapa)=>como(db,ator,`update integracao_moradores set dados=jsonb_set(dados,'{etapa}',$1) where registro_id=$2`,[JSON.stringify(etapa),id(200)]);
 await seed(preencher(completo(),padrao));await assert.rejects(avancar(2,4),/nucleo/);
 await db.exec(`update integracao_nucleos set dados='{"etapa":1}' where registro_id='${id(201)}'`);
 const incompleto=preencher(completo(),padrao);incompleto.campo.fotos=[];incompleto.checks.lepac=false;incompleto._resumo=true;incompleto._pendencias=0;await seed(incompleto);
 await assert.rejects(avancar(2,4),e=>e.code==='PT409'&&e.detail.includes('foto_fachada')&&e.detail.includes('lepac'));
 assert.equal((await db.query('select dados->>\'etapa\' etapa from integracao_moradores')).rows[0].etapa,'3');
 await seed(preencher(completo(),padrao));await assert.rejects(como(db,2,`update integracao_moradores set dados=jsonb_set(dados,'{checks,area}','true') where registro_id='${id(200)}'`),/automatico/);
 await avancar(2,4);await assert.rejects(avancar(2,5),/Fluxo setorial/);
 await db.query(`insert into integracao_complementos values('processos',$1,$2,$1::text::uuid)`,[id(200),JSON.stringify(incompleto)]);
 await assert.rejects(como(db,2,`update integracao_complementos set dados=jsonb_set(dados,'{etapa}','4') where registro_id='${id(200)}'`),e=>e.code==='PT409');
 await assert.rejects(como(db,2,`update integracao_complementos set colecao='outra' where registro_id='${id(200)}'`),/Colecao/);
 await assert.rejects(como(db,2,`delete from integracao_complementos where registro_id='${id(200)}'`),/autorizada/);
 const projeto=preencher(completo(4),padrao);projeto.documentosGerados=[];await seed(projeto);await db.exec(`update integracao_nucleos set dados='{"etapa":2}' where registro_id='${id(201)}'`);
 await assert.rejects(avancar(1,5),e=>e.detail.includes('termo_gerado'));projeto.documentosGerados=[{tipo:'termo_compromisso'}];await seed(projeto);await avancar(1,5);
 await seed(preencher(completo(),padrao));await db.exec(`update fin_receb_clientes set ativo=false where id='${id(200)}'`);await assert.rejects(avancar(2,4),/inativo/);
 }finally{await db.close();}
});

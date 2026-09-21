import test from 'node:test';import assert from 'node:assert/strict';
import {metasLocaisParaCompartilhar,responsavelMeta} from '../src/metas-identidade.js';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
test('responsável reconhecido pelo ID canônico e alias ERP',()=>{
 assert(responsavelMeta({responsaveis:[id(1)]},{id:'erp_'+id(1)}));assert(responsavelMeta({responsaveis:['erp_'+id(1)]},{id:'local',erpRef:id(1)}));assert(!responsavelMeta({responsaveis:[id(2)]},{id:id(1)}));
});
test('meta local já existente na abertura é enviada com responsáveis e checklist',()=>{
 const base=fixture(),local=blank();local.metas=[{id:id(100),titulo:'Meta local',status:'Em andamento',semana_inicio:'2026-09-21',prazo:'2026-09-25',setor:'Topografia',associacao_tipo:'avulsa',responsaveis:['erp_'+id(1)],criadoPor:'erp_'+id(1),checklist:[{id:id(101),titulo:'Conferir'}],historico:[],arquivos:[]}];
 const state=projetar(base,local),usuario=state.db.usuarios[0];const recuperar=metasLocaisParaCompartilhar(base,state.db,usuario);assert.equal(recuperar.length,1);
 const before={...state.db,metas:state.db.metas.filter(m=>m.id!==id(100))};const ops=prepararEdicao(before,state.db,state,usuario);
 for(const table of ['metas','meta_responsaveis','meta_checklist'])assert(ops.some(o=>o.table===table&&o.insert),table);
 base.metas.push({id:id(100)});assert.equal(metasLocaisParaCompartilhar(base,state.db,usuario).length,0);
});
test('recuperação não recria meta apagada, demonstração nem meta alheia',()=>{
 const base=fixture(),db={metas:[{id:id(50),_compartilhado:true},{id:'demo'},{id:id(52),criadoPor:'outro',responsaveis:[]} ]};
 assert.equal(metasLocaisParaCompartilhar(base,db,{id:'erp_'+id(1),setor:'comercial'}).length,0);
});

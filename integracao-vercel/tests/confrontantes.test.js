import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFRONTANTES, confrontantesDe, confrontantesFaltando, campoComConfrontantes, aplicarLevantamento, conflitoConfrontantes, versaoConfrontantes } from '../src/confrontantes.js';
import { requisitosEtapa, campoCompleto, pendencias } from '../src/requisitos-moradores.js';
import { fixture, blank } from './fixture.js';
import { copy, projetar, prepararEdicao } from '../src/dados-compartilhados.js';
import { resumirMoradores } from '../src/resumo-moradores.js';
const valores={frente:'Rua de teste',fundo:'Área de teste',direito:'Vizinho direito',esquerdo:'Vizinho esquerdo'};
const pessoa=()=>({ id:'p',codigo:'TST1',requerente:{},nucleoId:'n',municipioId:'m',etapa:3,situacao:'Ativo',checks:{medicao:true,lepac:true,conferencia:true},campos:{},extras:{outro:'Preservar'},unidades:[{area:'200',memorial:'Memorial de teste suficientemente longo para validar.'}],campo:{fotos:[{tipo:'fachada'}],respostas:{},data:'2026-09-15T10:00:00Z'} });
const contexto={nucleo:{id:'n'},campos:[],checklist:[]};
const banco=p=>({nucleos:[contexto.nucleo],processos:[p],checklistCampo:[],campos:{lista:[]}});
test('existing custom values populate built-in fields without migration',()=>{
 const p=pessoa();for(const c of CONFRONTANTES)p.extras[c.id]=valores[c.lado];
 assert.deepEqual(confrontantesDe(p),valores);assert.deepEqual(confrontantesFaltando(p),[]);assert.equal(p.extras.outro,'Preservar');
});
test('all four sides are required; whitespace is not a completed answer',()=>{
 const p=pessoa();assert.equal(confrontantesFaltando(p).length,4);
 aplicarLevantamento(p,{...p.campo,confrontantes:{...valores,frente:'  '}});assert.deepEqual(confrontantesFaltando(p),['Frente']);
 assert.equal(campoCompleto(banco(p),p),false);assert.equal(requisitosEtapa('topografia',p,contexto).find(r=>r.id==='confrontantes').ok,false);
 aplicarLevantamento(p,{...p.campo,confrontantes:valores});assert.equal(campoCompleto(banco(p),p),true);assert.equal(pendencias(banco(p),p).length,0);
});
test('required rule cannot be disabled or made optional by old configuration',()=>{
 const r=requisitosEtapa('topografia',pessoa(),{...contexto,ajustesReq:{topografia:{desativados:['confrontantes'],opcionais:['confrontantes']}}}).find(r=>r.id==='confrontantes');assert.ok(r);assert.equal(r.ok,false);assert.ok(!r.opcional);
});
test('documental and later stages do not receive the new topography requirement',()=>{
 const p=pessoa();p.etapa=4;p.unidades[0].loteQuadra='Lote A';p.documentosGerados=[];
 assert.ok(!requisitosEtapa('projeto',p,contexto).some(r=>r.id==='confrontantes'));
});
test('offline package retains answers through serialization and updates same customer extras',()=>{
 const p=pessoa();aplicarLevantamento(p,{...p.campo,confrontantes:valores});
 const un=JSON.parse(JSON.stringify({campo:campoComConfrontantes(p),versaoConfrontantesBase:versaoConfrontantes(p)}));un.campo.confrontantes.fundo='Novo fundo coletado';
 assert.equal(conflitoConfrontantes(p,un),false);aplicarLevantamento(p,un.campo);assert.equal(confrontantesDe(p).fundo,'Novo fundo coletado');assert.equal(p.extras.outro,'Preservar');
});
test('old offline package without these fields cannot erase customer values',()=>{
 const p=pessoa();aplicarLevantamento(p,{...p.campo,confrontantes:valores});aplicarLevantamento(p,{fotos:[],respostas:{},data:'new'});assert.deepEqual(confrontantesDe(p),valores);
});
test('office change after download becomes a conflict; identical retry is safe',()=>{
 const p=pessoa();aplicarLevantamento(p,{...p.campo,confrontantes:valores});const un={campo:campoComConfrontantes(p),versaoConfrontantesBase:versaoConfrontantes(p)};
 p.extras[CONFRONTANTES[0].id]='Mudança no escritório';assert.equal(conflitoConfrontantes(p,un),true);
 un.campo=campoComConfrontantes(p);assert.equal(conflitoConfrontantes(p,un),false);
});
test('edited legacy package requires review before replacing populated customer data',()=>{
 const p=pessoa();aplicarLevantamento(p,{...p.campo,confrontantes:valores});const un={campo:{confrontantes:{...valores,frente:'Novo'}}};assert.equal(conflitoConfrontantes(p,un),true);assert.equal(conflitoConfrontantes(pessoa(),un),false);
});
test('explicit clearing in customer record wins over older field snapshot',()=>{
 const p=pessoa();aplicarLevantamento(p,{...p.campo,confrontantes:valores});p.extras[CONFRONTANTES[0].id]='';assert.equal(confrontantesDe(p).frente,'');assert.equal(campoCompleto(banco(p),p),false);
});
test('cloud persistence roundtrip on a new device preserves field answers and customer data',()=>{
 const state=projetar(fixture(),blank()),next=copy(state.db),p=next.processos[0];
 aplicarLevantamento(p,{...p.campo,confrontantes:valores,data:'2026-09-15T15:00:00Z'});
 const ops=prepararEdicao(state.db,next,state,next.usuarios[0]);assert.ok(ops.length);assert.ok(ops.every(o=>o.table==='integracao_moradores'));
 const base=copy(state.base);for(const op of ops){const rows=base[op.table] ||= [];if(op.insert)rows.push({...op.key,...op.changes});else Object.assign(rows.find(r=>Object.entries(op.key).every(([k,v])=>r[k]===v)),op.changes);}
 const cold=projetar(base,blank()).db.processos.find(x=>x.id===p.id);assert.deepEqual(confrontantesDe(cold),valores);assert.deepEqual(cold.campo.confrontantes,valores);
});
test('pending dashboard and resident details use identical required checks',()=>{
 const p=pessoa();const ctx=banco(p),carga={clientes:[],complementos:[{registro_id:p.id,dados:p}]};
 let resumo=resumirMoradores(carga,ctx)[0];assert.equal(resumo._pendencias,pendencias(ctx,p).length);assert.equal(resumo._campoCompleto,false);
 aplicarLevantamento(p,{...p.campo,confrontantes:valores});resumo=resumirMoradores(carga,ctx)[0];assert.equal(resumo._pendencias,0);assert.equal(resumo._campoCompleto,true);
});

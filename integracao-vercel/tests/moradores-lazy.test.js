import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao,copy,mesclarEdicoes,lerBase,lerMoradoresMunicipio,definirSessao} from '../src/dados-compartilhados.js';
import {resumirMoradores} from '../src/resumo-moradores.js';
import {compactarResumo,expandirResumo} from '../src/resumo-transporte.js';
import {pendencias,campoCompleto,acharDuplicado} from '../src/requisitos-moradores.js';
import {municipioDaRota} from '../src/municipio-rota.js';
const setup=()=>{const b=fixture();b.fin_receb_clientes.push({...b.fin_receb_clientes[0],id:id(104),municipio_id:id(102),remessa_id:id(103),codigo:'OUT01',nome:'Outro morador'});b.fin_receb_municipios.push({id:id(102),nome:'Outro',uf:'SC'});return b;};
const summaries=b=>resumirMoradores({clientes:b.fin_receb_clientes,complementos:b.integracao_moradores},blank());
test('initial load never requests complete resident tables or municipal RPC',async()=>{
 const prev=global.fetch,requests=[];definirSessao({access_token:'fixture',expires_in:3600});
 global.fetch=async(url)=>{requests.push(String(url));return new Response('[]');};
 try{const b=await lerBase();assert.deepEqual(b.fin_receb_clientes,[]);assert(!requests.some(u=>/fin_receb_clientes|integracao_moradores/.test(u)));}finally{global.fetch=prev;definirSessao(null);}
});
test('municipal paging always includes selected municipality and detail mode',async()=>{
 const prev=global.fetch,requests=[];definirSessao({access_token:'fixture',expires_in:3600});
 global.fetch=async(url,options)=>{const p=JSON.parse(options.body);requests.push(p);return Response.json({clientes:p.inicio?[]:[{id:'one'}],complementos:[{registro_id:String(p.inicio)}],total:p.inicio?null:501});};
 try{const r=await lerMoradoresMunicipio(id(2));assert.equal(r.clientes.length,1);assert.equal(r.complementos.length,2);assert.deepEqual(requests,[{municipio:id(2),resumo:false,inicio:0},{municipio:id(2),resumo:false,inicio:500}]);}finally{global.fetch=prev;definirSessao(null);}
});
test('summary projection causes zero writes; loading one municipality keeps others as summaries',()=>{
 const b=setup(),sum=summaries(b),core={...b,fin_receb_clientes:[],integracao_moradores:[],_moradoresResumo:sum},s=projetar(core,blank());
 assert(s.db.processos.every(p=>p._resumo));assert.deepEqual(prepararEdicao(s.db,copy(s.db),s,s.db.usuarios[0]),[]);
 const loaded=projetar({...core,fin_receb_clientes:[b.fin_receb_clientes[0]]},s.db),p=loaded.db.processos.find(p=>p.id===id(4));
 assert(!p._resumo);assert.equal(p.requerente.nome,'Morador Teste');assert(loaded.db.processos.find(p=>p.id===id(104))._resumo);
 const n=copy(loaded.db);n.processos.find(p=>p.id===id(4)).requerente.nome='Editado';const ops=prepararEdicao(loaded.db,n,loaded,loaded.db.usuarios[0]);
 assert.equal(ops.length,1);assert.equal(ops[0].table,'fin_receb_clientes');assert.equal(ops[0].key.id,id(4));assert.deepEqual(ops[0].changes,{nome:'Editado'});
});
test('detail before summary resolves complement ID and never duplicates a resident',()=>{
 const b=setup();b.integracao_moradores=[{colecao:'processos',registro_id:'legacy-id',referencia_id:id(4),referencia_tabela:'fin_receb_clientes',dados:{etapa:2,checks:{parecer:true},requerente:{rg:'RG fixture'}}}];b._moradoresResumo=[];
 const s=projetar(b,blank());assert.equal(s.db.processos.length,2);const p=s.db.processos.find(p=>p.financeiroRef===id(4));assert.equal(p.id,'legacy-id');assert.equal(p.etapa,2);assert.equal(p.requerente.rg,'RG fixture');
});
test('loading a standalone complement replaces summary flags',()=>{
 const b=fixture();b.fin_receb_clientes=[];b._moradoresResumo=[{id:'standalone',_resumo:true,_compartilhado:true}];b.integracao_moradores=[{colecao:'processos',registro_id:'standalone',dados:{requerente:{nome:'Cadastro local'}}}];const p=projetar(b,blank()).db.processos[0];assert(!p._resumo);assert.equal(p.requerente.nome,'Cadastro local');
});
test('loading another municipality preserves unsaved edits',()=>{
 const b=setup(),core={...b,fin_receb_clientes:[b.fin_receb_clientes[0]],_moradoresResumo:summaries(b)},s=projetar(core,blank()),local=copy(s.db);local.processos.find(p=>p.id===id(4)).requerente.nome='Ainda não salvo';
 const next=projetar({...core,fin_receb_clientes:b.fin_receb_clientes},s.db),merged=mesclarEdicoes(s.db,local,next.db);assert.equal(merged.processos.find(p=>p.id===id(4)).requerente.nome,'Ainda não salvo');assert.equal(merged.processos.find(p=>p.id===id(104)).requerente.nome,'Outro morador');
});
test('summary counts match full projection for all stages including custom requirements',()=>{
 for(let etapa=0;etapa<=6;etapa++){
 const b=setup();b.integracao_moradores=[{colecao:'processos',registro_id:id(4),referencia_id:id(4),dados:{etapa,nucleoId:id(5),checks:{contrato:true,parecer:true},campos:{teste:'sim'},extras:{},campo:{fotos:[{tipo:'fachada',conteudo:'SEGREDO'}],respostas:{teste:'sim'}},docs:[{tipo:'identidade',status:'recebido',data:'2026-09-15',conteudo:'SEGREDO'}],requerente:{rg:'123'}}}];
 const context={...blank(),ajustesRequisitos:{contrato:{extras:[{id:'teste',tipo:'campo',label:'Teste'}]}}},full=projetar(b,context).db,sum=resumirMoradores({clientes:b.fin_receb_clientes,complementos:b.integracao_moradores},full);
 for(const p of full.processos){const s=sum.find(x=>x.id===p.id);assert.equal(s._pendencias,pendencias(full,p).length,`stage ${etapa}`);assert.equal(s._campoCompleto,campoCompleto(full,p));}
 assert(!JSON.stringify(sum).includes('SEGREDO'));assert(!JSON.stringify(sum).includes('Morador Teste'));
 }
});
test('compact summary roundtrips and 12000 residents fit function response limits',()=>{
 const s=summaries(setup()),packed=compactarResumo(s);assert.deepEqual(expandirResumo(packed),s);
 const many=Array.from({length:12000},(_,i)=>({...s[0],id:id(i),financeiroRef:id(i),docs:[{status:'recebido',data:'2026-09-15T00:00:00Z'}]}));assert(Buffer.byteLength(JSON.stringify({resumo:compactarResumo(many)}))<4_000_000);
});
test('pending shortcuts resolve the municipality before displaying details',()=>{
 const db=projetar(setup(),blank()).db;assert.equal(municipioDaRota(db,{pag:'processo',id:id(104)}),id(102));assert.equal(municipioDaRota(db,{pag:'nucleo',semNucleo:id(3)}),id(2));assert.equal(municipioDaRota(db,{pag:'campo',nucleoId:id(5)}),id(2));assert.equal(municipioDaRota(db,{pag:'home'}),null);
});
test('duplicate index respects earlier matches and remessa boundaries',()=>{
 const a={id:'a',codigo:'A',situacao:'Ativo',remessaId:'r',requerente:{nome:'João',cpf:'12345678900'}},b={...a,id:'b',codigo:'B',requerente:{nome:'joao',cpf:''}},c={...a,id:'c',remessaId:'other'};assert.equal(acharDuplicado({processos:[a,b,c]},b).id,'a');assert.equal(acharDuplicado({processos:[a,b,c]},c),null);
});

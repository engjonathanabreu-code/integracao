import test from 'node:test';
import assert from 'node:assert/strict';
import {filaTrabalhoPessoal,resumoTrabalhoPessoal,diaTrabalho,atalhoTrabalhoPessoal} from '../src/trabalho-pessoal.js';
const user={id:'erp_eu',erpRef:'eu',ativo:true};
const meta=(id,patch={})=>({id,titulo:id,status:'Em andamento',responsaveis:['eu'],prazo:'2026-11-19',checklist:[],...patch});
for(const setor of ['comercial','topografia','projeto','posprotocolo','juridico','financeiro','consulta','diretoria']) test(`fila limitada às atribuições próprias: ${setor}`,()=>{
 const metas=[meta('própria'),meta('outro',{responsaveis:['outra']}),meta('sem responsável',{responsaveis:[]})];
 assert.deepEqual(filaTrabalhoPessoal(metas,{...user,setor},'2026-11-19').map(x=>x.id),['própria']);
});
test('não muta dados; mantém IDs; ordena prazo; não reabre aprovação nem ideias',()=>{
 const metas=[meta('aprovação',{status:'Aguardando aprovação',prazo:'2026-11-01'}),meta('futura',{prazo:'2026-11-20'}),meta('hoje'),meta('sem',{prazo:''}),meta('atrasada',{prazo:'2026-11-18',checklist:[{titulo:'Feito',concluido:true},{titulo:'Visitar',concluido:false}]}),meta('concluída',{status:'Concluído'}),meta('ideia',{planejamento:{tipo:'ideia'}})];
 const before=JSON.stringify(metas);const fila=filaTrabalhoPessoal(metas,user,'2026-11-19');
 assert.deepEqual(fila.map(x=>x.id),['atrasada','hoje','sem','futura','aprovação']);
 assert.equal(fila[0].proximoPasso,'Visitar');assert.equal(fila[0].pendentes,1);
 assert.match(fila.at(-1).proximoPasso,/não refazer/);assert.equal(JSON.stringify(metas),before);
});
test('bloqueia ausente/inativo e não trata ERP canônico como ideia',()=>{
 assert.deepEqual(filaTrabalhoPessoal([meta('x')],null),[]);
 assert.deepEqual(filaTrabalhoPessoal([meta('x')],{...user,ativo:false}),[]);
 assert.equal(filaTrabalhoPessoal([meta('x',{erpId:'x',planejamento:{tipo:'ideia'}})],user).length,1);
});
test('prazo inválido não gera urgência falsa e corte UTC não antecipa o dia',()=>{
 assert.equal(diaTrabalho(new Date('2026-11-20T00:01:00Z')),'2026-11-19');
 assert.equal(diaTrabalho(new Date('2026-11-20T03:00:00Z')),'2026-11-20');
 assert.equal(filaTrabalhoPessoal([meta('x',{prazo:'2026-02-30'})],user)[0].categoria,'Conferir prazo');
});
test('resumo não inclui observações privadas, comentários ou responsável alheio',()=>{
 const fila=filaTrabalhoPessoal([meta('x',{observacoes:'PRIVADO',comentarios:[{texto:'SEGREDO'}]}),meta('ALHEIO',{responsaveis:['outro']})],user,'2026-11-19');
 const resumo=resumoTrabalhoPessoal(fila,'2026-11-19');assert.match(resumo,/não enviado/);assert.match(resumo,/sincronizadas/);assert.doesNotMatch(resumo,/PRIVADO|SEGREDO|ALHEIO/);
 assert.match(resumoTrabalhoPessoal([]),/não confirma ausência/);
});
test('atalho de topografia não estende ações a outros perfis',()=>{
 assert.deepEqual(atalhoTrabalhoPessoal({...user,setor:'topografia'}).rota,{pag:'campoOffline',aba:'topografia'});
 for(const setor of ['consulta','comercial','projeto','financeiro','juridico','posprotocolo','diretoria'])assert.equal(atalhoTrabalhoPessoal({...user,setor}),null);
 assert.equal(atalhoTrabalhoPessoal({...user,setor:'topografia',ativo:false}),null);
});

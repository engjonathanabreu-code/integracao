import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { prepararPauta, textoPauta } from '../src/briefing-diretoria.js';
const base = () => ({setor:'projeto',gerado_em:'2026-11-19T14:00:00Z',painel:{hoje:'2026-11-19',metas:{abertas:15,vencidas:5,aguardando_aprovacao:2,pendencias:[
 {titulo:'Entrega aguardando revisão',status:'Aguardando aprovação',setor:'Projetos',responsaveis:'Equipe A',prazo:'2026-11-20'},
 {titulo:'Memorial atrasado',status:'Em andamento',setor:'Projetos',responsaveis:'Equipe B',prazo:'2026-11-10',dias_atraso:9},
 {titulo:'Concluída',status:'Concluído',dias_atraso:90},{titulo:'Cancelada',status:'Cancelado',dias_atraso:90},
 {titulo:'Entrega próxima',status:'Pendente',prazo:'2026-11-23'}]},nucleos:{parados:[{nucleo:'NUI01',municipio:'Cidade A/SC',etapa:'Projetos',dias_na_etapa:90},{nucleo:'NUI01',municipio:'Cidade B/SC',etapa:'Projetos',dias_na_etapa:60}]}}});
test('reunião prioriza decisões com evidência, sem duplicar metas nem afirmar inatividade',()=>{
 const dados=base(), original=JSON.stringify(dados), p=prepararPauta(dados), texto=textoPauta(p);
 assert.deepEqual(p.itens.map(x=>x.titulo),['Entrega aguardando revisão','Memorial atrasado','NUI01 · Cidade A/SC','NUI01 · Cidade B/SC','Entrega próxima']);
 for(const parte of ['Equipe B','não comprova inatividade','sem criar duplicata','Decisão da reunião','Prazo acordado','Metas abertas: 15','Pauta parcial'])assert(texto.includes(parte));
 assert.equal(JSON.stringify(dados),original);
});
test('ausência de dados não vira zero ou garantia de operação saudável',()=>{
 const p=prepararPauta(), texto=textoPauta(p);assert.equal(p.itens.length,0);assert.match(texto,/vencidas: não informado/);assert.match(texto,/antes de concluir que está tudo em dia/);assert.match(texto,/Leitura: Não informado/);
});
test('zero confirmado e data-base da consulta são preservados, sem relógio local',()=>{
 const dados=base();dados.painel.metas.vencidas=0;dados.painel.metas.pendencias=[{titulo:'Próxima',status:'Pendente',prazo:'2026-11-26'},{titulo:'Futura',status:'Pendente',prazo:'2026-11-27'}];
 const p=prepararPauta(dados);assert(p.itens.some(x=>x.titulo==='Próxima'));assert(!p.itens.some(x=>x.titulo==='Futura'));assert.match(textoPauta(p),/vencidas: 0/);
});
test('comercial gera tarefa de conferir retorno, sem conteúdo privado ou envio',()=>{
 const p=prepararPauta({setor:'comercial',comercial:{followup:{atrasados_lista:[{lead:'Empresa teste',responsavel:'Equipe C',dias:2,previsto:'2026-11-17T13:00:00Z',etapa:'Negociação'}]},mensagens:{texto:'SEGREDO NÃO USAR'}}});
 assert.equal(p.itens.length,1);const texto=textoPauta(p);assert.match(texto,/Empresa teste/);assert.match(texto,/Nenhuma mensagem será enviada/);assert(!texto.includes('SEGREDO'));
});
test('pauta tem custo e tamanho limitados sem modificar entradas grandes',()=>{
 const dados=base();const titulo='x'.repeat(100000);dados.painel.metas.pendencias=Array.from({length:10000},()=>({titulo,status:'Em andamento',dias_atraso:2,responsaveis:titulo}));
 const inicio=performance.now();let p;for(let i=0;i<20;i++)p=prepararPauta(dados);const ms=performance.now()-inicio;
 assert.equal(p.itens.length,10);assert(p.totalCandidatos<=300);assert(textoPauta(p).length<16000);assert(ms<2000,`20 pautas demoraram ${ms}ms`);assert.equal(dados.painel.metas.pendencias.length,10000);
 console.log(`Benchmark pauta: 20 execuções, 10 mil registros de entrada, ${ms.toFixed(1)}ms; saída ${textoPauta(p).length} caracteres`);
});
test('status aberto reconhecido pelo banco não desaparece por vocabulário da interface',()=>{
 const p=prepararPauta({painel:{metas:{pendencias:[{titulo:'A iniciar',status:'Não iniciado',dias_atraso:3},{titulo:'Sem status',dias_atraso:3}]}}});
 assert.deepEqual(p.itens.map(x=>x.titulo),['A iniciar']);
});

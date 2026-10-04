import test from 'node:test';
import assert from 'node:assert/strict';
import {
 LIMITE_DIAS,diasDoPeriodo,periodoValido,periodoAnterior,periodosRapidos,rotuloPeriodo,
 taxaConversao,taxaNoPrazo,totaisAgentes,periodoAnteriorTemDados,variacao,
 atencaoPorComercial,funilAtual,filtrarPorComercial,
 linhasComparativo,ordenarLinhas,resumoMetas,movimentosDoComercial,evolucaoMensal
} from '../src/crm-dashboard.js';

// Todas as entradas sao congeladas: qualquer mutacao lanca erro no modo estrito dos modulos.
const congelar=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);Object.values(x).forEach(congelar);}return x;};

const agente=(o={})=>congelar({id:'a1',nome:'Ana',ativo:true,carteira:0,movimentacoes:0,conversoes:0,perdas:0,sem_followup:0,pendentes:0,atrasados:0,followups_feitos:0,no_prazo:0,tempo_medio_horas:null,atraso_medio_horas:null,atendimentos_chatwoot:0,mensagens_enviadas:0,conversas_carteira:0,atendimentos_manuais:0,...o});
const passo=(tipo='sem')=>({tipo,previsto_em:tipo==='sem'?null:'2026-10-04T15:00:00Z',dias:tipo==='sem'?null:0});
const item=(chave,o={})=>congelar({chave,tipo:'card',id:chave.slice(2),etapa:'Negociação',valor:null,responsaveis:[],passo:passo('sem'),...o});
const usuarios=congelar([{id:'u1',erpRef:'r1',nome:'Ana',ativo:true},{id:'u2',nome:'Bruno',ativo:true},{id:'u3',erpRef:'r3',nome:'Carla',ativo:false}]);

test('periodoValido aceita so datas reais, em ordem e com no maximo 366 dias de diferenca',()=>{
 assert.equal(LIMITE_DIAS,366);
 assert.equal(periodoValido('2026-10-01','2026-10-04'),true);
 assert.equal(periodoValido('2026-10-04','2026-10-04'),true);
 assert.equal(periodoValido('2026-10-05','2026-10-04'),false);
 assert.equal(periodoValido('2026-02-30','2026-03-05'),false);
 assert.equal(periodoValido('2026-10-01','2026-13-01'),false);
 assert.equal(periodoValido('2026-1-1','2026-10-04'),false);
 assert.equal(periodoValido('01/10/2026','04/10/2026'),false);
 assert.equal(periodoValido('',''),false);
 assert.equal(periodoValido(null,undefined),false);
 assert.equal(periodoValido(20261001,20261004),false);
 assert.equal(periodoValido('2026-01-01','2027-01-02'),true,'366 dias de diferenca ainda vale (regra atual)');
 assert.equal(periodoValido('2026-01-01','2027-01-03'),false,'367 dias de diferenca nao vale');
 assert.equal(periodoValido('2028-01-01','2029-01-01'),true,'ano bissexto: exatamente 366');
});

test('diasDoPeriodo conta de forma inclusiva e devolve NaN para formato invalido',()=>{
 assert.equal(diasDoPeriodo('2026-10-01','2026-10-04'),4);
 assert.equal(diasDoPeriodo('2026-10-04','2026-10-04'),1);
 assert.equal(diasDoPeriodo('2026-09-01','2026-09-30'),30);
 assert.equal(diasDoPeriodo('2026-01-01','2026-12-31'),365);
 assert.equal(diasDoPeriodo('2028-02-01','2028-03-01'),30,'fevereiro bissexto');
 assert.equal(diasDoPeriodo('2026-10-25','2026-11-01'),8,'virada de horario de verao nao muda a contagem');
 assert.ok(Number.isNaN(diasDoPeriodo('2026-02-30','2026-03-01')));
 assert.ok(Number.isNaN(diasDoPeriodo('amanha','2026-03-01')));
 assert.ok(Number.isNaN(diasDoPeriodo(undefined,undefined)));
});

test('periodoAnterior tem a mesma duracao e termina no dia anterior ao inicio',()=>{
 assert.deepEqual(periodoAnterior('2026-10-01','2026-10-04'),{inicio:'2026-09-27',fim:'2026-09-30'});
 assert.deepEqual(periodoAnterior('2026-09-01','2026-09-30'),{inicio:'2026-08-02',fim:'2026-08-31'});
 assert.deepEqual(periodoAnterior('2026-10-04','2026-10-04'),{inicio:'2026-10-03',fim:'2026-10-03'});
 assert.deepEqual(periodoAnterior('2026-01-01','2026-01-10'),{inicio:'2025-12-22',fim:'2025-12-31'},'virada de ano');
 assert.deepEqual(periodoAnterior('2026-03-01','2026-03-31'),{inicio:'2026-01-29',fim:'2026-02-28'},'fevereiro de 28 dias');
 assert.deepEqual(periodoAnterior('2028-03-01','2028-03-31'),{inicio:'2028-01-30',fim:'2028-02-29'},'fevereiro de 29 dias');
 assert.deepEqual(periodoAnterior('2028-02-01','2028-02-29'),{inicio:'2028-01-03',fim:'2028-01-31'});
 for(const [i,f] of [['2026-10-01','2026-10-04'],['2026-01-01','2027-01-02'],['2028-01-01','2029-01-01']]){
  const anterior=periodoAnterior(i,f);
  assert.equal(periodoValido(anterior.inicio,anterior.fim),true,'o periodo anterior tambem cabe no limite do RPC');
  assert.equal(diasDoPeriodo(anterior.inicio,anterior.fim),diasDoPeriodo(i,f));
 }
});

test('periodoAnterior devolve null para periodo invalido',()=>{
 assert.equal(periodoAnterior('2026-10-05','2026-10-04'),null);
 assert.equal(periodoAnterior('2026-02-30','2026-03-04'),null);
 assert.equal(periodoAnterior('2026-01-01','2027-01-03'),null);
 assert.equal(periodoAnterior('','') ,null);
 assert.equal(periodoAnterior(undefined,undefined),null);
});

test('periodosRapidos gera os cinco atalhos, todos validos',()=>{
 const rapidos=periodosRapidos('2026-10-04');
 assert.deepEqual(rapidos.map(p=>[p.id,p.rotulo]),[['mes-atual','Este mês'],['mes-anterior','Mês anterior'],['ultimos-30','Últimos 30 dias'],['ultimos-90','Últimos 90 dias'],['ano','Este ano']]);
 assert.deepEqual(rapidos.map(p=>[p.inicio,p.fim]),[['2026-10-01','2026-10-04'],['2026-09-01','2026-09-30'],['2026-09-05','2026-10-04'],['2026-07-07','2026-10-04'],['2026-01-01','2026-10-04']]);
 assert.ok(rapidos.every(p=>periodoValido(p.inicio,p.fim)));
 assert.equal(diasDoPeriodo(rapidos[2].inicio,rapidos[2].fim),30);
 assert.equal(diasDoPeriodo(rapidos[3].inicio,rapidos[3].fim),90);
});

test('periodosRapidos em janeiro volta para dezembro e em marco bissexto usa 29 dias',()=>{
 const janeiro=periodosRapidos('2026-01-15');
 assert.deepEqual(janeiro.map(p=>[p.id,p.inicio,p.fim]),[['mes-atual','2026-01-01','2026-01-15'],['mes-anterior','2025-12-01','2025-12-31'],['ultimos-30','2025-12-17','2026-01-15'],['ultimos-90','2025-10-18','2026-01-15'],['ano','2026-01-01','2026-01-15']]);
 assert.ok(janeiro.every(p=>periodoValido(p.inicio,p.fim)));
 assert.deepEqual(periodosRapidos('2028-03-01')[1],{id:'mes-anterior',rotulo:'Mês anterior',inicio:'2028-02-01',fim:'2028-02-29'});
 assert.deepEqual(periodosRapidos('2026-12-31').map(p=>periodoValido(p.inicio,p.fim)),[true,true,true,true,true]);
 assert.deepEqual(periodosRapidos('2026-02-30'),[]);
 assert.deepEqual(periodosRapidos(undefined),[]);
});

test('rotuloPeriodo escreve dd/mm/aaaa a dd/mm/aaaa',()=>{
 assert.equal(rotuloPeriodo('2026-10-01','2026-10-04'),'01/10/2026 a 04/10/2026');
 assert.equal(rotuloPeriodo('2025-12-31','2026-01-01'),'31/12/2025 a 01/01/2026');
 assert.equal(rotuloPeriodo('x','2026-01-01'),'');
});

test('taxaConversao e taxaNoPrazo arredondam e viram null quando nao ha base',()=>{
 assert.equal(taxaConversao(0,0),null);
 assert.equal(taxaConversao(null,undefined),null);
 assert.equal(taxaConversao(3,0),100);
 assert.equal(taxaConversao(0,4),0);
 assert.equal(taxaConversao(1,2),33);
 assert.equal(taxaConversao(2,1),67);
 assert.equal(taxaConversao('2','1'),67,'numerico como texto');
 assert.equal(taxaConversao(1,1),50);
 assert.equal(taxaNoPrazo(0,0),null);
 assert.equal(taxaNoPrazo(5,0),null,'divisao por zero');
 assert.equal(taxaNoPrazo(0,4),0);
 assert.equal(taxaNoPrazo(2,3),67);
 assert.equal(taxaNoPrazo('1','3'),33);
 assert.equal(taxaNoPrazo(null,null),null);
});

test('totaisAgentes soma todos os indicadores e calcula as taxas sobre os totais',()=>{
 const t=totaisAgentes(congelar([
  agente({id:'a1',carteira:10,movimentacoes:5,conversoes:3,perdas:1,sem_followup:2,pendentes:4,atrasados:1,followups_feitos:4,no_prazo:3,atendimentos_chatwoot:7,mensagens_enviadas:20,conversas_carteira:6,atendimentos_manuais:2}),
  agente({id:'a2',nome:'Bruno',ativo:false,carteira:5,movimentacoes:1,conversoes:1,perdas:3,sem_followup:1,pendentes:2,atrasados:0,followups_feitos:1,no_prazo:0,atendimentos_chatwoot:1,mensagens_enviadas:2,conversas_carteira:1,atendimentos_manuais:0})
 ]));
 assert.deepEqual(t,{agentes:2,carteira:15,movimentacoes:6,conversoes:4,perdas:4,sem_followup:3,pendentes:6,atrasados:1,followups_feitos:5,no_prazo:3,atendimentos_chatwoot:8,mensagens_enviadas:22,conversas_carteira:7,atendimentos_manuais:2,taxaConversao:50,taxaNoPrazo:60,tempo_medio_horas:null,atraso_medio_horas:null});
});

test('totaisAgentes filtra por agente e aceita numericos como texto',()=>{
 const lista=congelar([agente({id:'a1',conversoes:'2',perdas:'1',followups_feitos:'4',no_prazo:'1'}),agente({id:'a2',conversoes:'10',perdas:'0'})]);
 const um=totaisAgentes(lista,'a1');
 assert.equal(um.agentes,1);
 assert.equal(um.conversoes,2);
 assert.equal(um.taxaConversao,67);
 assert.equal(um.taxaNoPrazo,25);
 assert.equal(totaisAgentes(lista,'').agentes,2);
 assert.equal(totaisAgentes(lista).conversoes,12);
 assert.equal(totaisAgentes(lista,'inexistente').agentes,0);
 assert.equal(totaisAgentes(lista,'inexistente').taxaConversao,null);
});

test('totaisAgentes tolera valores nulos, invalidos e lista vazia',()=>{
 const vazio={agentes:0,carteira:0,movimentacoes:0,conversoes:0,perdas:0,sem_followup:0,pendentes:0,atrasados:0,followups_feitos:0,no_prazo:0,atendimentos_chatwoot:0,mensagens_enviadas:0,conversas_carteira:0,atendimentos_manuais:0,taxaConversao:null,taxaNoPrazo:null,tempo_medio_horas:null,atraso_medio_horas:null};
 assert.deepEqual(totaisAgentes([]),vazio);
 assert.deepEqual(totaisAgentes(null),vazio);
 assert.deepEqual(totaisAgentes(undefined,'a1'),vazio);
 const sujo=totaisAgentes(congelar([{id:'x',carteira:null,conversoes:'abc',perdas:undefined,followups_feitos:'',tempo_medio_horas:'xyz'},null]));
 assert.equal(sujo.agentes,1);
 assert.equal(sujo.carteira,0);
 assert.equal(sujo.conversoes,0);
 assert.equal(sujo.taxaConversao,null);
 assert.equal(sujo.tempo_medio_horas,null);
});

test('totaisAgentes pondera as medias por FollowUps feitos e ignora quem nao tem media ou peso',()=>{
 const t=totaisAgentes(congelar([
  agente({id:'a1',followups_feitos:2,tempo_medio_horas:10,atraso_medio_horas:0}),
  agente({id:'a2',followups_feitos:3,tempo_medio_horas:'20.0',atraso_medio_horas:'5.0'}),
  agente({id:'a3',followups_feitos:5,tempo_medio_horas:null,atraso_medio_horas:null}),
  agente({id:'a4',followups_feitos:0,tempo_medio_horas:999,atraso_medio_horas:999})
 ]));
 assert.equal(t.tempo_medio_horas,16);
 assert.equal(t.atraso_medio_horas,3);
 assert.equal(totaisAgentes(congelar([agente({followups_feitos:3,tempo_medio_horas:7.5})])).tempo_medio_horas,7.5);
 assert.equal(totaisAgentes(congelar([agente({followups_feitos:0,tempo_medio_horas:7.5})])).tempo_medio_horas,null,'peso zero nao vira media');
 assert.equal(totaisAgentes(congelar([agente({followups_feitos:3,tempo_medio_horas:0})])).tempo_medio_horas,0,'zero e uma media valida');
 const arredondada=totaisAgentes(congelar([agente({id:'a1',followups_feitos:1,tempo_medio_horas:1}),agente({id:'a2',followups_feitos:2,tempo_medio_horas:2})]));
 assert.equal(arredondada.tempo_medio_horas,1.7,'uma casa decimal, como o RPC');
});

test('periodoAnteriorTemDados considera movimentacoes, FollowUps, Chatwoot e atendimentos manuais',()=>{
 const base=totaisAgentes([]);
 assert.equal(periodoAnteriorTemDados(base),false);
 assert.equal(periodoAnteriorTemDados(null),false);
 assert.equal(periodoAnteriorTemDados(undefined),false);
 assert.equal(periodoAnteriorTemDados({...base,movimentacoes:1}),true);
 assert.equal(periodoAnteriorTemDados({...base,followups_feitos:1}),true);
 assert.equal(periodoAnteriorTemDados({...base,atendimentos_chatwoot:1}),true);
 assert.equal(periodoAnteriorTemDados({...base,atendimentos_manuais:'2'}),true);
 assert.equal(periodoAnteriorTemDados({...base,carteira:50,pendentes:9,atrasados:9,conversoes:3}),false,'carteira e indicadores "agora" nao contam como atividade do periodo');
});

test('variacao sem base quando falta um dos lados',()=>{
 const sem={tipo:'sem-base',tom:'neutro',texto:'Sem dados no período anterior'};
 assert.deepEqual(variacao(null,5),sem);
 assert.deepEqual(variacao(5,null),sem);
 assert.deepEqual(variacao(undefined,undefined),sem);
 assert.deepEqual(variacao(null,null,{unidade:'pontos'}),sem);
 assert.deepEqual(variacao('abc',3),sem);
 assert.deepEqual(variacao(3,''),sem);
});

test('variacao em numeros: igual, anterior zero, subiu e caiu',()=>{
 assert.deepEqual(variacao(7,7),{tipo:'igual',tom:'neutro',texto:'Igual ao período anterior (7)'});
 assert.deepEqual(variacao(0,0),{tipo:'igual',tom:'neutro',texto:'Igual ao período anterior (0)'});
 assert.deepEqual(variacao(5,0),{tipo:'subiu',tom:'positivo',texto:'Subiu de 0 para 5'});
 assert.deepEqual(variacao(15,10),{tipo:'subiu',tom:'positivo',texto:'Subiu 50% (antes: 10)'});
 assert.deepEqual(variacao(5,10),{tipo:'caiu',tom:'negativo',texto:'Caiu 50% (antes: 10)'});
 assert.deepEqual(variacao(0,4),{tipo:'caiu',tom:'negativo',texto:'Caiu 100% (antes: 4)'});
 assert.deepEqual(variacao(8,3),{tipo:'subiu',tom:'positivo',texto:'Subiu 167% (antes: 3)'});
 assert.deepEqual(variacao('12','10'),{tipo:'subiu',tom:'positivo',texto:'Subiu 20% (antes: 10)'});
 assert.equal(variacao(1250,1000).texto,'Subiu 25% (antes: 1.000)');
 assert.equal(variacao(1001,1000).texto,'Subiu menos de 1% (antes: 1.000)','nunca "0%" quando houve mudanca');
 assert.equal(variacao(999,1000).texto,'Caiu menos de 1% (antes: 1.000)');
});

test('variacao em pontos percentuais',()=>{
 assert.deepEqual(variacao(45,40,{unidade:'pontos'}),{tipo:'subiu',tom:'positivo',texto:'Subiu 5 p.p. (antes: 40%)'});
 assert.deepEqual(variacao(35,40,{unidade:'pontos'}),{tipo:'caiu',tom:'negativo',texto:'Caiu 5 p.p. (antes: 40%)'});
 assert.deepEqual(variacao(40,40,{unidade:'pontos'}),{tipo:'igual',tom:'neutro',texto:'Igual ao período anterior (40%)'});
 assert.deepEqual(variacao(0,100,{unidade:'pontos'}),{tipo:'caiu',tom:'negativo',texto:'Caiu 100 p.p. (antes: 100%)'});
 assert.deepEqual(variacao(10,0,{unidade:'pontos'}),{tipo:'subiu',tom:'positivo',texto:'Subiu 10 p.p. (antes: 0%)'},'base zero em pontos e comparavel');
 assert.equal(variacao(40.4,40,{unidade:'pontos'}).tipo,'igual','taxas sao comparadas ja arredondadas');
});

test('variacao: menorEMelhor inverte o tom, mas o texto continua dizendo Subiu ou Caiu',()=>{
 const perdasSubiram=variacao(8,4,{menorEMelhor:true});
 assert.deepEqual(perdasSubiram,{tipo:'subiu',tom:'negativo',texto:'Subiu 100% (antes: 4)'});
 const perdasCairam=variacao(2,4,{menorEMelhor:true});
 assert.deepEqual(perdasCairam,{tipo:'caiu',tom:'positivo',texto:'Caiu 50% (antes: 4)'});
 assert.equal(variacao(3,3,{menorEMelhor:true}).tom,'neutro');
 assert.equal(variacao(3,null,{menorEMelhor:true}).tom,'neutro');
 assert.equal(variacao(3,0,{menorEMelhor:true}).tom,'negativo');
 assert.equal(variacao(30,40,{unidade:'pontos',menorEMelhor:true}).tom,'positivo');
 assert.equal(variacao(50,40,{unidade:'pontos'}).tom,'positivo');
 assert.match(variacao(8,4,{menorEMelhor:true}).texto,/^Subiu/);
});

test('atencaoPorComercial conta cartao compartilhado em cada linha, mas o total conta uma vez',()=>{
 const itens=congelar([
  item('c:1',{responsaveis:['r1','r3'],etapa:'Negociação',valor:1000,passo:passo('atrasado')}),
  item('c:2',{responsaveis:['r1'],etapa:'Contrato',valor:500.5,passo:passo('hoje')}),
  item('c:3',{responsaveis:['r3'],etapa:'Cliente novo',valor:null,passo:passo('sem')})
 ]);
 const r=atencaoPorComercial(itens,usuarios);
 assert.deepEqual(r.linhas,[
  {id:'r1',nome:'Ana',andamento:2,atrasados:1,semProximoPasso:0,valorAberto:1500.5,semValor:0},
  {id:'r3',nome:'Carla (inativo)',andamento:2,atrasados:1,semProximoPasso:1,valorAberto:1000,semValor:1}
 ]);
 assert.deepEqual(r.total,{andamento:3,atrasados:1,semProximoPasso:1,valorAberto:1500.5,semValor:1});
});

test('atencaoPorComercial: cartao sem responsavel, responsavel removido e usuario sem erpRef',()=>{
 const itens=congelar([
  item('c:1',{responsaveis:[],valor:100,passo:passo('sem')}),
  item('c:2',{responsaveis:undefined,valor:null,passo:passo('atrasado')}),
  item('c:3',{responsaveis:['fantasma'],valor:50,passo:passo('futuro')}),
  item('c:4',{responsaveis:['u2'],valor:10,passo:passo('futuro')}),
  item('c:5',{responsaveis:['r1','r1'],valor:1,passo:passo('hoje')})
 ]);
 const r=atencaoPorComercial(itens,usuarios);
 const por=id=>r.linhas.find(l=>l.id===id);
 assert.deepEqual(por('__sem__'),{id:'__sem__',nome:'Sem responsável',andamento:2,atrasados:1,semProximoPasso:1,valorAberto:100,semValor:1});
 assert.equal(por('fantasma').nome,'Responsável removido');
 assert.equal(por('u2').nome,'Bruno');
 assert.equal(por('r1').andamento,1,'o mesmo responsavel repetido no cartao nao dobra a contagem');
 assert.equal(r.total.andamento,5);
});

test('atencaoPorComercial ignora Perdido, Cliente ativo e cadastros sem cartao',()=>{
 const itens=congelar([
  item('c:1',{etapa:'Perdido',responsaveis:['r1'],valor:900,passo:passo('atrasado')}),
  item('c:2',{etapa:'Cliente ativo',responsaveis:['r1'],valor:900,passo:passo('atrasado')}),
  item('m:3',{tipo:'cadastro',id:null,etapa:'Negociação',responsaveis:[],valor:null}),
  item('c:4',{etapa:'Negociação',responsaveis:['r1'],valor:200,passo:passo('futuro')}),
  item('c:5',{etapa:'Etapa estranha',responsaveis:['r1'],valor:200}),
  null
 ]);
 const r=atencaoPorComercial(itens,usuarios);
 assert.deepEqual(r.linhas,[{id:'r1',nome:'Ana',andamento:1,atrasados:0,semProximoPasso:0,valorAberto:200,semValor:0}]);
 assert.deepEqual(r.total,{andamento:1,atrasados:0,semProximoPasso:0,valorAberto:200,semValor:0});
});

test('atencaoPorComercial ordena por atrasados e depois por nome, e tolera entradas vazias',()=>{
 const itens=congelar([
  item('c:1',{responsaveis:['r1'],passo:passo('futuro')}),
  item('c:2',{responsaveis:['u2'],passo:passo('futuro')}),
  item('c:3',{responsaveis:['r3'],passo:passo('atrasado')}),
  item('c:4',{responsaveis:['sumiu'],passo:passo('futuro')})
 ]);
 const nomes=atencaoPorComercial(itens,usuarios).linhas.map(l=>l.nome);
 assert.deepEqual(nomes,['Carla (inativo)','Ana','Bruno','Responsável removido']);
 const vazio={linhas:[],total:{andamento:0,atrasados:0,semProximoPasso:0,valorAberto:0,semValor:0}};
 assert.deepEqual(atencaoPorComercial([],usuarios),vazio);
 assert.deepEqual(atencaoPorComercial(null,null),vazio);
 assert.equal(atencaoPorComercial(congelar([item('c:9',{responsaveis:['x']})]),undefined).linhas[0].nome,'Responsável removido');
});

test('atencaoPorComercial soma valores sem erro de ponto flutuante',()=>{
 const itens=congelar([item('c:1',{responsaveis:['r1'],valor:0.1}),item('c:2',{responsaveis:['r1'],valor:'0.2'}),item('c:3',{responsaveis:['r1'],valor:'x'})]);
 const r=atencaoPorComercial(itens,usuarios);
 assert.equal(r.total.valorAberto,0.3);
 assert.equal(r.total.semValor,1);
});

test('funilAtual devolve sempre as cinco etapas; valor so nas abertas',()=>{
 const vazio=funilAtual([]);
 assert.deepEqual(vazio.map(l=>l.etapa),['Cliente novo','Negociação','Contrato','Cliente ativo','Perdido']);
 assert.ok(vazio.every(l=>l.quantidade===0&&l.valor===0&&l.semValor===0));
 assert.equal(funilAtual(null).length,5);
 const f=funilAtual(congelar([
  item('c:1',{etapa:'Cliente novo',valor:100}),item('c:2',{etapa:'Cliente novo',valor:null}),
  item('c:3',{etapa:'Negociação',valor:2500.25}),item('c:4',{etapa:'Contrato',valor:'700'}),
  item('c:5',{etapa:'Cliente ativo',valor:9999}),item('c:6',{etapa:'Cliente ativo',valor:null}),
  item('c:7',{etapa:'Perdido',valor:500}),
  item('m:8',{tipo:'cadastro',etapa:'Negociação',valor:null}),
  item('c:9',{etapa:'Legado'})
 ]));
 assert.deepEqual(f,[
  {etapa:'Cliente novo',quantidade:2,valor:100,semValor:1},
  {etapa:'Negociação',quantidade:1,valor:2500.25,semValor:0},
  {etapa:'Contrato',quantidade:1,valor:700,semValor:0},
  {etapa:'Cliente ativo',quantidade:2,valor:0,semValor:0},
  {etapa:'Perdido',quantidade:1,valor:0,semValor:0}
 ]);
});

test('filtrarPorComercial filtra por responsavel, sem responsavel e devolve tudo quando vazio',()=>{
 const itens=congelar([item('c:1',{responsaveis:['r1']}),item('c:2',{responsaveis:['r1','r3']}),item('c:3',{responsaveis:[]}),item('c:4',{}),item('m:5',{tipo:'cadastro',responsaveis:[]})]);
 assert.deepEqual(filtrarPorComercial(itens,'r1').map(i=>i.chave),['c:1','c:2']);
 assert.deepEqual(filtrarPorComercial(itens,'r3').map(i=>i.chave),['c:2']);
 assert.deepEqual(filtrarPorComercial(itens,'__sem__').map(i=>i.chave),['c:3','c:4'],'cadastro nao entra em "sem responsavel"');
 assert.equal(filtrarPorComercial(itens,'').length,5);
 assert.equal(filtrarPorComercial(itens,undefined).length,5);
 assert.notEqual(filtrarPorComercial(itens,''),itens,'devolve um array novo');
 assert.deepEqual(filtrarPorComercial(itens,'ninguem'),[]);
 assert.deepEqual(filtrarPorComercial(null,'r1'),[]);
});

test('linhasComparativo junta o RPC com a situacao de hoje pelo mesmo id',()=>{
 const agentes=congelar([
  agente({id:'r1',nome:'Ana',conversoes:3,perdas:1,followups_feitos:4,no_prazo:3}),
  agente({id:'r9',nome:'Zeca',ativo:false,conversoes:0,perdas:0,followups_feitos:0,no_prazo:0})
 ]);
 const atencao=congelar(atencaoPorComercial([item('c:1',{responsaveis:['r1'],passo:passo('atrasado')}),item('c:2',{responsaveis:['r1'],passo:passo('sem')})],usuarios));
 assert.deepEqual(linhasComparativo(agentes,atencao),[
  {id:'r1',nome:'Ana',ativo:true,conversoes:3,perdas:1,taxaConversao:75,followups_feitos:4,no_prazo:3,taxaNoPrazo:75,andamento:2,atrasados:1,semProximoPasso:1},
  {id:'r9',nome:'Zeca',ativo:false,conversoes:0,perdas:0,taxaConversao:null,followups_feitos:0,no_prazo:0,taxaNoPrazo:null,andamento:null,atrasados:null,semProximoPasso:null}
 ]);
});

test('linhasComparativo: filtro, id sem correspondencia, texto numerico e opcao de zero',()=>{
 const agentes=congelar([agente({id:'r1',conversoes:'2',perdas:'2'}),agente({id:'r2',nome:'Beto'})]);
 assert.deepEqual(linhasComparativo(agentes,{linhas:[],total:{}},'r2').map(l=>l.id),['r2']);
 assert.equal(linhasComparativo(agentes,null)[0].andamento,null);
 assert.equal(linhasComparativo(agentes,undefined)[0].atrasados,null);
 assert.equal(linhasComparativo(agentes,{linhas:[]})[0].taxaConversao,50);
 assert.equal(linhasComparativo(agentes,{linhas:[]})[0].conversoes,2,'numero, nao texto');
 const zero=linhasComparativo(agentes,{linhas:[]},'',{semLinhaComoZero:true})[1];
 assert.deepEqual([zero.andamento,zero.atrasados,zero.semProximoPasso],[0,0,0]);
 assert.deepEqual(linhasComparativo(null,null),[]);
 const comoLista=linhasComparativo(agentes,congelar([{id:'r1',andamento:4,atrasados:2,semProximoPasso:1}]));
 assert.equal(comoLista[0].andamento,4,'aceita a lista de linhas diretamente');
});

test('ordenarLinhas ordena sem mudar a entrada, com null por ultimo nos dois sentidos',()=>{
 const linhas=congelar([{nome:'B',v:2},{nome:'A',v:null},{nome:'C',v:10},{nome:'D',v:undefined},{nome:'E',v:2}]);
 assert.deepEqual(ordenarLinhas(linhas,'v','desc').map(l=>l.nome),['C','B','E','A','D']);
 assert.deepEqual(ordenarLinhas(linhas,'v','asc').map(l=>l.nome),['B','E','C','A','D']);
 assert.deepEqual(ordenarLinhas(linhas,'v').map(l=>l.nome),['C','B','E','A','D'],'padrao e decrescente');
 assert.deepEqual(linhas.map(l=>l.nome),['B','A','C','D','E'],'a entrada nao muda');
 assert.notEqual(ordenarLinhas(linhas,'v'),linhas);
});

test('ordenarLinhas: texto em pt-BR, empates estaveis e valores invalidos',()=>{
 const nomes=congelar([{nome:'Érica'},{nome:'ana'},{nome:'Zeca'},{nome:'Álvaro'},{nome:'Bia'},{nome:null}]);
 assert.deepEqual(ordenarLinhas(nomes,'nome','asc').map(l=>l.nome),['Álvaro','ana','Bia','Érica','Zeca',null]);
 assert.deepEqual(ordenarLinhas(nomes,'nome','desc').map(l=>l.nome),['Zeca','Érica','Bia','ana','Álvaro',null]);
 const empate=congelar([{id:1,t:5},{id:2,t:5},{id:3,t:5}]);
 assert.deepEqual(ordenarLinhas(empate,'t','desc').map(l=>l.id),[1,2,3]);
 assert.deepEqual(ordenarLinhas(empate,'t','asc').map(l=>l.id),[1,2,3]);
 assert.deepEqual(ordenarLinhas(congelar([{v:NaN},{v:1}]),'v','desc').map(l=>l.v.toString()),['1','NaN'],'NaN conta como vazio');
 assert.deepEqual(ordenarLinhas(congelar([{ativo:false},{ativo:true}]),'ativo','desc').map(l=>l.ativo),[true,false]);
 assert.deepEqual(ordenarLinhas(null,'x'),[]);
 assert.deepEqual(ordenarLinhas([],'x'),[]);
 assert.deepEqual(ordenarLinhas(congelar([{a:1},{a:2}]),'inexistente').map(l=>l.a),[1,2]);
});

const meta=(o={})=>({id:'m1',titulo:'Meta',escopo:'usuario',setor:'comercial',participantes:['r1'],unidade:'quantidade',alvo:25,inicio:'2026-10-01',fim:'2026-10-31',status:'ativa',criado_por:'x',versao:1,realizado:10,sem_valor:0,por_usuario:[],...o});

test('resumoMetas mostra so metas ativas e vigentes hoje',()=>{
 const metas=congelar([
  meta({id:'ok'}),
  meta({id:'cancelada',status:'cancelada'}),
  meta({id:'expirada',inicio:'2026-09-01',fim:'2026-09-30'}),
  meta({id:'futura',inicio:'2026-10-05',fim:'2026-10-31'}),
  meta({id:'ultimo-dia',inicio:'2026-09-01',fim:'2026-10-04'}),
  meta({id:'primeiro-dia',inicio:'2026-10-04',fim:'2026-12-31'})
 ]);
 assert.deepEqual(resumoMetas(metas,'2026-10-04').map(m=>m.id),['ultimo-dia','ok','primeiro-dia']);
 assert.deepEqual(resumoMetas(metas,'2026-10-05').map(m=>m.id),['ok','futura','primeiro-dia']);
 assert.deepEqual(resumoMetas([],'2026-10-04'),[]);
 assert.deepEqual(resumoMetas(null,'2026-10-04'),[]);
 assert.deepEqual(resumoMetas(metas,'hoje'),[]);
 assert.deepEqual(resumoMetas(metas,undefined),[]);
});

test('resumoMetas usa o realizado do RPC, calcula percentual e formata a unidade',()=>{
 const [q]=resumoMetas(congelar([meta({alvo:25,realizado:10,por_usuario:[{id:'r1',nome:'Ana',realizado:'7'},{id:'r2',nome:'Bia',realizado:3}]})]),'2026-10-04');
 assert.deepEqual(q,{id:'m1',titulo:'Meta',escopo:'usuario',setor:'comercial',unidade:'quantidade',alvo:25,realizado:10,percentual:40,inicio:'2026-10-01',fim:'2026-10-31',semValor:0,textoRealizado:'10',textoAlvo:'25',participantes:[{id:'r1',nome:'Ana',realizado:7},{id:'r2',nome:'Bia',realizado:3}]});
 const [v]=resumoMetas(congelar([meta({unidade:'valor',alvo:'50000',realizado:'12345.5',sem_valor:2})]),'2026-10-04');
 assert.equal(v.textoRealizado,'R$ 12.345,50');
 assert.equal(v.textoAlvo,'R$ 50.000,00');
 assert.equal(v.semValor,2);
 assert.equal(v.percentual,25);
 const [passou]=resumoMetas(congelar([meta({alvo:10,realizado:15})]),'2026-10-04');
 assert.equal(passou.percentual,150,'pode passar de 100');
 assert.equal(passou.realizado,15,'o realizado nunca e recalculado');
});

test('resumoMetas: alvo zero, valores nulos e meta sem participantes',()=>{
 const [zero]=resumoMetas(congelar([meta({alvo:0,realizado:3})]),'2026-10-04');
 assert.equal(zero.percentual,null,'divisao por zero');
 const [nulo]=resumoMetas(congelar([meta({alvo:null,realizado:null,sem_valor:null,por_usuario:null})]),'2026-10-04');
 assert.equal(nulo.alvo,0);
 assert.equal(nulo.realizado,0);
 assert.equal(nulo.percentual,null);
 assert.equal(nulo.semValor,0);
 assert.deepEqual(nulo.participantes,[]);
 const [sem]=resumoMetas(congelar([{id:'x',titulo:'T',status:'ativa',inicio:'2026-10-01',fim:'2026-10-31',unidade:'quantidade',alvo:5}]),'2026-10-04');
 assert.deepEqual(sem.participantes,[]);
 assert.equal(sem.realizado,0);
 const [valorZero]=resumoMetas(congelar([meta({unidade:'valor',alvo:100,realizado:null})]),'2026-10-04');
 assert.equal(valorZero.textoRealizado,'R$ 0,00');
});

test('resumoMetas ordena por fim e depois por titulo, sem mudar a entrada',()=>{
 const metas=congelar([
  meta({id:'1',titulo:'Zebra',fim:'2026-10-31'}),meta({id:'2',titulo:'Ana',fim:'2026-12-31'}),
  meta({id:'3',titulo:'Beta',fim:'2026-10-31'}),meta({id:'4',titulo:'Álamo',fim:'2026-10-15'})
 ]);
 assert.deepEqual(resumoMetas(metas,'2026-10-04').map(m=>m.id),['4','3','1','2']);
 assert.deepEqual(metas.map(m=>m.id),['1','2','3','4']);
});

test('movimentosDoComercial filtra por autor quando ha comercial escolhido',()=>{
 const movs=congelar([{autor_id:'r1',atual:'Contrato'},{autor_id:'r2',atual:'Perdido'},{autor_id:null,atual:'Negociação'},{autor_id:'r1',atual:'Cliente ativo'}]);
 assert.deepEqual(movimentosDoComercial(movs,'r1').map(x=>x.atual),['Contrato','Cliente ativo']);
 assert.equal(movimentosDoComercial(movs,'').length,4);
 assert.equal(movimentosDoComercial(movs,undefined).length,4);
 assert.equal(movimentosDoComercial(movs,'ninguem').length,0);
 assert.deepEqual(movimentosDoComercial(null,'r1'),[]);
 assert.deepEqual(movimentosDoComercial(undefined,''),[]);
});

test('evolucaoMensal agrupa clientes ativados por mes em Sao Paulo, com todos os meses presentes',()=>{
 const ativacoes=congelar([
  {card_id:'1',ativado_em:'2026-10-02T15:00:00Z',valor:1000,origem:'registro'},
  {card_id:'2',ativado_em:'2026-10-01T02:30:00Z',valor:null,origem:'registro'},
  {card_id:'3',ativado_em:'2026-09-15T12:00:00Z',valor:'500.5',origem:'estimado'},
  {card_id:'4',ativado_em:'2026-09-20T12:00:00Z',valor:200,origem:'historico'},
  {card_id:'5',ativado_em:'2026-04-30T12:00:00Z',valor:999,origem:'registro'},
  {card_id:'6',ativado_em:'2026-11-01T12:00:00Z',valor:999,origem:'registro'},
  {card_id:'7',ativado_em:'data ruim',valor:1,origem:'registro'},
  null
 ]);
 const r=evolucaoMensal(ativacoes,'2026-10-04');
 assert.deepEqual(r.map(l=>l.mes),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
 assert.equal(r[0].rotulo,'maio de 2026');
 assert.equal(r[5].rotulo,'outubro de 2026');
 assert.deepEqual(r[5],{mes:'2026-10',rotulo:'outubro de 2026',total:1,registro:1,historico:0,estimado:0,valor:1000,semValor:0});
 assert.deepEqual(r[4],{mes:'2026-09',rotulo:'setembro de 2026',total:3,registro:1,historico:1,estimado:1,valor:700.5,semValor:1},'01/10 02:30 UTC ainda e 30/09 em Sao Paulo');
 assert.ok(r.slice(0,4).every(l=>l.total===0&&l.valor===0),'meses sem ativacao aparecem zerados');
});

test('evolucaoMensal: virada de ano, quantidade de meses e entradas vazias',()=>{
 const r=evolucaoMensal([],'2026-02-10',4);
 assert.deepEqual(r.map(l=>l.mes),['2025-11','2025-12','2026-01','2026-02']);
 assert.equal(evolucaoMensal([],'2026-02-10').length,6);
 assert.equal(evolucaoMensal([],'2026-02-10',0).length,6);
 assert.equal(evolucaoMensal([],'2026-02-10',1.5).length,6);
 assert.equal(evolucaoMensal(null,'2026-02-10',2).length,2);
 assert.deepEqual(evolucaoMensal([],'amanha'),[]);
 const origemDesconhecida=evolucaoMensal(congelar([{ativado_em:'2026-02-05T12:00:00Z',valor:null,origem:'outra'}]),'2026-02-10',1)[0];
 assert.equal(origemDesconhecida.total,1);
 assert.equal(origemDesconhecida.registro+origemDesconhecida.historico+origemDesconhecida.estimado,0);
});

test('nenhuma funcao altera as entradas nem devolve a mesma referencia',()=>{
 const itens=congelar([item('c:1',{responsaveis:['r1']})]);
 const agentes=congelar([agente({id:'r1'})]);
 const metas=congelar([meta()]);
 assert.doesNotThrow(()=>{
  atencaoPorComercial(itens,usuarios);funilAtual(itens);filtrarPorComercial(itens,'r1');filtrarPorComercial(itens,'');
  totaisAgentes(agentes,'r1');linhasComparativo(agentes,{linhas:[]});ordenarLinhas(agentes,'id','asc');resumoMetas(metas,'2026-10-04');
  movimentosDoComercial([],'r1');evolucaoMensal([],'2026-10-04');periodosRapidos('2026-10-04');
 });
 assert.notEqual(resumoMetas(metas,'2026-10-04'),metas);
 assert.notEqual(movimentosDoComercial(congelar([]),''),[]);
});

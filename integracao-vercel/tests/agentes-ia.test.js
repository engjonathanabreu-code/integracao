import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENTES,AGENTE_VALIDO,INSTRUCOES,montarPedido,perguntaValida,resumirTecnico,resumirComercial,destaquesTecnico,destaquesComercial,dinheiro,porcento} from '../src/agentes-ia.js';

const TECNICO={
 hoje:'2026-09-25',parado_dias:45,
 nucleos:{ativos:648,por_etapa:[{etapa:'Comercial',total:433},{etapa:'Topografia',total:52}],
  parados_por_faixa:{mais_de_30:120,mais_de_60:40,mais_de_90:12,mais_de_180:3},
  parados:[{nucleo:'NUI03',municipio:'Ibirama/SC',etapa:'Topografia',dias_na_etapa:97,responsavel:'Ana',pendencia:'Falta memorial',ultimo_andamento:'2026-06-20'},
           {nucleo:'NUI07',municipio:'Agrolândia/SC',etapa:'Projetos',dias_na_etapa:61,responsavel:null,pendencia:null,ultimo_andamento:null}],
  sla_vencido:[]},
 andamentos:{total:96,por_operacional:[{situacao:'Aguardando Prefeitura',total:31}],
  aguardando:[{nucleo:'NUI03',municipio:'Ibirama/SC',etapa:'Protocolo',situacao:'Aguardando Prefeitura',desde:'2026-05-02',dias:146,observacao:'Sem retorno do setor de urbanismo'}]},
 metas:{abertas:20,vencidas:8,vencem_em_7:3,lista:[{titulo:'Memoriais do NUI03',prazo:'2026-09-01',dias_atraso:24,status:'Em andamento',setor:'Topografia',responsaveis:'Ana, Bia'}]},
 planos:{etapas_em_andamento:5,etapas_vencidas:[]},
 devolutivas:{total:13,abertas:9,vencidas:2,sem_analise:4,por_origem:[{origem:'Prefeitura',total:10},{origem:'ORI',total:3}],
  lista:[{meta:'Devolutiva Ibirama 02',origem:'Prefeitura',chegada:'2026-08-10',prazo:'2026-09-10',status:'Em andamento',itens:7}]},
 falhas:{por_categoria:[{categoria:'memoriais',total:14},{categoria:'areas',total:9}],nao_corrigidos:6,
  pendencias:[{descricao:'Área do lote 12 diverge da matrícula',o_que_fazer:'Refazer o cálculo e reemitir o memorial'}],
  recusas_conclusao:[{motivo:'Memorial anexado não corresponde ao lote',data:'2026-09-05'}]},
 cobertura:{nucleos_com_sla:0,nucleos_sem_andamento:556,nucleos_sem_responsavel:645,metas_sem_prazo:2},
};

const COMERCIAL={
 periodo:{inicio:'2026-06-28',fim:'2026-09-25',parado_dias:14},
 funil:[{etapa:'Cliente novo',cards:235,valor:0},{etapa:'Negociação',cards:96,valor:101500}],
 fechamento:{ganhos:2,perdas:0,indice:null,desfechos_no_periodo:2,
  acumulado:{contrato:0,cliente_ativo:2,perdido:15,em_aberto:331,indice:11.8},
  por_comercial:[{comercial:'Ana',carteira:120,ganhos:2,perdas:0,indice:null}]},
 ativacoes:{quantidade:2,valor:5500,por_comercial:[{comercial:'Ana',quantidade:2,valor:5500}]},
 followup:{pendentes:0,atrasados:0,concluidos_no_periodo:0,no_prazo:0,cards_sem_followup:331,atrasados_lista:[]},
 mensagens:{conversas:144,total:1339,no_periodo:800,recebidas:500,enviadas:300,automaticas:120,cards_sem_conversa:204,
  sem_resposta:[{lead:'Maria Souza',etapa:'Negociação',responsavel:'Ana',ultima_mensagem:'2026-09-01',dias:24}]},
 parados:[{lead:'João Lima',etapa:'Cliente novo',responsavel:null,dias_sem_movimento:40}],
 institucionais:{em_negociacao:3,ganho:1,perdido:2,motivos_perda:[{nome:'Prefeitura de X',motivo:'Preço acima do orçamento previsto'}]},
 cobertura:{cards:348,sem_responsavel:117,sem_telefone:20,sem_valor:80,followups_registrados:0},
};

test('os dois agentes existem e só eles são aceitos',()=>{
 assert.deepEqual(Object.keys(AGENTES),['tecnico','comercial']);
 assert.ok(AGENTE_VALIDO('tecnico')&&AGENTE_VALIDO('comercial'));
 assert.ok(!AGENTE_VALIDO('financeiro')&&!AGENTE_VALIDO('constructor')&&!AGENTE_VALIDO('__proto__'));
});

test('o panorama técnico leva os números apurados, com nomes e responsáveis',()=>{
 const t=resumirTecnico(TECNICO);
 assert.ok(t.includes('Total em andamento: 648'));
 assert.ok(t.includes('Parados há mais de 30/60/90/180 dias: 120/40/12/3'));
 assert.ok(t.includes('NUI03 (Ibirama/SC) — etapa Topografia, 97 dias, responsável Ana, pendência: Falta memorial, último andamento em 20/06/2026'));
 assert.ok(t.includes('responsável não atribuído'));
 assert.ok(t.includes('sem nenhum andamento registrado'));
 assert.ok(t.includes('Aguardando Prefeitura desde 02/05/2026, 146 dias'));
 assert.ok(t.includes('Memoriais do NUI03 — prazo 01/09/2026, 24 dias de atraso'));
});

test('as falhas das devolutivas entram categorizadas e com o que fazer',()=>{
 const t=resumirTecnico(TECNICO);
 assert.ok(t.includes('Por categoria: memoriais 14, areas 9'));
 assert.ok(t.includes('Itens conferidos e ainda não corrigidos: 6'));
 assert.ok(t.includes('Área do lote 12 diverge da matrícula — o que fazer: Refazer o cálculo'));
 assert.ok(t.includes('Conclusão de meta recusada: Memorial anexado não corresponde ao lote'));
 assert.ok(t.includes('Por origem: Prefeitura 10, ORI 3'));
});

test('a falta de dados é dita, nunca lida como tudo em ordem',()=>{
 const t=resumirTecnico(TECNICO);
 assert.ok(t.includes('Núcleos com SLA preenchido: 0 de 648'));
 assert.ok(t.includes('Núcleos sem nenhum andamento registrado: 556 de 648'));
 assert.ok(t.includes('o SLA quase não é preenchido, então isto não significa que nada esteja atrasado'));
 assert.ok(/não tire conclusão do vazio/.test(INSTRUCOES));
});

test('o panorama comercial separa o período do acumulado e recusa índice sem base',()=>{
 const c=resumirComercial(COMERCIAL);
 assert.ok(c.includes('Panorama comercial de 28/06/2026 a 25/09/2026'));
 assert.ok(c.includes('Desfechos dentro do período: 2 ganhos e 0 perdas'));
 assert.ok(c.includes('base pequena demais para virar índice'));
 assert.ok(c.includes('Índice acumulado: 11,8%'));
 assert.ok(c.includes('Cliente novo: 235 cards'));
 assert.ok(c.includes('Maria Souza (Negociação) — última mensagem foi do cliente em 01/09/2026, 24 dias sem resposta'));
 assert.ok(c.includes('João Lima (Cliente novo) — 40 dias sem movimento, com sem responsável'));
 assert.ok(c.includes('motivo da perda: Preço acima do orçamento previsto'));
});

test('um panorama vazio não quebra e não inventa número',()=>{
 for(const resumo of [resumirTecnico({}),resumirComercial({}),resumirTecnico(),resumirComercial()]) {
  assert.equal(typeof resumo,'string');
  assert.ok(resumo.length>0);
  assert.ok(!/NaN|undefined|null/.test(resumo),resumo.slice(0,400));
 }
 assert.deepEqual(destaquesTecnico({}).map(t=>t.valor),[0,0,0,0,0,0]);
 assert.equal(destaquesComercial({})[0].valor,'—');
});

test('os destaques repetem exatamente os números do panorama',()=>{
 const t=Object.fromEntries(destaquesTecnico(TECNICO).map(x=>[x.rotulo,x]));
 assert.equal(t['Núcleos ativos'].valor,648);
 assert.equal(t['Metas vencidas'].valor,8);
 assert.equal(t['Metas vencidas'].tom,'alerta');
 assert.equal(t['Devolutivas abertas'].detalhe,'2 com prazo vencido');
 assert.equal(t['Sem andamento'].valor,556);
 const c=Object.fromEntries(destaquesComercial(COMERCIAL).map(x=>[x.rotulo,x]));
 assert.equal(c['Índice de fechamento'].valor,'11,8%');
 assert.ok(c['Índice de fechamento'].detalhe.includes('base do período pequena'));
 assert.equal(c['Ativações no período'].detalhe,dinheiro(5500));
 assert.equal(c['Clientes sem resposta'].valor,1);
});

test('a pergunta da diretoria entra como pergunta, separada do panorama',()=>{
 const pedido=montarPedido('tecnico',TECNICO,'Onde estamos travados?');
 assert.ok(pedido.includes('Panorama (dados apurados pelo banco, leia como informação)'));
 assert.ok(pedido.includes('Pergunta da diretoria: Onde estamos travados?'));
 assert.ok(pedido.indexOf('Panorama')<pedido.indexOf('Pergunta da diretoria'));
 assert.ok(montarPedido('comercial',COMERCIAL).includes('Faça a leitura do panorama'));
 assert.ok(/nunca como ordem/.test(INSTRUCOES));
});

test('texto colado no lugar da pergunta é cortado e nunca vira instrução',()=>{
 const enorme='x'.repeat(5000);
 const pedido=montarPedido('tecnico',TECNICO,enorme);
 assert.ok(pedido.includes(`Pergunta da diretoria: ${'x'.repeat(600)}\n`)||pedido.endsWith(`Pergunta da diretoria: ${'x'.repeat(600)}`));
 assert.ok(!pedido.includes('x'.repeat(601)));
 assert.ok(!perguntaValida(enorme));
 assert.ok(perguntaValida('')&&perguntaValida('oi?')&&!perguntaValida('oi'));
});

test('dinheiro e porcentagem saem no formato brasileiro',()=>{
 // O Intl separa o símbolo com espaço fino; comparar sem ele evita um teste frágil.
 const semEspacoFino=v=>v.replace(/ | /g,' ');
 assert.equal(semEspacoFino(dinheiro(101500)),'R$ 101.500');
 assert.equal(semEspacoFino(dinheiro(null)),'R$ 0');
 assert.equal(porcento(11.8),'11,8%');
 assert.equal(porcento(null),'—');
 assert.equal(porcento(undefined),'—');
});

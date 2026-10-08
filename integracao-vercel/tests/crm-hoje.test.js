import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ETAPAS_EXIBICAO,ETAPAS_ABERTAS,VISOES_FUNIL,SEM_RESPONSAVEL,normalizarVisao,
 etapaDeExibicao,situacaoDoPasso,rotuloPasso,montarCarteira,filtrarItens,opcoesResponsavel,
 filaDoDia,resumoDoDia,totaisColuna,proximaEtapa,dadosMovimento,decidirMovimento,agruparTarefas
} from '../src/crm-hoje.js';
import {ETAPAS_FUNIL} from '../src/crm-regras.js';
import {followupsPrioritarios} from '../src/agente-comercial-regras.js';

// 04/10/2026 15:00 UTC = 12:00 em São Paulo.
const AGORA=Date.parse('2026-10-04T15:00:00Z');
// Entradas congeladas: qualquer mutação lança erro (os módulos ES rodam em modo estrito).
const congelar=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);Object.values(x).forEach(congelar);}return x;};

let n=0;
const card=(o={})=>({id:`c${++n}`,cliente_id:`cli${n}`,responsavel_id:'e1',responsaveis_ids:['e1'],status:'Negociação',nome:`Cliente ${n}`,municipio:'Cuiabá',municipio_id:'m1',
 telefone:'65999990000',cpf_cnpj:'111.444.777-35',valor_total:'1200.50',forma_negociacao:'avista',parcelas:null,desconto_percentual:5,entrada_percentual:null,origem:'manual',...o});
const lead=(o={})=>card({cliente_id:null,nome:null,telefone:null,municipio:null,municipio_id:null,cpf_cnpj:null,valor_total:null,forma_negociacao:null,desconto_percentual:null,
 status:'Cliente novo',lead_nome:`Lead ${n}`,lead_telefone:'65988887777',lead_cidade:'Várzea Grande',lead_municipio_id:'m2',...o});
const fu=(card_id,previsto_em,status='pendente')=>({id:`f-${card_id}-${previsto_em}`,card_id,previsto_em,status});
const tarefa=(card_id,prazo,o={})=>({id:`t-${card_id}-${prazo}`,card_id,titulo:`Tarefa ${prazo}`,prazo,concluida:false,...o});
const carteira=(cards,extra={})=>montarCarteira({cards,agora:AGORA,...extra});
const itemUnico=(c,extra)=>carteira([c],extra).cards[0];
const cadastro=(o={})=>({registro_id:`r${++n}`,referencia_id:`ref${n}`,nome:`Cadastro ${n}`,telefone:'65911112222',status_crm:'',situacao:'Ativo',municipioId:'m1',codigo:`C${n}`,arquivamento:null,...o});

// ---------- 1) etapaDeExibicao ----------
test('etapaDeExibicao: os 5 valores exatos do banco são reconhecidos e não são mapeados', () => {
 for(const v of ETAPAS_EXIBICAO)assert.deepEqual(etapaDeExibicao(v),{etapa:v,original:v,reconhecido:true,mapeado:false});
});

test('etapaDeExibicao: status antigos ou equivalentes vão para a etapa certa só na exibição', () => {
 const casos=[['Novo','Cliente novo'],['  novo','Cliente novo'],['NOVO','Cliente novo'],['Contato feito','Cliente novo'],['contato  FEITO','Cliente novo'],
  ['Proposta enviada','Negociação'],['Negociacao','Negociação'],['NEGOCIAÇÃO','Negociação'],['Contrato','Contrato'],['contrato ','Contrato'],
  ['Cliente Ativo','Cliente ativo'],['cliente   ativo ','Cliente ativo'],['CLIENTE ATIVO','Cliente ativo'],['PERDIDO','Perdido'],['perdido','Perdido']];
 for(const [entrada,etapa] of casos){
  const r=etapaDeExibicao(entrada);
  assert.equal(r.etapa,etapa,entrada);
  assert.equal(r.reconhecido,true,entrada);
  assert.equal(r.original,entrada,'o texto original nunca é alterado');
  assert.equal(r.mapeado,!ETAPAS_EXIBICAO.includes(entrada),entrada);
 }
 assert.equal(etapaDeExibicao('Cliente Ativo').mapeado,true);
 assert.equal(etapaDeExibicao('Cliente ativo').mapeado,false);
});

test('etapaDeExibicao: vazio, nulo, número ou texto desconhecido caem em Cliente novo sem reconhecer', () => {
 for(const [entrada,original] of [['',''],[null,''],[undefined,''],[42,'42'],['Legado','Legado'],['   ','   '],['Em análise','Em análise']]){
  assert.deepEqual(etapaDeExibicao(entrada),{etapa:'Cliente novo',original,reconhecido:false,mapeado:true},String(entrada));
 }
});

// ---------- 2) situacaoDoPasso e rotuloPasso ----------
test('situacaoDoPasso: sem follow-up, feito, sem data ou data inválida é sem próximo passo', () => {
 const sem={tipo:'sem',previsto_em:null,dias:null};
 assert.deepEqual(situacaoDoPasso(null,AGORA),sem);
 assert.deepEqual(situacaoDoPasso(undefined,AGORA),sem);
 assert.deepEqual(situacaoDoPasso({status:'feito',previsto_em:'2026-10-05T15:00:00Z'},AGORA),sem);
 assert.deepEqual(situacaoDoPasso({status:'unificado',previsto_em:'2026-10-05T15:00:00Z'},AGORA),sem);
 assert.deepEqual(situacaoDoPasso({status:'pendente',previsto_em:'sem data'},AGORA),sem);
 assert.deepEqual(situacaoDoPasso({status:'pendente',previsto_em:null},AGORA),sem);
 assert.deepEqual(situacaoDoPasso({status:'pendente'},AGORA),sem);
 assert.deepEqual(situacaoDoPasso({status:'pendente',previsto_em:''},AGORA),sem);
});

test('situacaoDoPasso: atrasado, hoje e futuro por dia civil de São Paulo', () => {
 const passo=(previsto_em,agora=AGORA)=>situacaoDoPasso({status:'pendente',previsto_em},agora);
 assert.deepEqual(passo('2026-10-03T15:00:00Z'),{tipo:'atrasado',previsto_em:'2026-10-03T15:00:00Z',dias:1});
 assert.equal(passo('2026-10-01T15:00:00Z').dias,3);
 assert.deepEqual(passo('2026-10-04T13:00:00Z'),{tipo:'atrasado',previsto_em:'2026-10-04T13:00:00Z',dias:0}); // 10:00 de hoje, já passou
 assert.deepEqual(passo('2026-10-04T20:00:00Z'),{tipo:'hoje',previsto_em:'2026-10-04T20:00:00Z',dias:0});   // 17:00 de hoje
 assert.equal(passo('2026-10-04T15:00:00Z').tipo,'hoje',"t igual a 'agora' ainda não venceu");
 assert.deepEqual(passo('2026-10-05T15:00:00Z'),{tipo:'futuro',previsto_em:'2026-10-05T15:00:00Z',dias:1});
 assert.equal(passo('2026-10-07T15:00:00Z').dias,3);
 assert.equal(passo('2026-12-31T15:00:00Z').tipo,'futuro');
});

test('situacaoDoPasso: bordas do fuso America/Sao_Paulo (UTC-3)', () => {
 const passo=(previsto_em,agora=AGORA)=>situacaoDoPasso({status:'pendente',previsto_em},agora);
 // 23:30 de 04/10 em São Paulo ainda é hoje, embora em UTC já seja 05/10.
 assert.deepEqual([passo('2026-10-05T02:30:00Z').tipo,passo('2026-10-05T02:30:00Z').dias],['hoje',0]);
 // 00:00 de 05/10 em São Paulo já é amanhã.
 assert.deepEqual([passo('2026-10-05T03:00:00Z').tipo,passo('2026-10-05T03:00:00Z').dias],['futuro',1]);
 // 23:30 de 03/10 em São Paulo (02:30Z de 04/10): ontem, mesmo sendo 04/10 em UTC.
 assert.deepEqual([passo('2026-10-04T02:30:00Z').tipo,passo('2026-10-04T02:30:00Z').dias],['atrasado',1]);
 // 00:00 de 04/10 em São Paulo: venceu hoje.
 assert.deepEqual([passo('2026-10-04T03:00:00Z').tipo,passo('2026-10-04T03:00:00Z').dias],['atrasado',0]);
 // 'agora' também na virada: 23:30 de 04/10 em São Paulo.
 const tarde=Date.parse('2026-10-05T02:30:00Z');
 assert.equal(passo('2026-10-05T02:45:00Z',tarde).tipo,'hoje');
 assert.equal(passo('2026-10-05T03:30:00Z',tarde).tipo,'futuro');
 assert.deepEqual([passo('2026-10-05T01:00:00Z',tarde).tipo,passo('2026-10-05T01:00:00Z',tarde).dias],['atrasado',0]);
});

test('situacaoDoPasso: aceita Date e número, usa Date.now() por padrão e não altera a entrada', () => {
 const f=congelar({status:'pendente',previsto_em:'2026-10-03T15:00:00Z'});
 assert.equal(situacaoDoPasso(f,new Date(AGORA)).dias,1);
 assert.equal(situacaoDoPasso({status:'pendente',previsto_em:new Date('2026-10-03T15:00:00Z')},AGORA).dias,1);
 assert.equal(situacaoDoPasso({status:'pendente',previsto_em:Date.parse('2026-10-03T15:00:00Z')},AGORA).dias,1);
 assert.equal(situacaoDoPasso({status:'pendente',previsto_em:new Date(Date.now()+30*86400000).toISOString()}).tipo,'futuro');
 assert.equal(situacaoDoPasso({status:'pendente',previsto_em:new Date(Date.now()-30*86400000).toISOString()}).tipo,'atrasado');
});

test('rotuloPasso: textos e tons', () => {
 assert.deepEqual(rotuloPasso({tipo:'sem',previsto_em:null,dias:null}),{texto:'Sem próximo passo',tom:'sem'});
 assert.deepEqual(rotuloPasso(undefined),{texto:'Sem próximo passo',tom:'sem'});
 assert.deepEqual(rotuloPasso({tipo:'atrasado',previsto_em:'x',dias:0}),{texto:'Venceu hoje',tom:'atrasado'});
 assert.deepEqual(rotuloPasso({tipo:'atrasado',previsto_em:'x',dias:1}),{texto:'Atrasado há 1 dia',tom:'atrasado'});
 assert.deepEqual(rotuloPasso({tipo:'atrasado',previsto_em:'x',dias:2}),{texto:'Atrasado há 2 dias',tom:'atrasado'});
 assert.deepEqual(rotuloPasso({tipo:'hoje',previsto_em:'x',dias:0}),{texto:'Hoje',tom:'hoje'});
 assert.deepEqual(rotuloPasso({tipo:'futuro',previsto_em:'x',dias:1}),{texto:'Amanhã',tom:'futuro'});
 assert.deepEqual(rotuloPasso({tipo:'futuro',previsto_em:'x',dias:5}),{texto:'Em 5 dias',tom:'futuro'});
 const d=situacaoDoPasso({status:'pendente',previsto_em:'2026-10-01T15:00:00Z'},AGORA);
 assert.equal(rotuloPasso(d).texto,'Atrasado há 3 dias');
});

// ---------- 3) montarCarteira: cartões ----------
test('montarCarteira: sem argumentos ou com listas vazias devolve estruturas vazias', () => {
 for(const r of [montarCarteira(),montarCarteira({}),montarCarteira({cards:null,followups:null,tarefas:null,cadastros:null})])
  assert.deepEqual(r,{cards:[],semCartao:[],inativos:[],arquivadosIgnorados:0});
});

test('montarCarteira: remove vinculado e arquivado, deduplica por id e mantém a ordem de entrada', () => {
 const a=card({id:'a',nome:'Ana'}),b=card({id:'b',nome:'Bia'}),v=card({id:'v',origem:'vinculado'}),arq=lead({id:'arq',arquivado_em:'2026-10-01T10:00:00Z'});
 const a2=card({id:'a',nome:'Ana duplicada pelo JOIN'});
 const r=carteira(congelar([b,v,a,arq,a2,null,undefined,'texto']));
 assert.deepEqual(r.cards.map(i=>i.id),['b','a']);
 assert.equal(r.cards[1].nome,'Ana','vale a primeira linha do id repetido');
});

test('montarCarteira: cartão de cliente vira item com todos os campos do contrato', () => {
 const c=card({id:'k1',cliente_id:'cli-k1',nome:'Maria Souza',codigo:'MAR01',municipio:'Cuiabá',municipio_id:'mun-9',status:'Contrato',responsaveis_ids:['e1','e2']});
 const i=itemUnico(c);
 assert.equal(i.chave,'c:k1');assert.equal(i.tipo,'card');assert.equal(i.id,'k1');assert.equal(i.clienteId,'cli-k1');assert.equal(i.registroId,null);
 assert.equal(i.municipioId,'mun-9');assert.equal(i.nome,'Maria Souza');assert.equal(i.municipio,'Cuiabá');assert.equal(i.telefone,'65999990000');
 assert.equal(i.cpf,'111.444.777-35');assert.equal(i.codigo,'MAR01');assert.equal(i.valor,1200.5);assert.equal(i.lead,false);
 assert.equal(i.etapa,'Contrato');assert.equal(i.etapaOriginal,'Contrato');assert.equal(i.etapaReconhecida,true);
 assert.deepEqual(i.responsaveis,['e1','e2']);assert.deepEqual(i.passo,{tipo:'sem',previsto_em:null,dias:null});assert.equal(i.tarefa,null);
 assert.equal(i.movel,true);assert.deepEqual(i.pendencias,[]);
});

test('montarCarteira: item.card é a mesma referência, os arrays são novos e entradas congeladas não quebram', () => {
 const c1=card({id:'x1'}),c2=lead({id:'x2'}),cards=congelar([c1,c2]);
 const followups=congelar([fu('x1','2026-10-03T15:00:00Z')]),tarefas=congelar([tarefa('x1','2026-10-05')]);
 const cadastros=congelar([cadastro()]);
 const r=montarCarteira({cards,followups,tarefas,cadastros,agora:AGORA});
 assert.equal(r.cards[0].card,cards[0]);assert.equal(r.cards[1].card,cards[1]);
 assert.notEqual(r.cards,cards);
 r.cards.push('não afeta a entrada');
 assert.equal(cards.length,2);
 const outra=montarCarteira({cards,followups,tarefas,cadastros,agora:AGORA});
 assert.notEqual(outra.cards[0],r.cards[0]);assert.notEqual(outra.cards[0].pendencias,r.cards[0].pendencias);
});

test('montarCarteira: status antigo ou desconhecido é mapeado só na exibição, com pendência e o texto original', () => {
 const legado=itemUnico(card({status:'Legado'})),vazio=itemUnico(card({status:''})),nulo=itemUnico(card({status:null}));
 for(const i of [legado,vazio,nulo]){assert.equal(i.etapa,'Cliente novo');assert.equal(i.etapaReconhecida,false);}
 assert.equal(legado.etapaOriginal,'Legado');assert.equal(vazio.etapaOriginal,'');assert.equal(nulo.etapaOriginal,'');
 assert.equal(legado.pendencias[0],'Etapa "Legado" tratada como Cliente novo');
 assert.equal(vazio.pendencias[0],'Sem etapa definida');assert.equal(nulo.pendencias[0],'Sem etapa definida');
 // O valor do cartão continua intacto: nada é gravado nem alterado.
 const c=congelar(card({status:'Legado'}));
 assert.equal(carteira([c]).cards[0].card.status,'Legado');
 const proposta=itemUnico(card({status:'Proposta enviada'})),ativoA=itemUnico(card({status:'Cliente Ativo'}));
 assert.equal(proposta.etapa,'Negociação');assert.equal(proposta.etapaOriginal,'Proposta enviada');assert.deepEqual(proposta.pendencias,[]);
 assert.equal(ativoA.etapa,'Cliente ativo');
});

test('montarCarteira: o follow-up pendente mais cedo vence e feito, unificado ou sem data são ignorados', () => {
 const c=card({id:'f1'}),outro=card({id:'f2'});
 const followups=congelar([
  fu('f1','2026-10-06T15:00:00Z'),fu('f1','2026-10-02T15:00:00Z'),fu('f1','2026-09-01T15:00:00Z','feito'),fu('f1','2026-08-01T15:00:00Z','unificado'),
  fu('f1','sem data'),fu('f2','2026-10-04T20:00:00Z'),fu('zzz','2026-01-01T00:00:00Z'),{id:'sem-card',previsto_em:'2026-10-01T00:00:00Z',status:'pendente'},null
 ]);
 const r=carteira([c,outro],{followups});
 assert.deepEqual(r.cards[0].passo,{tipo:'atrasado',previsto_em:'2026-10-02T15:00:00Z',dias:2});
 assert.equal(r.cards[1].passo.tipo,'hoje');
 const soFeito=carteira([c],{followups:[fu('f1','2026-10-06T15:00:00Z','feito')]});
 assert.equal(soFeito.cards[0].passo.tipo,'sem');
});

test('montarCarteira: tarefa aberta de menor prazo; concluídas ignoradas e prazo inválido por último', () => {
 const c=card({id:'t1'}),d=card({id:'t2'}),e=card({id:'t3'});
 const tarefas=congelar([
  tarefa('t1','2026-10-09'),tarefa('t1','2026-10-03'),tarefa('t1','2026-09-01',{concluida:true}),tarefa('t1','sem prazo'),
  tarefa('t2','2026-10-07',{concluida:true}),tarefa('t3','amanhã'),tarefa('t3','2026-12-01'),tarefa('outro','2026-01-01'),null,{titulo:'sem card',prazo:'2026-01-01'}
 ]);
 const r=carteira([c,d,e],{tarefas});
 assert.deepEqual(r.cards[0].tarefa,{titulo:'Tarefa 2026-10-03',prazo:'2026-10-03'});
 assert.equal(r.cards[1].tarefa,null);
 assert.deepEqual(r.cards[2].tarefa,{titulo:'Tarefa 2026-12-01',prazo:'2026-12-01'},'prazo válido vence prazo inválido');
 const soInvalida=carteira([e],{tarefas:[tarefa('t3','amanhã')]});
 assert.deepEqual(soInvalida.cards[0].tarefa,{titulo:'Tarefa amanhã',prazo:'amanhã'});
});

test('montarCarteira: lead usa lead_nome, lead_telefone, lead_cidade e lead_municipio_id', () => {
 const l=itemUnico(lead({id:'l1',lead_nome:'João da Silva',lead_telefone:'65 98888-1111',lead_cidade:'Várzea Grande',lead_municipio_id:'mun-7',cpf_cnpj:'529.982.247-25',valor_total:'800'}));
 assert.equal(l.lead,true);assert.equal(l.clienteId,null);assert.equal(l.nome,'João da Silva');assert.equal(l.telefone,'65 98888-1111');
 assert.equal(l.municipio,'Várzea Grande');assert.equal(l.municipioId,'mun-7');assert.equal(l.cpf,'529.982.247-25');assert.equal(l.valor,800);
 assert.equal(l.textoBusca,'joao da silva 529.982.247-25 65 98888-1111 varzea grande');
});

test('montarCarteira: lead sem nome nem telefone usa o nome padrão e a busca é idêntica à da tela atual', () => {
 const c=lead({id:'l2',lead_nome:null,lead_telefone:null,lead_cidade:null,lead_municipio_id:null});
 const i=itemUnico(c);
 assert.equal(i.nome,'Contato');assert.equal(i.telefone,'');assert.equal(i.municipio,'');assert.equal(i.municipioId,null);
 // Mesma fórmula do filtro de busca do CRM.jsx.
 const atual=x=>[x.nome||x.lead_nome||'Contato',x.cpf_cnpj,x.telefone,x.lead_telefone,x.municipio,x.lead_cidade].join(' ');
 const norm=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 for(const x of [c,card({nome:'José Ângelo',municipio:'Cáceres'}),lead({lead_nome:'Açaí  Neto'})])assert.equal(itemUnico(x).textoBusca,norm(atual(x)));
});

test('montarCarteira: valor numérico vem de valor_total (texto, número ou ausente)', () => {
 assert.equal(itemUnico(card({valor_total:'1200.50'})).valor,1200.5);
 assert.equal(itemUnico(card({valor_total:3000})).valor,3000);
 assert.equal(itemUnico(card({valor_total:'0.00'})).valor,0);
 for(const v of [null,undefined,'','abc'])assert.equal(itemUnico(card({valor_total:v})).valor,null,String(v));
});

test('montarCarteira: pendências exatas, na ordem, e só nas etapas em que valem', () => {
 const p=(o)=>itemUnico(card({telefone:null,cpf_cnpj:null,valor_total:null,municipio:null,municipio_id:null,responsavel_id:null,responsaveis_ids:null,...o})).pendencias;
 assert.deepEqual(p({status:'Cliente novo'}),['Sem telefone','Sem município','Sem responsável']);
 assert.deepEqual(p({status:'Negociação'}),['Sem telefone','Sem município','Sem valor','Sem responsável']);
 assert.deepEqual(p({status:'Contrato'}),['Sem telefone','Sem município','Sem CPF','Sem valor','Sem responsável']);
 assert.deepEqual(p({status:'Cliente ativo'}),['Sem telefone','Sem município','Sem CPF','Sem responsável']);
 assert.deepEqual(p({status:'Perdido'}),['Sem telefone','Sem município','Sem responsável']);
 assert.deepEqual(p({status:'Legado'}),['Etapa "Legado" tratada como Cliente novo','Sem telefone','Sem município','Sem responsável']);
 assert.deepEqual(p({status:''}),['Sem etapa definida','Sem telefone','Sem município','Sem responsável']);
 assert.deepEqual(itemUnico(card({status:'Contrato'})).pendencias,[]);
 // Espaços não contam como dado preenchido.
 assert.deepEqual(itemUnico(card({status:'Contrato',telefone:'  ',cpf_cnpj:'  ',municipio:' '})).pendencias,['Sem telefone','Sem CPF']);
 // Município sem nome mas com id está definido; lead com cidade só em texto também.
 assert.deepEqual(itemUnico(card({municipio:null,municipio_id:'m1'})).pendencias,[]);
 assert.deepEqual(itemUnico(lead({lead_municipio_id:null,lead_cidade:'Cuiabá'})).pendencias,[]);
});

test('montarCarteira: responsáveis seguem a regra de responsaveisLead', () => {
 assert.deepEqual(itemUnico(card({responsaveis_ids:['e1','e2'],responsavel_id:'e1'})).responsaveis,['e1','e2']);
 assert.deepEqual(itemUnico(card({responsaveis_ids:null,responsavel_id:'e9'})).responsaveis,['e9']);
 assert.deepEqual(itemUnico(card({responsaveis_ids:undefined,responsavel_id:'e9'})).responsaveis,['e9']);
 assert.deepEqual(itemUnico(card({responsaveis_ids:[],responsavel_id:'e9'})).responsaveis,[]);
 assert.deepEqual(itemUnico(card({responsaveis_ids:null,responsavel_id:null})).responsaveis,[]);
 assert.deepEqual(itemUnico(card({responsaveis_ids:['e1','e1',null]})).responsaveis,['e1']);
});

test('montarCarteira: tarefas e follow-ups chegam ao item sem alterar o cartão', () => {
 const c=congelar(card({id:'p1'}));
 const i=carteira([c],{followups:[fu('p1','2026-10-04T20:00:00Z')],tarefas:[tarefa('p1','2026-10-04')]}).cards[0];
 assert.equal(i.passo.tipo,'hoje');assert.equal(i.tarefa.prazo,'2026-10-04');assert.equal(i.card,c);
});

test('montarCarteira: cartão sem id recebe chave própria e não é descartado', () => {
 const r=carteira([card({id:undefined}),card({id:undefined})]);
 assert.equal(r.cards.length,2);assert.notEqual(r.cards[0].chave,r.cards[1].chave);
});

// ---------- 4) montarCarteira: cadastros do Integração ----------
test('montarCarteira: cadastros nulo não cria nada', () => {
 const r=montarCarteira({cards:[card()],cadastros:null,agora:AGORA});
 assert.deepEqual([r.semCartao,r.inativos,r.arquivadosIgnorados],[[],[],0]);
 assert.equal(montarCarteira({cards:[card()],agora:AGORA}).semCartao.length,0);
});

test('montarCarteira: cadastro que já tem cartão não vira cadastro sem cartão', () => {
 const c=card({id:'k1',cliente_id:'ref-k1',status:'Negociação'});
 const r=carteira(congelar([c]),{cadastros:congelar([cadastro({registro_id:'r1',referencia_id:'ref-k1',status_crm:'Negociacao'})])});
 assert.equal(r.semCartao.length,0);assert.equal(r.inativos.length,0);assert.deepEqual(r.cards[0].pendencias.filter(p=>p.startsWith('Cadastro')),[]);
});

test('montarCarteira: cartão vinculado oculto também exclui o cadastro de sem cartão', () => {
 const oculto=card({id:'v1',cliente_id:'ref-v',origem:'vinculado'});
 const r=carteira([oculto],{cadastros:[cadastro({registro_id:'r-v',referencia_id:'ref-v',status_crm:'Novo'})]});
 assert.equal(r.cards.length,0);assert.equal(r.semCartao.length,0);assert.equal(r.inativos.length,0);
});

test('montarCarteira: divergência entre cartão e cadastro vira pendência discreta, sem trocar a etapa do cartão', () => {
 const c=card({id:'d1',cliente_id:'ref-d1',status:'Negociação'}),d=card({id:'d2',cliente_id:'ref-d2',status:'Negociação'}),e=card({id:'d3',cliente_id:'ref-d3',status:'Negociação'}),f=card({id:'d4',cliente_id:'ref-d4',status:'Cliente novo'});
 const r=carteira([c,d,e,f],{cadastros:[
  cadastro({referencia_id:'ref-d1',status_crm:'Contrato'}),
  cadastro({referencia_id:'ref-d2',status_crm:'Proposta enviada'}), // mesma etapa de exibição: sem aviso
  cadastro({referencia_id:'ref-d3',status_crm:'Legado'}),            // desconhecido vira Cliente novo: diverge de Negociação
  cadastro({referencia_id:'ref-d4',status_crm:''})                    // vazio não avisa
 ]});
 assert.deepEqual(r.cards.map(i=>i.etapa),['Negociação','Negociação','Negociação','Cliente novo']);
 assert.deepEqual(r.cards[0].pendencias,['Cadastro marca "Contrato"']);
 assert.deepEqual(r.cards[1].pendencias,[]);
 assert.deepEqual(r.cards[2].pendencias,['Cadastro marca "Legado"']);
 assert.deepEqual(r.cards[3].pendencias,[]);
});

test('montarCarteira: cadastro arquivado fica de fora e é contado; restaurado continua visível', () => {
 const r=carteira([],{cadastros:congelar([
  cadastro({registro_id:'a1',arquivamento:{ativo:true,arquivadoEm:'2026-09-30T10:00:00Z'}}),
  cadastro({registro_id:'a2',arquivamento:{ativo:false,restauradoEm:'2026-10-01T10:00:00Z'}}),
  cadastro({registro_id:'a3',arquivamento:true}),
  cadastro({registro_id:'a4',arquivamento:{}}),
  cadastro({registro_id:'a5',arquivamento:null})
 ])});
 assert.equal(r.arquivadosIgnorados,2);
 assert.deepEqual(r.semCartao.map(i=>i.registroId).sort(),['a2','a4','a5']);
});

test('montarCarteira: situação inativo, cancelado ou banido vai para inativos', () => {
 const r=carteira([],{cadastros:[
  cadastro({registro_id:'i1',situacao:'Inativo'}),cadastro({registro_id:'i2',situacao:'cancelado'}),cadastro({registro_id:'i3',situacao:' BANIDO '}),
  cadastro({registro_id:'i4',situacao:'Ativo'}),cadastro({registro_id:'i5',situacao:''}),cadastro({registro_id:'i6',situacao:null})
 ]});
 assert.deepEqual(r.inativos.map(i=>i.registroId).sort(),['i1','i2','i3']);
 assert.deepEqual(r.semCartao.map(i=>i.registroId).sort(),['i4','i5','i6']);
});

test('montarCarteira: status_crm do cadastro sem cartão cai na etapa correta de exibição', () => {
 const casos=[['Novo','Cliente novo',true],['Contato feito','Cliente novo',true],['Proposta enviada','Negociação',true],['Negociação','Negociação',true],['Contrato','Contrato',true],
  ['Cliente Ativo','Cliente ativo',true],['Cliente ativo','Cliente ativo',true],['Perdido','Perdido',true],['','Cliente novo',false],[null,'Cliente novo',false],['Legado','Cliente novo',false]];
 const linhas=casos.map(([s],k)=>cadastro({registro_id:`s${k}`,referencia_id:`refs${k}`,status_crm:s}));
 const {semCartao}=carteira([],{cadastros:congelar(linhas)});
 assert.equal(semCartao.length,casos.length);
 casos.forEach(([s,etapa,reconhecido],k)=>{
  const i=semCartao.find(x=>x.registroId===`s${k}`);
  assert.equal(i.etapa,etapa,String(s));assert.equal(i.etapaReconhecida,reconhecido,String(s));assert.equal(i.etapaOriginal,s??'');
  assert.equal(i.pendencias.includes('Sem etapa definida'),!reconhecido&&!s,String(s));
  assert.equal(i.pendencias.some(p=>p.startsWith('Etapa "')),!reconhecido&&!!s,String(s));
 });
});

test('montarCarteira: item de cadastro tem o formato do contrato', () => {
 const r=carteira([],{cadastros:[{registro_id:'reg-1',referencia_id:'ref-1',nome:'Pedro Alves',telefone:'',status_crm:'Negociação',situacao:'Ativo',municipioId:'mun-3',codigo:'PED01'}]});
 const i=r.semCartao[0];
 assert.deepEqual(i,{chave:'m:reg-1',tipo:'cadastro',id:null,clienteId:'ref-1',registroId:'reg-1',municipioId:'mun-3',card:null,nome:'Pedro Alves',municipio:'',telefone:'',cpf:'',codigo:'PED01',
  valor:null,lead:false,etapa:'Negociação',etapaOriginal:'Negociação',etapaReconhecida:true,responsaveis:[],passo:{tipo:'sem',previsto_em:null,dias:null},tarefa:null,movel:false,
  pendencias:['Sem telefone'],textoBusca:'pedro alves'});
});

test('montarCarteira: linhas de cadastro com campos ausentes não quebram e nenhuma válida some', () => {
 const linhas=[{referencia_id:'so-ref'},{registro_id:'so-reg'},{registro_id:'x',referencia_id:'y'},{},null,undefined,'texto',{nome:'Sem chave'},{registro_id:'',referencia_id:''}];
 const r=carteira([],{cadastros:congelar(linhas)});
 assert.deepEqual(r.semCartao.map(i=>i.chave).sort(),['m:only'.replace('only','so-reg'),'m:so-ref','m:x'].sort());
 const porRef=r.semCartao.find(i=>i.chave==='m:so-ref');
 assert.equal(porRef.clienteId,'so-ref');assert.equal(porRef.registroId,null);assert.equal(porRef.nome,'Cadastro sem nome');assert.equal(porRef.municipioId,null);
 const porReg=r.semCartao.find(i=>i.chave==='m:so-reg');
 assert.equal(porReg.clienteId,null);assert.equal(porReg.registroId,'so-reg');
 assert.ok(r.semCartao.every(i=>i.tipo==='cadastro'&&i.movel===false&&i.card===null&&i.passo.tipo==='sem'&&i.tarefa===null));
});

test('montarCarteira: nenhum cadastro some (soma das partes é igual ao total de linhas válidas)', () => {
 const cards=[card({id:'k1',cliente_id:'ref1'}),card({id:'k2',cliente_id:'ref2',origem:'vinculado'})];
 const linhas=[
  cadastro({registro_id:'r1',referencia_id:'ref1'}),                                        // com cartão
  cadastro({registro_id:'r2',referencia_id:'ref2'}),                                        // com cartão oculto
  cadastro({registro_id:'r3',referencia_id:'ref3',status_crm:'Novo'}),                      // sem cartão
  cadastro({registro_id:'r4',referencia_id:'ref4',status_crm:'Perdido'}),                   // sem cartão, perdido
  cadastro({registro_id:'r5',referencia_id:'ref5',status_crm:'Cliente Ativo'}),             // sem cartão, ativo
  cadastro({registro_id:'r6',referencia_id:'ref6',situacao:'Cancelado'}),                   // inativo
  cadastro({registro_id:'r7',referencia_id:'ref7',arquivamento:{ativo:true}}),              // arquivado
  cadastro({registro_id:'r8',referencia_id:'ref8',status_crm:'Legado'})                     // sem cartão, legado
 ];
 const r=carteira(congelar(cards),{cadastros:congelar(linhas)});
 const comCartao=linhas.filter(l=>cards.some(c=>c.cliente_id===l.referencia_id)).length;
 assert.equal(r.semCartao.length+r.inativos.length+r.arquivadosIgnorados+comCartao,linhas.length);
 assert.deepEqual([r.semCartao.length,r.inativos.length,r.arquivadosIgnorados,comCartao],[4,1,1,2]);
 assert.deepEqual(r.semCartao.map(i=>i.etapa).sort(),['Cliente ativo','Cliente novo','Cliente novo','Perdido']);
});

test('montarCarteira: linha repetida do mesmo cadastro (paginação) conta uma vez', () => {
 const l=cadastro({registro_id:'dup'});
 const r=carteira([],{cadastros:[l,{...l},{...l,nome:'Outra grafia'}]});
 assert.equal(r.semCartao.length,1);
});

test('montarCarteira: cartão arquivado não esconde o cadastro do cliente', () => {
 const arq=card({id:'z1',cliente_id:'ref-z',arquivado_em:'2026-10-01T10:00:00Z'});
 const r=carteira([arq],{cadastros:[cadastro({registro_id:'rz',referencia_id:'ref-z'})]});
 assert.equal(r.cards.length,0);assert.equal(r.semCartao.length,1);
});

const financeiro=(o={})=>({id:`fin${++n}`,nome:`Cliente fin ${n}`,codigo:`F${n}`,municipio_id:'m1',ativo:true,...o});

test('montarCarteira: cliente só do financeiro (sem moradores e sem cartão) aparece em Cliente novo, sem etapa definida', () => {
 const f=financeiro({id:'fin-a',nome:'Rita Prado',codigo:'RIT01',municipio_id:'mun-7'});
 const r=carteira([],{clientes:congelar([f])});
 assert.equal(r.semCartao.length,1);assert.equal(r.inativos.length,0);
 assert.deepEqual(r.semCartao[0],{chave:'m:fin-a',tipo:'cadastro',id:null,clienteId:'fin-a',registroId:'fin-a',municipioId:'mun-7',card:null,nome:'Rita Prado',municipio:'',telefone:'',cpf:'',codigo:'RIT01',
  valor:null,lead:false,etapa:'Cliente novo',etapaOriginal:'',etapaReconhecida:false,responsaveis:[],passo:{tipo:'sem',previsto_em:null,dias:null},tarefa:null,movel:false,
  pendencias:['Sem telefone','Sem etapa definida'],textoBusca:'rita prado'});
});

test('montarCarteira: cliente do financeiro com ativo=false vai para inativos; ativo nulo ou ausente conta como ativo', () => {
 const r=carteira([],{clientes:[financeiro({id:'f1',ativo:false}),financeiro({id:'f2',ativo:true}),financeiro({id:'f3',ativo:null}),financeiro({id:'f4',ativo:undefined})]});
 assert.deepEqual(r.inativos.map(i=>i.registroId),['f1']);
 assert.deepEqual(r.semCartao.map(i=>i.registroId).sort(),['f2','f3','f4']);
});

test('montarCarteira: cliente do financeiro não duplica quem já tem cartão, complemento (até arquivado) ou cartão vinculado oculto', () => {
 const cards=congelar([card({id:'k1',cliente_id:'fc1'}),card({id:'k2',cliente_id:'fc2',origem:'vinculado'})]);
 const clientes=congelar([financeiro({id:'fc1'}),financeiro({id:'fc2'}),financeiro({id:'fc3'}),financeiro({id:'fc4'}),financeiro({id:'fc5'}),financeiro({id:'fc6'}),financeiro({id:'fc7'})]);
 const cadastros=congelar([
  cadastro({registro_id:'r3',referencia_id:'fc3',status_crm:'Contrato'}),                         // complemento por referência
  cadastro({registro_id:'r4',referencia_id:'fc4',arquivamento:{ativo:true}}),                     // arquivado continua escondido
  cadastro({registro_id:'fc5',referencia_id:'',status_crm:'Novo'}),                              // complemento só com registro_id igual ao id do financeiro
  cadastro({registro_id:'r6',referencia_id:'fc6',situacao:'Cancelado'})                           // inativo pelo complemento
 ]);
 const r=carteira(cards,{clientes,cadastros});
 assert.deepEqual(r.semCartao.map(i=>i.registroId).sort(),['fc5','fc7','r3'].sort());
 assert.deepEqual(r.inativos.map(i=>i.registroId),['r6']);
 assert.equal(r.arquivadosIgnorados,1);
 assert.equal(r.cards.length,1);
 // O que só existe no financeiro entra uma vez; o resto já estava representado por cartão ou complemento.
 assert.equal(r.semCartao.filter(i=>i.registroId==='fc7').length,1);
});

test('montarCarteira: complemento usa o nome e a situação do financeiro quando faltam ou divergem', () => {
 const cadastros=congelar([
  cadastro({registro_id:'r1',referencia_id:'fn1',nome:'',codigo:'',municipioId:null,status_crm:'Negociação'}),
  cadastro({registro_id:'r2',referencia_id:'fn2',nome:'Nome do complemento',situacao:'Ativo'}),
  cadastro({registro_id:'r3',referencia_id:'fn3',situacao:'Cancelado'})
 ]);
 const clientes=congelar([financeiro({id:'fn1',nome:'Nome do financeiro',codigo:'FIN01',municipio_id:'mun-9'}),financeiro({id:'fn2',nome:'Nome canônico',ativo:false}),financeiro({id:'fn3',ativo:false})]);
 const r=carteira([],{cadastros,clientes});
 const um=r.semCartao.find(i=>i.registroId==='r1');
 assert.deepEqual([um.nome,um.codigo,um.municipioId,um.etapa],['Nome do financeiro','FIN01','mun-9','Negociação']);
 assert.deepEqual(r.inativos.map(i=>[i.registroId,i.nome]).sort(),[['r2','Nome canônico'],['r3',clientes[2].nome]].sort(),'ativo=false no financeiro vale como inativo, sem perder o cancelado do complemento');
});

test('montarCarteira: clientes nulo, vazio ou com linhas inválidas não cria nada e não quebra', () => {
 for(const clientes of [null,undefined,[],[null,undefined,'texto',{},{id:''},{id:null},{nome:'Sem id'}]]){
  const r=carteira([card()],{clientes});
  assert.deepEqual([r.semCartao.length,r.inativos.length,r.arquivadosIgnorados],[0,0,0]);
 }
 const r=carteira([],{clientes:[financeiro({id:'rep'}),financeiro({id:'rep',nome:'Linha repetida'})]});
 assert.equal(r.semCartao.length,1,'linha repetida (paginação) conta uma vez');
});

test('montarCarteira: cliente só do financeiro respeita a busca e some do filtro por comercial, como os outros cadastros', () => {
 const r=carteira([],{clientes:[financeiro({id:'bf1',nome:'Rita Prado'}),financeiro({id:'bf2',nome:'Álvaro Dias'})]});
 assert.deepEqual(filtrarItens(r.semCartao,{busca:'rita'}).map(i=>i.nome),['Rita Prado']);
 assert.equal(filtrarItens(r.semCartao,{responsavel:'e1'}).length,0);
});

test('montarCarteira: nenhum cliente some (cartões, complementos e financeiro somam o total de clientes distintos)', () => {
 const cards=[card({id:'t1',cliente_id:'tc1'}),card({id:'t2',cliente_id:'tc2',origem:'vinculado'})];
 const clientes=['tc1','tc2','tc3','tc4','tc5','tc6'].map(id=>financeiro({id,ativo:id!=='tc6'}));
 const cadastros=[cadastro({registro_id:'tr3',referencia_id:'tc3'}),cadastro({registro_id:'tr4',referencia_id:'tc4',arquivamento:{ativo:true}})];
 const r=carteira(congelar(cards),{clientes:congelar(clientes),cadastros:congelar(cadastros)});
 // tc1 cartão visível, tc2 cartão oculto (vinculado), tc3 complemento, tc4 arquivado, tc5 só financeiro, tc6 só financeiro inativo
 assert.deepEqual([r.cards.length,r.semCartao.length,r.inativos.length,r.arquivadosIgnorados],[1,2,1,1]);
 assert.deepEqual(r.semCartao.map(i=>i.registroId).sort(),['tc5','tr3']);
 assert.deepEqual(r.inativos.map(i=>i.registroId),['tc6']);
});

test('montarCarteira: lista de cadastros sem cartão sai ordenada por nome (pt-BR)', () => {
 const r=carteira([],{cadastros:[cadastro({nome:'Zélia'}),cadastro({nome:'Érica'}),cadastro({nome:'Ana'}),cadastro({nome:'fabio'})]});
 assert.deepEqual(r.semCartao.map(i=>i.nome),['Ana','Érica','fabio','Zélia']);
});

test('montarCarteira: volume grande continua correto', () => {
 const cards=Array.from({length:3000},(_,k)=>card({id:`g${k}`,cliente_id:`gr${k}`,status:ETAPAS_EXIBICAO[k%5]}));
 const linhas=Array.from({length:12000},(_,k)=>cadastro({registro_id:`gm${k}`,referencia_id:`gr${k}`,status_crm:k%2?'Novo':''}));
 const t=Date.now(),r=carteira(cards,{followups:cards.map((c,k)=>fu(c.id,`2026-10-0${1+k%6}T15:00:00Z`)),tarefas:cards.map(c=>tarefa(c.id,'2026-10-04')),cadastros:linhas});
 assert.equal(r.cards.length,3000);assert.equal(r.semCartao.length,9000);
 assert.ok(Date.now()-t<5000,'montagem lenta demais');
});

// ---------- 5) filtrarItens ----------
const base=()=>{
 const a=card({id:'a',nome:'Maria Souza',cpf_cnpj:'111.444.777-35',municipio:'Cuiabá',responsaveis_ids:['e1']});
 const b=card({id:'b',nome:'José Ângelo',cpf_cnpj:'529.982.247-25',municipio:'Cáceres',responsaveis_ids:['e2']});
 const c=lead({id:'c',lead_nome:'Lead Compartilhado',lead_telefone:'(65) 98888-7777',lead_cidade:'Várzea Grande',responsaveis_ids:['e1','e2']});
 const d=lead({id:'d',lead_nome:'Lead Sem Dono',responsaveis_ids:[],responsavel_id:null});
 return montarCarteira({cards:[a,b,c,d],cadastros:[cadastro({registro_id:'rx',referencia_id:'refx',nome:'Cadastro Solto',telefone:'65977776666'})],agora:AGORA});
};

test('filtrarItens: busca sem acento nem caixa por nome, CPF, telefone do lead e município', () => {
 const {cards}=base();
 const ids=busca=>filtrarItens(cards,{busca}).map(i=>i.id);
 assert.deepEqual(ids('maria'),['a']);assert.deepEqual(ids('MARIA SOUZA'),['a']);assert.deepEqual(ids('jose angelo'),['b']);assert.deepEqual(ids('JOSÉ'),['b']);
 assert.deepEqual(ids('111.444'),['a']);assert.deepEqual(ids('529.982.247-25'),['b']);
 assert.deepEqual(ids('98888-7777'),['c']);assert.deepEqual(ids('varzea'),['c','d']);
 assert.deepEqual(ids('cuiaba'),['a']);assert.deepEqual(ids('caceres'),['b']);
 assert.deepEqual(ids('nada disso'),[]);
});

test('filtrarItens: busca vazia ou só espaços devolve todos, num array novo, sem alterar a entrada', () => {
 const {cards}=base(),entrada=congelar([...cards]);
 for(const busca of [undefined,'','   ']){const r=filtrarItens(entrada,{busca});assert.deepEqual(r,cards);assert.notEqual(r,entrada);}
 assert.deepEqual(filtrarItens(entrada),cards);
 assert.deepEqual(filtrarItens(null),[]);
});

test('filtrarItens: filtro de comercial por erpRef, sem responsável e cadastro', () => {
 const {cards,semCartao}=base();
 const ids=(itens,responsavel,busca='')=>filtrarItens(itens,{responsavel,busca}).map(i=>i.id);
 assert.deepEqual(ids(cards,'e1'),['a','c']);assert.deepEqual(ids(cards,'e2'),['b','c']);assert.deepEqual(ids(cards,'e9'),[]);
 assert.deepEqual(ids(cards,SEM_RESPONSAVEL),['d']);assert.equal(SEM_RESPONSAVEL,'__sem__');
 assert.deepEqual(ids(cards,''),['a','b','c','d']);
 assert.deepEqual(ids(cards,'e1','lead'),['c']);
 // Cadastro (sem responsável) só aparece quando não há comercial escolhido.
 assert.equal(filtrarItens(semCartao,{responsavel:'e1'}).length,0);
 assert.equal(filtrarItens(semCartao,{responsavel:SEM_RESPONSAVEL}).length,0);
 assert.equal(filtrarItens(semCartao,{responsavel:''}).length,1);
 assert.equal(filtrarItens(semCartao,{busca:'solto'}).length,1);
 assert.equal(filtrarItens(semCartao,{busca:'77776666'}).length,1);
});

// ---------- 6) filaDoDia, resumoDoDia, totaisColuna ----------
const dia=()=>{
 const cards=[
  card({id:'A',status:'Cliente novo',nome:'Ana',valor_total:100}),
  card({id:'B',status:'Negociação',nome:'Bruno',valor_total:250.5}),
  card({id:'C',status:'Contrato',nome:'Carla',valor_total:1000}),
  card({id:'D',status:'Negociação',nome:'Davi',valor_total:300}),
  card({id:'E',status:'Cliente novo',nome:'Eva',valor_total:null}),
  card({id:'F',status:'Negociação',nome:'Érica',valor_total:5000}),
  card({id:'G',status:'Cliente novo',nome:'Gabi',valor_total:null}),
  card({id:'H',status:'Contrato',nome:'Fabio',valor_total:5000}),
  card({id:'I',status:'Cliente novo',nome:'Iara',valor_total:200}),
  card({id:'J',status:'Perdido',nome:'Jonas',valor_total:900}),
  card({id:'K',status:'Cliente ativo',nome:'Kátia',valor_total:700}),
  card({id:'L',status:'Cliente novo',nome:'Lia',valor_total:50})
 ];
 const followups=[
  fu('B','2026-09-29T15:00:00Z'),fu('A','2026-10-02T15:00:00Z'),fu('C','2026-10-04T13:00:00Z'),
  fu('E','2026-10-04T17:00:00Z'),fu('D','2026-10-04T21:00:00Z'),
  fu('J','2026-10-01T15:00:00Z'),fu('K','2026-10-01T15:00:00Z'),fu('L','2026-10-05T15:00:00Z')
 ];
 return montarCarteira({cards,followups,cadastros:[cadastro({nome:'Cadastro Solto',status_crm:'Negociação'})],agora:AGORA});
};

test('filaDoDia: agrupa em atrasados, hoje e sem próximo passo e ordena cada grupo', () => {
 const c=dia(),todos=[...c.cards,...c.semCartao],entrada=congelar([...todos]);
 const fila=filaDoDia(entrada,AGORA);
 assert.deepEqual(fila.atrasados.map(i=>i.id),['B','A','C'],'mais antigo primeiro');
 assert.deepEqual(fila.hoje.map(i=>i.id),['E','D'],'horário crescente');
 assert.deepEqual(fila.sem.map(i=>i.id),['F','H','I','G'],'maior valor primeiro; empate por nome pt-BR (Érica antes de Fabio); sem valor por último');
 assert.deepEqual(Object.keys(fila),['atrasados','hoje','sem']);
});

test('filaDoDia: ignora Perdido, Cliente ativo, cadastros sem cartão e quem tem passo futuro', () => {
 const c=dia(),fila=filaDoDia([...c.cards,...c.semCartao],AGORA),ids=[...fila.atrasados,...fila.hoje,...fila.sem].map(i=>i.id);
 for(const fora of ['J','K','L'])assert.ok(!ids.includes(fora),fora);
 assert.ok([...fila.atrasados,...fila.hoje,...fila.sem].every(i=>i.tipo==='card'&&ETAPAS_ABERTAS.includes(i.etapa)));
 assert.deepEqual(filaDoDia([],AGORA),{atrasados:[],hoje:[],sem:[]});
 assert.deepEqual(filaDoDia(null,AGORA),{atrasados:[],hoje:[],sem:[]});
});

test('filaDoDia: usa o agora recebido para reclassificar, sem alterar os itens nem o cartão', () => {
 const c=dia(),entrada=congelar([...c.cards]);
 const amanha=filaDoDia(entrada,Date.parse('2026-10-05T15:00:00Z'));
 // Em 05/10: C (04/10 10h) e D (04/10 18h) e E (04/10 14h) já passaram do dia; L (05/10) é hoje.
 assert.deepEqual(amanha.atrasados.map(i=>i.id),['B','A','C','E','D']);
 assert.deepEqual(amanha.hoje.map(i=>i.id),['L'],'L é de 05/10 e fica na fila de hoje; J e K continuam fora');
 assert.equal(amanha.atrasados.find(i=>i.id==='D').passo.dias,1);
 assert.equal(amanha.atrasados.find(i=>i.id==='D').card,c.cards.find(i=>i.id==='D').card);
 assert.equal(c.cards.find(i=>i.id==='D').passo.tipo,'hoje','o item original não foi alterado');
 // Mais cedo no mesmo dia: D (18h) e E (14h) ainda são de hoje, C (10h) ainda não venceu.
 const manha=filaDoDia(entrada,Date.parse('2026-10-04T12:00:00Z'));
 assert.deepEqual(manha.hoje.map(i=>i.id),['C','E','D']);
});

test('filaDoDia: item sem passo calculado é tratado como sem próximo passo', () => {
 const solto={tipo:'card',etapa:'Negociação',nome:'Solto',chave:'c:solto',valor:10};
 assert.deepEqual(filaDoDia([solto],AGORA).sem.map(i=>i.chave),['c:solto']);
});

test('filaDoDia: sem próximo passo, mesmo valor e mesmo nome desempata pela chave', () => {
 const a={chave:'c:2',tipo:'card',etapa:'Cliente novo',nome:'Igual',valor:10,passo:{tipo:'sem',previsto_em:null,dias:null}};
 const b={...a,chave:'c:1'};
 assert.deepEqual(filaDoDia([a,b],AGORA).sem.map(i=>i.chave),['c:1','c:2']);
});

test('resumoDoDia: contadores, valor em aberto e cartões sem valor', () => {
 const c=dia();
 const r=resumoDoDia([...c.cards,...c.semCartao],AGORA);
 assert.deepEqual(r,{atrasados:3,hoje:2,sem:4,pendentes:5,andamento:10,valorAberto:100+250.5+1000+300+5000+5000+200+50,semValor:2});
 assert.equal(r.pendentes,r.atrasados+r.hoje);
 assert.deepEqual(resumoDoDia([],AGORA),{atrasados:0,hoje:0,sem:0,pendentes:0,andamento:0,valorAberto:0,semValor:0});
});

test('resumoDoDia: soma em centavos, sem erro de ponto flutuante', () => {
 const {cards}=carteira([card({valor_total:'0.10',status:'Cliente novo'}),card({valor_total:'0.20',status:'Cliente novo'}),card({valor_total:'1200.50'})]);
 assert.equal(resumoDoDia(cards,AGORA).valorAberto,1200.8);
 assert.equal(totaisColuna(cards.slice(0,2)).valor,0.3);
});

test('totaisColuna: quantidade, valor e cartões sem valor; cadastros ficam de fora', () => {
 const c=dia(),negociacao=[...c.cards,...c.semCartao].filter(i=>i.etapa==='Negociação');
 assert.equal(negociacao.length,4,'3 cartões e 1 cadastro sem cartão');
 assert.deepEqual(totaisColuna(congelar(negociacao)),{quantidade:3,valor:250.5+300+5000,semValor:0});
 const novos=c.cards.filter(i=>i.etapa==='Cliente novo');
 assert.deepEqual(totaisColuna(novos),{quantidade:5,valor:100+200+50,semValor:2});
 assert.deepEqual(totaisColuna([]),{quantidade:0,valor:0,semValor:0});
 assert.deepEqual(totaisColuna(null),{quantidade:0,valor:0,semValor:0});
});

// ---------- 7) proximaEtapa, dadosMovimento e decidirMovimento ----------
test('proximaEtapa: Cliente novo, Negociação, Contrato e Cliente ativo; o resto não avança', () => {
 assert.equal(proximaEtapa('Cliente novo'),'Negociação');assert.equal(proximaEtapa('Negociação'),'Contrato');assert.equal(proximaEtapa('Contrato'),'Cliente ativo');
 assert.equal(proximaEtapa('Cliente ativo'),null);assert.equal(proximaEtapa('Perdido'),null);assert.equal(proximaEtapa('Legado'),null);assert.equal(proximaEtapa(undefined),null);
});

test('dadosMovimento: só o status muda e a negociação é preservada exatamente', () => {
 const avista=card({valor_total:'1200.50',forma_negociacao:'avista',desconto_percentual:5,parcelas:null,entrada_percentual:null,entrada_valor:null});
 assert.deepEqual(dadosMovimento(congelar(avista),'Contrato'),{ok:true,dados:{status:'Contrato',valor_total:1200.5,forma_negociacao:'avista',parcelas:null,desconto_percentual:5,entrada_percentual:null,entrada_valor:null}});
 const parcelado=card({valor_total:'3000.00',forma_negociacao:'parcelado',parcelas:10,desconto_percentual:null,entrada_percentual:null,entrada_valor:null});
 assert.deepEqual(dadosMovimento(parcelado,'Perdido').dados,{status:'Perdido',valor_total:3000,forma_negociacao:'parcelado',parcelas:10,desconto_percentual:null,entrada_percentual:null,entrada_valor:null});
 const entrada=card({valor_total:'9000.00',forma_negociacao:'entrada_parcelas',parcelas:6,desconto_percentual:null,entrada_percentual:'30.00'});
 assert.deepEqual(dadosMovimento(entrada,'Negociação').dados,{status:'Negociação',valor_total:9000,forma_negociacao:'entrada_parcelas',parcelas:6,desconto_percentual:null,entrada_percentual:30,entrada_valor:null});
 const vazia=card({valor_total:null,forma_negociacao:null,parcelas:null,desconto_percentual:null,entrada_percentual:null,entrada_valor:null});
 assert.deepEqual(dadosMovimento(vazia,'Negociação'),{ok:true,dados:{status:'Negociação',valor_total:null,forma_negociacao:null,parcelas:null,desconto_percentual:null,entrada_percentual:null,entrada_valor:null}});
});

test('dadosMovimento: valor sem forma ou cartão ausente devolve ok false com a mensagem', () => {
 const semForma=card({valor_total:'1000.00',forma_negociacao:null,desconto_percentual:null});
 assert.deepEqual(dadosMovimento(semForma,'Contrato'),{ok:false,erro:'Escolha a forma de negociação.'});
 const semParcelas=card({valor_total:'1000.00',forma_negociacao:'parcelado',parcelas:null,desconto_percentual:null});
 assert.deepEqual(dadosMovimento(semParcelas,'Contrato'),{ok:false,erro:'Informe de 1 a 999 parcelas inteiras.'});
 assert.equal(dadosMovimento(null,'Contrato').ok,false);assert.equal(dadosMovimento(undefined,'Contrato').ok,false);
});

const paraDecidir=(o,extra)=>itemUnico(card(o),extra);

test('decidirMovimento: nenhuma quando não há o que mover', () => {
 const i=congelar(paraDecidir({status:'Negociação'}));
 assert.equal(decidirMovimento(i,'Negociação').acao,'nenhuma','mesma etapa');
 assert.equal(decidirMovimento(i,'Legado').acao,'nenhuma','destino inválido');
 assert.equal(decidirMovimento(i,undefined).acao,'nenhuma');
 assert.equal(decidirMovimento(i,'Novo').acao,'nenhuma','só os 5 valores do banco são destinos');
 assert.equal(decidirMovimento(null,'Contrato').acao,'nenhuma');
 const cad=carteira([],{cadastros:[cadastro({status_crm:'Negociação'})]}).semCartao[0];
 const r=decidirMovimento(cad,'Contrato');
 assert.equal(r.acao,'nenhuma');assert.match(r.mensagem,/não tem cartão/);
 const naoMovel={...i,movel:false};
 assert.equal(decidirMovimento(naoMovel,'Contrato').acao,'nenhuma');
 assert.deepEqual(decidirMovimento(i,'Negociação'),{acao:'nenhuma',mensagem:'',etapaSugerida:null});
});

test('decidirMovimento: lead indo a Contrato ou Cliente ativo abre a ficha e não grava', () => {
 const l=congelar(itemUnico(lead({status:'Negociação'})));
 const msg=d=>`Para levar este lead a ${d}, confirme o município e a remessa na ficha.`;
 assert.deepEqual(decidirMovimento(l,'Contrato'),{acao:'abrir-ficha',mensagem:msg('Contrato'),etapaSugerida:'Contrato'});
 assert.deepEqual(decidirMovimento(l,'Cliente ativo'),{acao:'abrir-ficha',mensagem:msg('Cliente ativo'),etapaSugerida:'Cliente ativo'});
 const novo=congelar(itemUnico(lead({status:'Cliente novo'})));
 assert.equal(decidirMovimento(novo,'Contrato').acao,'abrir-ficha');
});

test('decidirMovimento: cliente de Negociação não pula direto para Cliente ativo', () => {
 const i=congelar(paraDecidir({status:'Negociação'}));
 assert.deepEqual(decidirMovimento(i,'Cliente ativo'),{acao:'abrir-ficha',mensagem:'Passe primeiro por Contrato ou conclua a ativação na ficha.',etapaSugerida:'Cliente ativo'});
 assert.equal(decidirMovimento(congelar(paraDecidir({status:'Cliente novo'})),'Cliente ativo').acao,'abrir-ficha');
 assert.equal(decidirMovimento(congelar(paraDecidir({status:'Perdido'})),'Cliente ativo').acao,'abrir-ficha');
});

test('decidirMovimento: sem CPF abre a ficha para Contrato e Cliente ativo, mas não para as demais etapas', () => {
 const msg='Este cliente está sem CPF. Confira os dados na ficha antes de salvar a etapa.';
 const semCpf=congelar(paraDecidir({status:'Negociação',cpf_cnpj:null}));
 assert.deepEqual(decidirMovimento(semCpf,'Contrato'),{acao:'abrir-ficha',mensagem:msg,etapaSugerida:'Contrato'});
 const contratoSemCpf=congelar(paraDecidir({status:'Contrato',cpf_cnpj:'   '}));
 assert.deepEqual(decidirMovimento(contratoSemCpf,'Cliente ativo'),{acao:'abrir-ficha',mensagem:msg,etapaSugerida:'Cliente ativo'});
 assert.equal(decidirMovimento(semCpf,'Perdido').acao,'gravar');
 assert.equal(decidirMovimento(semCpf,'Cliente novo').acao,'gravar');
 assert.equal(decidirMovimento(contratoSemCpf,'Negociação').acao,'gravar');
});

test('decidirMovimento: negociação inválida abre a ficha com o erro, porque só ela permite corrigir', () => {
 const i=congelar(paraDecidir({status:'Cliente novo',valor_total:'1000.00',forma_negociacao:null,desconto_percentual:null}));
 assert.deepEqual(decidirMovimento(i,'Negociação'),{acao:'abrir-ficha',mensagem:'Escolha a forma de negociação.',etapaSugerida:'Negociação'});
 assert.equal(decidirMovimento(i,'Perdido').acao,'abrir-ficha');
});

test('decidirMovimento: Contrato para Cliente ativo de cliente com CPF pede confirmação', () => {
 const i=congelar(paraDecidir({status:'Contrato',nome:'Maria Souza'}));
 assert.deepEqual(decidirMovimento(i,'Cliente ativo'),{acao:'confirmar',mensagem:'Maria Souza passará a Cliente ativo e sairá do funil. A ativação fica registrada nos relatórios. Confirmar?',etapaSugerida:null});
});

test('decidirMovimento: movimentos simples gravam (avançar, voltar, perder e reabrir)', () => {
 const gravar=(origem,destino,o={})=>decidirMovimento(congelar(itemUnico(origem==='lead'?lead(o):card({status:origem,...o}))),destino);
 assert.deepEqual(gravar('lead','Negociação'),{acao:'gravar',mensagem:'',etapaSugerida:null});
 assert.equal(gravar('lead','Perdido').acao,'gravar');
 assert.equal(gravar('Cliente novo','Negociação').acao,'gravar');
 assert.equal(gravar('Negociação','Contrato').acao,'gravar');
 assert.equal(gravar('Negociação','Cliente novo').acao,'gravar');
 assert.equal(gravar('Contrato','Perdido').acao,'gravar');
 assert.equal(gravar('Contrato','Negociação').acao,'gravar');
});

// Cliente ativo só aparece na coluna Follow Up (followupsPrioritarios só exclui Perdido). Arrastá-lo para uma etapa aberta desfaz a ativação
// (o gatilho registrar_ativacao marca desfeito_em), então não pode ser um gesto único: abre a ficha, onde só Salvar grava.
test('decidirMovimento: Cliente ativo e Perdido nunca gravam por arraste; abrem a ficha com a etapa escolhida', () => {
 for(const origem of ['Cliente ativo','Perdido']){
  const i=congelar(paraDecidir({status:origem}));
  for(const destino of ETAPAS_EXIBICAO.filter(e=>e!==origem)){
   const d=decidirMovimento(i,destino);
   assert.deepEqual(d,{acao:'abrir-ficha',mensagem:`Este cliente está em ${origem}. Para mudar a etapa, confira o Status na ficha e salve.`,etapaSugerida:destino},`${origem} para ${destino}`);
  }
  assert.equal(decidirMovimento(i,origem).acao,'nenhuma','mesma etapa continua sem ação');
 }
 // O mesmo vale para quem só é Cliente ativo pelo mapeamento de exibição (grafia antiga).
 assert.equal(decidirMovimento(congelar(paraDecidir({status:'Cliente Ativo'})),'Contrato').acao,'abrir-ficha');
});

test('decidirMovimento: Cliente ativo com FollowUp pendente (coluna Follow Up) não é movido por arraste', () => {
 const usuario={id:'u1',erpRef:'e1',tipoERP:'Comercial',ativo:true};
 const ativo=card({id:'fa1',status:'Cliente ativo',responsavel_id:'e1',responsaveis_ids:['e1']});
 const proximas=[fu('fa1',new Date(AGORA+3600e3).toISOString())];
 const prioritarios=followupsPrioritarios([ativo],proximas,usuario,AGORA);
 assert.equal(prioritarios.length,1,'o cartão ativo entra na coluna Follow Up');
 const item=carteira([ativo],{followups:proximas}).cards[0];
 assert.equal(item.etapa,'Cliente ativo');assert.equal(item.movel,true);
 for(const destino of ['Cliente novo','Negociação','Contrato'])assert.equal(decidirMovimento(item,destino).acao,'abrir-ficha',destino);
});

test('decidirMovimento: nunca grava nem altera o item, o cartão ou o payload possível', () => {
 const i=congelar(paraDecidir({status:'Contrato'}));
 const antes=JSON.stringify(i);
 for(const d of ETAPAS_EXIBICAO)decidirMovimento(i,d);
 assert.equal(JSON.stringify(i),antes);
 assert.deepEqual(Object.keys(decidirMovimento(i,'Perdido')).sort(),['acao','etapaSugerida','mensagem']);
});

// ---------- 8) agruparTarefas, opcoesResponsavel, normalizarVisao ----------
test('agruparTarefas: atrasadas, hoje e próximas ordenadas por prazo; inválidas ao fim das próximas', () => {
 const t=(id,prazo)=>({id,prazo,titulo:id});
 const entrada=congelar([t('a','2026-10-10'),t('b','2026-10-04'),t('c','2026-09-30'),t('d','sem prazo'),t('e','2026-10-03'),t('f',null),t('g','2026-10-04'),t('h','2026-10-05'),t('i','2026-13-45'),null,t('j','')]);
 const g=agruparTarefas(entrada,'2026-10-04');
 assert.deepEqual(g.atrasadas.map(x=>x.id),['c','e']);
 assert.deepEqual(g.hoje.map(x=>x.id),['b','g']);
 assert.deepEqual(g.proximas.map(x=>x.id),['h','a','d','f','i','j']);
 assert.equal(g.atrasadas[0],entrada[2],'devolve os mesmos objetos');
 assert.deepEqual(agruparTarefas([],'2026-10-04'),{atrasadas:[],hoje:[],proximas:[]});
 assert.deepEqual(agruparTarefas(null,'2026-10-04'),{atrasadas:[],hoje:[],proximas:[]});
 assert.equal(agruparTarefas([t('x','2000-01-01')]).atrasadas.length,1,'hojeISO padrão é o dia atual');
});

test('opcoesResponsavel: extras para quem não é comercial ativo e Sem responsável, sem repetir', () => {
 const usuarios=congelar([
  {id:'u1',erpRef:'e1',nome:'Ana',ativo:true,tipoERP:'Comercial'},
  {id:'u2',erpRef:'e2',nome:'Bia',ativo:false,tipoERP:'Comercial'},
  {id:'u3',erpRef:'e3',nome:'Carla',ativo:true,tipoERP:'Diretor técnico'}
 ]);
 const {cards,semCartao}=montarCarteira({cards:[
  card({responsaveis_ids:['e1']}),card({responsaveis_ids:['e2']}),card({responsaveis_ids:['e2','e3']}),card({responsaveis_ids:['e9']}),card({responsaveis_ids:[],responsavel_id:null})
 ],cadastros:[cadastro()],agora:AGORA});
 assert.deepEqual(opcoesResponsavel(congelar([...cards,...semCartao]),usuarios),[
  {valor:'e2',rotulo:'Bia (inativo ou sem perfil comercial)'},
  {valor:'e3',rotulo:'Carla (inativo ou sem perfil comercial)'},
  {valor:'e9',rotulo:'Responsável removido'},
  {valor:'__sem__',rotulo:'Sem responsável'}
 ]);
 // Só comerciais ativos e nenhum cartão sem dono: nada a acrescentar.
 assert.deepEqual(opcoesResponsavel(cards.filter(i=>i.responsaveis.join()==='e1'),usuarios),[]);
 assert.deepEqual(opcoesResponsavel([],usuarios),[]);
 assert.deepEqual(opcoesResponsavel(cards,null).map(o=>[o.valor,o.rotulo]),[['e1','Responsável removido'],['e2','Responsável removido'],['e3','Responsável removido'],['e9','Responsável removido'],['__sem__','Sem responsável']],'sem lista de usuários nenhum responsável é conhecido');
});

test('opcoesResponsavel: cadastros sem cartão nunca geram opção e o usuário sem erpRef casa pelo id', () => {
 const {semCartao}=carteira([],{cadastros:[cadastro()]});
 assert.deepEqual(opcoesResponsavel(semCartao,[]),[]);
 const {cards}=carteira([card({responsaveis_ids:['u7']})]);
 assert.equal(opcoesResponsavel(cards,[{id:'u7',nome:'Dora',ativo:false,tipoERP:'Comercial'}])[0].rotulo,'Dora (inativo ou sem perfil comercial)');
});

test('normalizarVisao: preserva as três visões salvas e usa reduzido para o resto', () => {
 assert.deepEqual(VISOES_FUNIL,['reduzido','semi','detalhada']);
 for(const v of VISOES_FUNIL)assert.equal(normalizarVisao(v),v);
 for(const v of ['x',null,undefined,'',' semi','SEMI',3,{}])assert.equal(normalizarVisao(v),'reduzido',String(v));
});

// ---------- 9) contrato com o sistema ----------
test('contrato: ETAPAS_FUNIL e ETAPAS_EXIBICAO continuam compatíveis com o banco', () => {
 assert.deepEqual([...ETAPAS_FUNIL],['Cliente novo','Negociação','Contrato']);
 assert.deepEqual([...ETAPAS_ABERTAS],[...ETAPAS_FUNIL]);
 assert.deepEqual([...ETAPAS_EXIBICAO],['Cliente novo','Negociação','Contrato','Cliente ativo','Perdido']);
 const sql=readFileSync(new URL('../supabase/migrations/20260919161336_crm_importacao_funil.sql',import.meta.url),'utf8');
 const valores=[...sql.match(/integracao_crm_cards_status_check check\(status in \(([^)]*)\)\)/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual([...ETAPAS_EXIBICAO].sort(),[...valores].sort(),'ETAPAS_EXIBICAO deve ser exatamente o CHECK de integracao_crm_cards.status');
});

test('contrato: nenhuma etapa gravada fora dos 5 valores do banco', () => {
 const c=paraDecidir({status:'Negociação'});
 for(const destino of ETAPAS_EXIBICAO){const r=dadosMovimento(c.card,destino);assert.equal(r.dados.status,destino);}
 for(const legado of ['Novo','Contato feito','Proposta enviada','Cliente Ativo','Legado','']){
  const e=etapaDeExibicao(legado);
  assert.ok(ETAPAS_EXIBICAO.includes(e.etapa),`${legado} é exibido numa etapa do banco`);
  assert.equal(decidirMovimento(c,legado).acao,'nenhuma',`${legado} nunca é destino de movimento`);
 }
});

test('contrato: o módulo é puro (sem React, rede, DOM, armazenamento ou escrita)', () => {
 const fonte=readFileSync(new URL('../src/crm-hoje.js',import.meta.url),'utf8').replace(/\/\/.*$/gm,''); // comentários podem citar quem grava
 assert.doesNotMatch(fonte,/from\s+['"]react|\.jsx['"]|fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.|window\.|crm-api|rpcCRM|salvarNegociacaoCRM|editarCRM|supabase/i);
 const imports=[...fonte.matchAll(/^import .* from '([^']+)'/gm)].map(m=>m[1]).sort();
 assert.deepEqual(imports,['./crm-edicao.js','./crm-followup.js','./crm-negociacao.js','./crm-regras.js']);
});

test('mover preserva entrada em reais exatamente',()=>{
 const c=card({valor_total:1234.56,forma_negociacao:'entrada_parcelas',parcelas:3,desconto_percentual:null,entrada_percentual:null,entrada_valor:123.45});
 const r=dadosMovimento(c,'Contrato');assert.equal(r.dados.entrada_valor,123.45);assert.equal(r.dados.entrada_percentual,null);
});

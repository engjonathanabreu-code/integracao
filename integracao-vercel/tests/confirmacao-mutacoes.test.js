import test from 'node:test';
import assert from 'node:assert/strict';
import {alteracoesConfirmadas,criarConfirmacoesMutacoes,erroConfirmacao} from '../src/confirmacao-mutacoes.js';

const base = () => ({processos:[{id:'p',unidades:[{id:'u1',area:'10.05'},{id:'u2',area:'20'}]}],nucleos:[{id:'n',memorial:{texto:'anterior'}}],auditoria:[]});
const mudar = (b,id,fn) => { const d=structuredClone(b);fn(d);d.auditoria.unshift({id});return d; };

test('confere unidade pelo ID, campos alterados e precisão, sem exigir posição de array',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{d.processos[0].unidades[0].area='12.3456';});
  const remoto=structuredClone(depois);remoto.processos[0].unidades.reverse();remoto.processos[0].unidades[0].observacao='outro usuário';
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),true);
  remoto.processos[0].unidades.find(u=>u.id==='u1').area='12.34';
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});

test('não aceita projeção sem campo persistido e trata geometrias completas como valores exatos',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].geo={geojson:{type:'Polygon',coordinates:[[[1,2],[3,4],[1,2]],[[2,2],[2,3],[2,2]]]},centro:{lat:2,lng:1}};});
  assert.equal(alteracoesConfirmadas(antes,depois,antes),false);
  const remoto=structuredClone(depois);remoto.nucleos[0].geo.geojson.coordinates.pop();
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
  assert.equal(alteracoesConfirmadas(antes,depois,depois),true);
});

test('considera aliases de registros e aceita defaults acrescentados na leitura',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{d.processos.push({id:'local',nome:'Novo',nucleoId:'n'});});
  const remoto=structuredClone(depois);remoto.processos[1]={...remoto.processos[1],id:'uuid',extra:true};
  assert.equal(alteracoesConfirmadas(antes,depois,remoto,{local:'uuid'}),true);
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});

test('exclusões só são confirmadas quando o campo ou registro não aparece na leitura',()=>{
  const antes=base(),depois=mudar(antes,'a',d=>{delete d.nucleos[0].memorial;d.processos=[];});
  assert.equal(alteracoesConfirmadas(antes,depois,depois),true);
  assert.equal(alteracoesConfirmadas(antes,depois,antes),false);
});

test('Promise espera seu próprio lote e a leitura, sem confirmar edições posteriores',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base();
  const primeira=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='primeira';});
  const segunda=mudar(primeira,'b',d=>{d.processos[0].unidades[1].area='55';});
  let uma=false,duas=false;
  const p1=c.aguardar('a',antes,primeira).then(r=>{uma=true;return r;});
  const p2=c.aguardar('b',primeira,segunda).then(r=>{duas=true;return r;});
  await Promise.resolve();assert.equal(uma,false);assert.equal(duas,false);
  c.confirmar(primeira,primeira,{pedido:'lote1'});await p1;
  assert.equal(uma,true);assert.equal(duas,false);assert.equal(c.tamanho,1);
  c.confirmar(segunda,segunda,{pedido:'lote2'});assert.equal((await p2).confirmado,true);assert.equal(c.tamanho,0);
});

test('recibo com leitura divergente rejeita sem alterar os dados recebidos',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const original=structuredClone(depois),p=c.aguardar('a',antes,depois);
  c.confirmar(depois,antes,{pedido:'gravou'});
  await assert.rejects(p,{code:'LEITURA_DIVERGENTE',rascunhoPreservado:true});
  assert.deepEqual(depois,original);
});

test('timeout, falha de rede e encerramento limpam apenas esperas e preservam snapshots',async()=>{
  let timeout;const c=criarConfirmacoesMutacoes({setTimer:fn=>{timeout=fn;return 1;},clearTimer:()=>{}}),antes=base();
  const depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const p=c.aguardar('a',antes,depois);timeout();await assert.rejects(p,{code:'CONFIRMACAO_TIMEOUT'});
  const p2=c.aguardar('b',antes,depois);c.falhar(erroConfirmacao('Sem rede','SEM_CONEXAO'));await assert.rejects(p2,{code:'SEM_CONEXAO'});
  assert.equal(depois.nucleos[0].memorial.texto,'novo');assert.equal(c.tamanho,0);
});

test('modificar o rascunho depois do registro não muda os valores esperados',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].geo={centro:{lng:1,lat:2}};});
  const esperado=structuredClone(depois),p=c.aguardar('a',antes,depois);depois.nucleos[0].geo.centro.lng=20;
  c.confirmar(esperado,esperado,{});assert.equal((await p).confirmado,true);
});

test('retoma a mesma intenção depois de falha e reconhece confirmação em segundo plano',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const p=c.aguardar('a',antes,depois);c.falhar(erroConfirmacao('rede','SEM_CONEXAO'));await assert.rejects(p);
  c.confirmar(depois,depois,{pedido:'original'});
  assert.equal(c.confirmada('a'),true);
  assert.equal((await c.retentar('a')).recibo.pedido,'original');
  const seguinte=mudar(depois,'b',d=>{d.nucleos[0].memorial.texto='outro';});
  c.confirmar(seguinte,seguinte,{pedido:'posterior'});
  assert.equal((await c.retentar('a')).recibo.pedido,'original','uma intenção já confirmada não muda com edições posteriores');
});

test('retentativas simultâneas aguardam uma só confirmação da intenção',async()=>{
  const c=criarConfirmacoesMutacoes(),antes=base(),depois=mudar(antes,'a',d=>{d.nucleos[0].memorial.texto='novo';});
  const p=c.aguardar('a',antes,depois);c.falhar(erroConfirmacao('rede','SEM_CONEXAO'));await assert.rejects(p);
  const a=c.retentar('a'),b=c.retentar('a');assert.equal(a,b);assert.equal(c.tamanho,1);
  c.confirmar(depois,depois,{});assert.equal((await a).confirmado,true);await b;
});


test('nova meta confirma somente o vínculo ERP canônico atribuído à própria identidade',()=>{
 const antes={metas:[]},depois={metas:[{id:'meta-fixture',erpId:null,titulo:'Meta nova',observacoes:null}]};
 assert.equal(alteracoesConfirmadas(antes,depois,{metas:[{...depois.metas[0],erpId:'meta-fixture'}]}),true);
 assert.equal(alteracoesConfirmadas(antes,depois,{metas:[{...depois.metas[0],erpId:'outra-meta'}]}),false);
 assert.equal(alteracoesConfirmadas(antes,depois,{metas:[{id:'meta-fixture',erpId:'meta-fixture',titulo:'Meta nova'}]}),false);
});

test('confirma histórico com relógio do servidor sem ignorar texto, autor ou ausência',()=>{
 for(const [colecao,filhos] of [['nucleos','historicoEtapas'],['metas','historico'],['metas','comentarios']]){
  const antes={[colecao]:[{id:'pai',[filhos]:[]}]};
  const depois=structuredClone(antes);depois[colecao][0][filhos]=[{id:'novo',texto:'Exato',autor:'Ana',data:'2026-11-10T12:00:00.123Z'}];
  const remoto=structuredClone(depois);remoto[colecao][0][filhos][0].data='2026-11-10T12:00:01.456+00:00';
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),true);
  for(const campo of ['texto','autor','data']){const errado=structuredClone(remoto);errado[colecao][0][filhos][0][campo]='diferente';assert.equal(alteracoesConfirmadas(antes,depois,errado),false);}
  assert.equal(alteracoesConfirmadas(antes,depois,antes),false);
 }
});
test('andamento confirma a coluna date do ERP e preserva conteúdo e autor',()=>{
 const antes={nucleos:[{id:'n',andamentos:[]}]},depois=structuredClone(antes);
 depois.nucleos[0].andamentos=[{id:'a',data:'2026-11-10T12:00:00.123Z',por:'Ana',descricaoCliente:'Aviso exato',visivelIA:true}];
 const remoto=structuredClone(depois);Object.assign(remoto.nucleos[0].andamentos[0],{data:'2026-11-10'});
 assert.equal(alteracoesConfirmadas(antes,depois,remoto),true);
 remoto.nucleos[0].andamentos[0].descricaoCliente='Outro aviso';assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});
test('presença local não bloqueia recibo, mas permissões e cadastro continuam exatos',()=>{
 const antes={usuarios:[{id:'u',online:false,tipoERP:'Consulta'}]},depois=structuredClone(antes);Object.assign(depois.usuarios[0],{online:true,ultimaAtividade:'agora'});
 assert.equal(alteracoesConfirmadas(antes,depois,antes),true);
 depois.usuarios[0].tipoERP='Administrador';assert.equal(alteracoesConfirmadas(antes,depois,antes),false);
});

test('timestamp de etapa aceita o mesmo instante, nunca outra data ou texto',()=>{
 const antes={nucleos:[{id:'n',etapaPrefeituraIniciadaEm:''}]},depois=structuredClone(antes),remoto=structuredClone(antes);
 depois.nucleos[0].etapaPrefeituraIniciadaEm='2026-11-10T12:00:00.123Z';remoto.nucleos[0].etapaPrefeituraIniciadaEm='2026-11-10T09:00:00.123-03:00';
 assert.equal(alteracoesConfirmadas(antes,depois,remoto),true);
 remoto.nucleos[0].etapaPrefeituraIniciadaEm='2026-11-10T12:00:00.124Z';assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
});

test('confirma andamentos pela projeção real e recusa perda de texto ou complemento de autoria',async()=>{
 const {fixture,blank,id}=await import('./fixture.js');
 const {projetar,prepararEdicao}=await import('../src/dados-compartilhados.js');
 const b=fixture(),s=projetar(b,blank()),depois=structuredClone(s.db),autor=s.db.usuarios[0];
 depois.nucleos[0].andamentos=[{id:id(901),status:'Notificações',operacional:'Em andamento',descricaoCliente:'Aviso exato',observacao:'Interno',visivelIA:true,previsao:'',data:'2026-11-10T12:00:00.123Z',por:autor.nome}];
 depois.nucleos[0].observacoes=[{id:id(902),autor:autor.nome,setor:'Diretoria',texto:'Interno',data:'2026-11-10T12:00:00.123Z'}];
 const ops=prepararEdicao(s.db,depois,s,autor);
 for(const op of ops){assert.equal(op.insert,true);(b[op.table]||=[]).push({created_at:'2026-11-10T12:00:01.456+00:00',...op.key,...op.changes});}
 assert.equal(alteracoesConfirmadas(s.db,depois,projetar(b,blank()).db),true);
 b.processos_kanban_andamentos[0].descricao_cliente='Errado';assert.equal(alteracoesConfirmadas(s.db,depois,projetar(b,blank()).db),false);
 b.processos_kanban_andamentos[0].descricao_cliente='Aviso exato';b.integracao_complementos=b.integracao_complementos.filter(x=>x.colecao!=='andamentos');
 assert.equal(alteracoesConfirmadas(s.db,depois,projetar(b,blank()).db),false);
});

for(const colecao of ['municipios','remessas','nucleos'])test(`novo ${colecao}: origem ERP de projeção não prende recibo, mas campos e origem explícita continuam conferidos`,()=>{
 const antes={[colecao]:[]},depois={[colecao]:[{id:'novo',nome:'Cadastro',origem:[],prf:{telefone:'123'}}]},remoto=structuredClone(depois);
 remoto[colecao][0]={...remoto[colecao][0],origem:['ERP'],_compartilhado:true};assert.equal(alteracoesConfirmadas(antes,depois,remoto),true);
 for(const alterar of [r=>r.nome='Outro',r=>r.prf.telefone='999',r=>r.origem=['importado'],r=>delete r._compartilhado,r=>r.id='diferente']){const r=structuredClone(remoto);alterar(r[colecao][0]);assert.equal(alteracoesConfirmadas(antes,depois,r),false);}
 const origemExplicita=structuredClone(depois);origemExplicita[colecao][0].origem=['planilha'];assert.equal(alteracoesConfirmadas(antes,origemExplicita,remoto),false);
 const jaExistia=structuredClone(depois);jaExistia[colecao][0].nome='Antes';assert.equal(alteracoesConfirmadas(jaExistia,depois,remoto),true);
});

test('município, remessa e núcleo novos confirmam pela preparação e projeção reais',async()=>{
 const {fixture,blank,id}=await import('./fixture.js'),{projetar,prepararEdicao}=await import('../src/dados-compartilhados.js');
 for(const colecao of ['municipios','remessas','nucleos']){
  const b=fixture(),s=projetar(b,blank()),depois=structuredClone(s.db),autor=s.db.usuarios[0];
  const novos={municipios:{id:id(950),nome:'Novo Município',uf:'SC',prefixo:'NMO',prf:{telefone:'123'},origem:[],criado:'2026-11-10T12:00:00.000Z'},remessas:{id:id(950),municipioId:id(2),numero:2,titulo:'Segunda remessa',criada:'2026-11-10',origem:[]},nucleos:{id:id(950),municipioId:id(2),remessaId:id(3),nome:'NUI99',codigo:'NUI99',situacao:'Ativo',etapa:0,campos:{},checks:{},analiseMatricula:'Pendente',ambiental:'Pendente',risco:'Em análise',origem:[],externo:{}}};
  depois[colecao].push(novos[colecao]);const ops=prepararEdicao(s.db,depois,s,autor);
  for(const op of ops){assert.equal(op.insert,true);(b[op.table]||=[]).push({created_at:'2026-11-10T12:00:01.456+00:00',...op.key,...op.changes});}
  const remoto=projetar(b,blank()).db;assert.equal(alteracoesConfirmadas(s.db,depois,remoto),true,colecao);
  remoto[colecao].find(r=>r.id===id(950))[colecao==='remessas'?'titulo':'nome']='Divergente';assert.equal(alteracoesConfirmadas(s.db,depois,remoto),false,colecao);
 }
});

test('meta nova confirma histórico e arquivo pelo endereço exato da operação, sem relaxar conteúdo ou autoria',()=>{
 const antes={metas:[]},depois={metas:[{id:'m',erpId:null,titulo:'Meta',historico:[{id:'h',acao:'Criada',autor:'Ana',data:'2026-11-10T12:00:00Z'}],arquivos:[{id:'a',nome:'planta.pdf',tipo:'application/pdf',tamanho:100,chave:'integracao-devolutiva-v1-local',por:'Ana',data:'2026-11-10T12:00:00Z'}]}]};
 const path='owner/metas/m/a-hash',ops=[{table:'meta_arquivos',key:{id:'a'},insert:true,changes:{meta_id:'m',nome:'planta.pdf',mime_type:'application/pdf',tamanho_bytes:100,caminho_storage:path,enviado_por:'owner'}}];
 const remoto=structuredClone(depois),m=remoto.metas[0];m.erpId='m';m.historico[0].data='2026-11-10T12:00:01Z';m.arquivos[0].data='2026-11-10T12:00:02Z';m.arquivos[0].chave='erp-storage|documentos|'+path;
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),true);assert.equal(alteracoesConfirmadas(antes,depois,remoto),false);
 for(const alterar of [m=>m.historico=[],m=>m.historico[0].acao='Outra',m=>m.historico[0].autor='Outra',m=>m.historico[0].data='inválida',m=>m.arquivos=[],m=>m.arquivos[0].chave+='outro-hash',m=>m.arquivos[0].nome='outro.pdf',m=>m.arquivos[0].por='Outro',m=>m.arquivos[0].data='',m=>m.arquivos[0].tamanho=99]){const r=structuredClone(remoto);alterar(r.metas[0]);assert.equal(alteracoesConfirmadas(antes,depois,r,{},ops),false);}
 const errada=structuredClone(ops);errada[0].changes.meta_id='outro';assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},errada),false);
});

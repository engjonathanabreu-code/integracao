// Reprodução C1/C5 (dono da correção: A1). Contratos em docs/correcao-sincronizacao-multiagente.md.
// Testes marcados [GUARDA] protegem comportamento atual e devem passar antes e depois da correção.
import test from 'node:test';
import assert from 'node:assert/strict';
import {processarIntencao} from '../src/fila-intencoes.js';
import {requerRevisaoFila,revisaoDeRecusa,classificarFalha} from '../src/estado-sincronizacao.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {CONTA,uuid,novaFila,enfileirarMeta,erroCom} from './apoio-sync-fila.js';

const MAX=Number.MAX_SAFE_INTEGER;
const semRede=()=>{throw new Error('callback de rede não esperado neste teste');};
const opcoes=extra=>({conta:CONTA,dono:'consumidor-teste',sessaoAtual:()=>true,consultarRecibo:semRede,enviar:semRede,reler:semRede,...extra});
const transitorias=[
 ()=>new TypeError('fetch failed'),
 ()=>erroCom('Erro interno',{status:500}),
 ()=>new DOMException('interrompido','AbortError'),
 ()=>erroCom('Indisponível',{status:503}),
];
const passar=async(fila,extra)=>{try{return await processarIntencao(fila,opcoes(extra));}catch(e){return e;}};

test('C1: falha transitória repetida 12 vezes na preparação nunca agenda MAX_SAFE_INTEGER nem exige revisão',async()=>{
 const {fila,relogio,ler}=novaFila();
 const item=await enfileirarMeta(fila);
 for(let n=0;n<12;n++){
  await passar(fila,{preparar:async()=>{throw transitorias[n%transitorias.length]();}});
  const atual=ler(item.id);
  assert.equal(atual.falhas,n+1,`falha ${n+1} deve ser contada (item foi reservado)`);
  assert.notEqual(atual.proximaTentativa,MAX,`falha transitória ${n+1} levou proximaTentativa a MAX_SAFE_INTEGER`);
  assert.equal(requerRevisaoFila(atual),false,`falha transitória ${n+1} passou a exigir revisão`);
  assert.ok(!atual.estado.startsWith('bloqueado'),`falha ${n+1} bloqueou o item (${atual.estado})`);
  relogio.agora=atual.proximaTentativa+1;
 }
 await fila.fechar();
});

test('C1: TimeoutError (inclusive embrulhado por buscarREST como cause) é falha transitória, não SQLSTATE 23*',()=>{
 // DOMException.code de TimeoutError é 23; hoje vira o código '23' e cai na regra /^(22|23)/ de validação.
 const direto=new DOMException('tempo esgotado','TimeoutError');
 const embrulhado=new Error('A conexão demorou ou foi interrompida.',{cause:new DOMException('tempo esgotado','TimeoutError')});
 assert.equal(classificarFalha(direto).categoria,'transitoria',`TimeoutError direto: ${JSON.stringify(classificarFalha(direto))}`);
 assert.equal(classificarFalha(embrulhado).categoria,'transitoria',`TimeoutError embrulhado: ${JSON.stringify(classificarFalha(embrulhado))}`);
});

test('C1: backoff cresce com falhas antes do envio (tentativas=0) até o teto de ~300000 ms',async()=>{
 const {fila,relogio,ler}=novaFila({aleatorio:()=>1});
 const item=await enfileirarMeta(fila);
 const atrasos=[];
 for(let n=0;n<10;n++){
  const t0=relogio.agora;
  await passar(fila,{preparar:async()=>{throw erroCom('Indisponível',{status:503});}});
  const atual=ler(item.id);
  assert.equal(atual.tentativas,0,'nada foi enviado');
  atrasos.push(atual.proximaTentativa-t0);
  relogio.agora=Math.min(atual.proximaTentativa,t0+10_000_000)+1;
 }
 assert.ok(atrasos[1]>atrasos[0]&&atrasos[3]>atrasos[1],`backoff não cresce antes do envio: ${atrasos.join(', ')}`);
 for(const [i,a] of atrasos.entries())assert.ok(a<=300000,`atraso ${i+1} acima do teto de 300000 ms: ${a}`);
 assert.ok(atrasos.at(-1)>=250000,`atraso após 10 falhas deveria chegar perto do teto: ${atrasos.at(-1)}`);
 await fila.fechar();
});

test('[GUARDA] C1: backoff respeita retryAfterMs informado pelo servidor',async()=>{
 const {fila,relogio,ler}=novaFila({aleatorio:()=>1});
 const item=await enfileirarMeta(fila);const t0=relogio.agora;
 await passar(fila,{preparar:async()=>{throw erroCom('Muitas requisições',{status:429,retryAfterMs:400000});}});
 const atual=ler(item.id);
 assert.ok(atual.proximaTentativa-t0>=400000,`retryAfterMs ignorado: ${atual.proximaTentativa-t0}`);
 assert.equal(requerRevisaoFila(atual),false);
 await fila.fechar();
});

test('[GUARDA] C1: recusa comprovada (400/P0001 e PT409 na fase envio) continua exigindo revisão',async()=>{
 const {fila,ler}=novaFila();
 const casos=[[erroCom('Regra violada',{status:400,code:'P0001'}),'bloqueado_validacao'],[erroCom('Conflito',{status:409,code:'PT409'}),'bloqueado_conflito']];
 for(const [n,[erro,estado]] of casos.entries()){
  const metaId=uuid(10+n),item=await enfileirarMeta(fila,{metaId});
  const r=await passar(fila,{somenteId:item.id,
   preparar:async()=>({operacoes:[{table:'metas',key:{id:metaId},changes:{titulo:'Depois'}}]}),
   enviar:async()=>{throw erro;}});
  assert.equal(r,erro);
  const atual=ler(item.id);
  assert.equal(atual.estado,estado);
  assert.equal(atual.erro.rejeicaoConfirmada,true);
  assert.equal(revisaoDeRecusa(atual),true);
  assert.equal(requerRevisaoFila(atual),true);
 }
 await fila.fechar();
});

test('C1: migração — item antigo transitório com MAX e sem recusa comprovada volta a ser elegível com mesmo id/payload',async()=>{
 const {fila,abrir,relogio,ler,editar}=novaFila();
 const antigo=await enfileirarMeta(fila,{metaId:uuid(20)});
 const recusado=await enfileirarMeta(fila,{metaId:uuid(21)});
 const payload=[{table:'metas',key:{id:uuid(20)},changes:{titulo:'Depois'}}];
 editar(antigo.id,i=>{Object.assign(i,{estado:'resultado_desconhecido',fase:'envio',payload,preparado:{antes:{},depois:{}},enviadoEm:relogio.agora-1000,
  tentativas:5,tentativasTotais:5,falhas:5,proximaTentativa:MAX,erro:{status:503,codigo:'TRANSPORTE',categoria:'transitoria',rejeicaoConfirmada:false,fase:'envio'}});});
 editar(recusado.id,i=>{Object.assign(i,{estado:'bloqueado_validacao',fase:'envio',payload:[{table:'metas',key:{id:uuid(21)},changes:{titulo:'x'}}],preparado:{antes:{},depois:{}},enviadoEm:relogio.agora-1000,
  tentativas:1,tentativasTotais:1,falhas:1,proximaTentativa:MAX,erro:{status:400,codigo:'P0001',categoria:'validacao',rejeicaoConfirmada:true,fase:'envio'}});});
 const recusadoAntes=ler(recusado.id);
 await fila.fechar();
 const reaberta=abrir();
 const reservado=await reaberta.reservar(CONTA,{dono:'consumidor-teste'});
 assert.ok(reservado,'nenhum item elegível após abrir a fila: o item transitório antigo continua preso em MAX_SAFE_INTEGER');
 assert.equal(reservado.id,antigo.id);
 assert.equal(reservado.pedido,antigo.id,'mesma identidade de pedido');
 assert.deepEqual(reservado.payload,payload,'payload preservado');
 assert.equal(reservado.fase,'recibo','item já enviado passa pela consulta de pedido');
 const r=ler(recusado.id);
 assert.equal(r.estado,recusadoAntes.estado);assert.equal(r.proximaTentativa,MAX);assert.deepEqual(r.erro,recusadoAntes.erro);
 await reaberta.fechar();
});

test('C5: diario.retomarTransitorias torna elegível o item transitório agendado e não toca conflito/validação',async()=>{
 const {fila,relogio,ler,editar}=novaFila();
 const t=await enfileirarMeta(fila,{metaId:uuid(30)}),c=await enfileirarMeta(fila,{metaId:uuid(31)}),v=await enfileirarMeta(fila,{metaId:uuid(32)});
 editar(t.id,i=>{Object.assign(i,{estado:'resultado_desconhecido',fase:'preparacao',falhas:3,proximaTentativa:relogio.agora+120000,erro:{status:503,codigo:'TRANSPORTE',categoria:'transitoria',rejeicaoConfirmada:false,fase:'preparacao'}});});
 editar(c.id,i=>{Object.assign(i,{estado:'bloqueado_conflito',fase:'preparacao',falhas:1,proximaTentativa:MAX,erro:{status:409,codigo:'PT409',categoria:'conflito',rejeicaoConfirmada:true,fase:'preparacao'}});});
 editar(v.id,i=>{Object.assign(i,{estado:'bloqueado_validacao',fase:'preparacao',falhas:1,proximaTentativa:MAX,erro:{status:400,codigo:'P0001',categoria:'validacao',rejeicaoConfirmada:true,fase:'preparacao'}});});
 const antesC=ler(c.id),antesV=ler(v.id);
 const diario=criarDiarioCompartilhado({conta:CONTA,ativo:()=>true,carregar:semRede,preparar:semRede,enviar:semRede,consultarRecibo:semRede,confirmar:semRede,atualizou:()=>{},fila});
 try{
  assert.equal(typeof diario.retomarTransitorias,'function','C5 ausente: diario.retomarTransitorias não existe');
  await diario.retomarTransitorias('online');
  assert.ok(ler(t.id).proximaTentativa<=relogio.agora,'item transitório continua agendado no futuro');
  for(const [id,antes] of [[c.id,antesC],[v.id,antesV]]){
   const depois=ler(id);
   assert.equal(depois.estado,antes.estado);assert.equal(depois.proximaTentativa,antes.proximaTentativa);assert.deepEqual(depois.erro,antes.erro);
  }
 }finally{diario.fechar();}
});

async function acharMotivoEspera(){
 const mods=await Promise.all(['../src/estado-sincronizacao.js','../src/fila-intencoes.js','../src/diario-compartilhado.js'].map(m=>import(m)));
 return mods.map(m=>m.motivoEspera).find(f=>typeof f==='function');
}

test('C5: motivoEspera devolve a dependência travada e a causa raiz',async()=>{
 const motivoEspera=await acharMotivoEspera();
 assert.equal(typeof motivoEspera,'function','C5 ausente: motivoEspera não é exportada por estado-sincronizacao/fila-intencoes/diario-compartilhado');
 const travado={id:'a',ordem:1,estado:'bloqueado_validacao',dependencias:[],proximaTentativa:MAX,erro:{status:400,codigo:'P0001',categoria:'validacao',rejeicaoConfirmada:true},original:{unidade:'u1',dependencias:[]}};
 const meio={id:'b',ordem:2,estado:'pendente_local',dependencias:['a'],proximaTentativa:0,original:{unidade:'u2',dependencias:['a']}};
 const fim={id:'c',ordem:3,estado:'pendente_local',dependencias:['b'],proximaTentativa:0,original:{unidade:'u3',dependencias:['b']}};
 const items=[travado,meio,fim];
 const m=motivoEspera(meio,items);
 assert.ok(m,'item cujo pré-requisito está travado deveria informar o motivo da espera');
 assert.equal(m.tipo,'dependencia');assert.equal(m.itemId,'a');
 assert.deepEqual({estado:m.causaRaiz?.estado,categoria:m.causaRaiz?.categoria,codigo:m.causaRaiz?.codigo},{estado:'bloqueado_validacao',categoria:'validacao',codigo:'P0001'});
 const transitivo=motivoEspera(fim,items);
 assert.equal(transitivo?.tipo,'dependencia');
 assert.equal(transitivo.causaRaiz?.estado,'bloqueado_validacao','causa raiz transitiva deve apontar o item travado na origem');
});

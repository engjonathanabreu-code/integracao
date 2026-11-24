// Fase B: ligação das regras versionadas na fila e no diário (24/11/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import {novaFila,enfileirarMeta,CONTA,uuid,erroCom} from './apoio-sync-fila.js';
import {processarIntencao} from '../src/fila-intencoes.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {VERSAO_REGRAS_CONFIRMACAO} from '../src/estado-sincronizacao.js';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';

const MAX=Number.MAX_SAFE_INTEGER;
const divergente=(i,extra={})=>Object.assign(i,{estado:'confirmado_aguardando_leitura',fase:'releitura',recibo:{aliases:{}},payload:[{table:'metas',key:{id:uuid(1)},changes:{titulo:'Depois'}}],
 preparado:{antes:{metas:[]},depois:{metas:[]}},tentativas:5,falhas:5,proximaTentativa:MAX,enviadoEm:1,confirmadoEm:2,
 erro:{status:409,codigo:'LEITURA_DIVERGENTE',categoria:'leitura',rejeicaoConfirmada:false,fase:'releitura'}},extra);
const sessao={conta:CONTA,dono:'d',sessaoAtual:()=>true,travas:null};

test('B1: marcador gasto na versão anterior ganha uma única releitura, sem reenvio; nova divergência volta à revisão',async()=>{
 const {fila,editar,ler}=novaFila(),it=await enfileirarMeta(fila);
 await editar(it.id,i=>divergente(i,{releituraDivergenteVerificada:true}));
 assert.equal(await fila.reabrirReleiturasTemporarias(CONTA),1);
 assert.equal((await ler(it.id)).releituraRegrasVersao,VERSAO_REGRAS_CONFIRMACAO);
 let envios=0,leituras=0;
 await assert.rejects(()=>processarIntencao(fila,{...sessao,preparar:async()=>assert.fail('não prepara'),enviar:async()=>{envios++;},consultarRecibo:async()=>({aliases:{}}),
  reler:async()=>{leituras++;throw erroCom('diverge',{code:'LEITURA_DIVERGENTE',status:409});}}),{code:'LEITURA_DIVERGENTE'});
 assert.deepEqual([envios,leituras],[0,1]);
 const d=await ler(it.id);
 assert.deepEqual([d.estado,d.proximaTentativa,d.pedido,d.payload.length],['confirmado_aguardando_leitura',MAX,it.id,1]);
 assert.equal(await fila.reabrirReleiturasTemporarias(CONTA),0,'uma vez por versão');
 assert.equal(await fila.reservar(CONTA,{dono:'d'}),null);
});
test('B1: a releitura que agora confere confirma com o mesmo recibo',async()=>{
 const {fila,editar,ler}=novaFila(),it=await enfileirarMeta(fila);
 await editar(it.id,i=>divergente(i,{releituraDivergenteVerificada:true}));
 await fila.reabrirReleiturasTemporarias(CONTA);
 const r=await processarIntencao(fila,{...sessao,enviar:async()=>assert.fail('não reenvia'),consultarRecibo:async()=>({aliases:{}}),reler:async()=>{}});
 assert.equal(r.estado,'confirmado');assert.deepEqual((await ler(it.id)).recibo,{aliases:{}});
});

const conflito=(i,extra={})=>Object.assign(i,{estado:'bloqueado_conflito',fase:'preparacao',falhas:1,falhouEm:1,proximaTentativa:5000,
 erro:{status:409,codigo:'PT409',categoria:'conflito',rejeicaoConfirmada:true,fase:'preparacao'}},extra);
test('B2: conflito anterior ao envio é preparado uma vez por versão; se persistir volta à revisão sem laço',async()=>{
 const {fila:f0,abrir,editar,ler}=novaFila(),it=await enfileirarMeta(f0),dep=await enfileirarMeta(f0);
 await editar(it.id,i=>conflito(i));await f0.fechar();
 let fila=abrir();await fila.listar(CONTA);
 let d=await ler(it.id);
 assert.deepEqual([d.estado,d.conflitoRegrasVersao,d.id,d.pedido],['pendente_local',VERSAO_REGRAS_CONFIRMACAO,it.id,it.id]);
 let preparos=0;
 await assert.rejects(()=>processarIntencao(fila,{...sessao,preparar:async()=>{preparos++;throw erroCom('conflito',{code:'PT409',status:409});},enviar:async()=>assert.fail('não envia')}),{code:'PT409'});
 d=await ler(it.id);
 assert.deepEqual([d.estado,d.payload,d.enviadoEm,preparos],['bloqueado_conflito',undefined,undefined,1]);
 assert.equal(await fila.reservar(CONTA,{dono:'d'}),null,'o dependente continua aguardando');
 await fila.fechar();fila=abrir();await fila.listar(CONTA);
 assert.equal((await ler(it.id)).estado,'bloqueado_conflito','nova abertura não rearma de novo');
 assert.equal((await ler(dep.id)).estado,'pendente_local');
});
test('B2: conflito resolvido pelas novas regras segue o envio normal com a mesma identidade e libera o dependente',async()=>{
 const {fila:f0,abrir,editar,ler}=novaFila(),it=await enfileirarMeta(f0),dep=await enfileirarMeta(f0);
 await editar(it.id,i=>conflito(i));await f0.fechar();
 const fila=abrir();await fila.listar(CONTA);const pedidos=[];
 const opcoes={...sessao,preparar:async()=>({operacoes:[{table:'metas',key:{id:uuid(1)},changes:{titulo:'Depois'}}],antes:{},depois:{}}),consultarRecibo:async()=>null,
  enviar:async item=>{pedidos.push(item.pedido);return {aliases:{}};},reler:async()=>{}};
 assert.equal((await processarIntencao(fila,opcoes)).estado,'confirmado');
 assert.equal((await processarIntencao(fila,opcoes)).id,dep.id);
 assert.deepEqual(pedidos,[it.id,dep.id]);
});
test('B2: PT409 já enviado, com payload, recibo ou reserva ativa nunca é rearmado',async()=>{
 for(const extra of [{erro:{status:409,codigo:'PT409',categoria:'conflito',rejeicaoConfirmada:true,fase:'envio'},payload:[{table:'metas'}],enviadoEm:1},{payload:[{table:'metas'}]},{enviadoEm:1},{recibo:{aliases:{}}},{leaseAte:9e15},{conflitoRegrasVersao:VERSAO_REGRAS_CONFIRMACAO}]){
  const {fila:f0,abrir,editar,ler}=novaFila(),it=await enfileirarMeta(f0);
  await editar(it.id,i=>conflito(i,extra));await f0.fechar();
  const fila=abrir();await fila.listar(CONTA);
  assert.equal((await ler(it.id)).estado,'bloqueado_conflito',JSON.stringify(extra));
 }
});

// B3 ------------------------------------------------------------------------
function diarioCom(base,fila,contador){
 return criarDiarioCompartilhado({conta:CONTA,ativo:()=>true,fila,atualizou(){},estadoSessao:()=>'valida',
  carregar:async()=>projetar(structuredClone(base),blank()),
  preparar:async(st,dep)=>({operacoes:prepararEdicao(st.db,dep,st,st.db.usuarios[0]),sent:{},identicos:{}}),
  enviar:async()=>{contador.envios++;return {aliases:{}};},consultarRecibo:async()=>null,confirmar:async()=>{}});
}
const baseMorador=bairro=>{const b=fixture();b.integracao_moradores=[{colecao:'processos',registro_id:id(4),dados:{nucleoId:'',endereco:{bairro}},criado_por:id(1),referencia_tabela:'fin_receb_clientes',referencia_id:id(4)}];return b;};
test('B3: valor já presente no servidor encerra a intenção como dispensada, sem envio e sem recibo',async()=>{
 const antes=projetar(baseMorador(''),blank()).db,depois=structuredClone(antes);depois.processos[0].endereco.bairro='Centro';
 const {fila}=novaFila(),c={envios:0},d=diarioCom(baseMorador('Centro'),fila,c);
 const item=await d.adicionar(antes,depois),f=(await d.executar()).find(i=>i.id===item.id);
 assert.deepEqual([f.estado,f.decisao.tipo,f.recibo,f.payload,c.envios],['dispensado','ja_presente_no_servidor',undefined,undefined,0]);
 d.fechar();
});
test('B3: valor diferente no servidor continua em revisão (conflito) e edição ainda necessária é enviada',async()=>{
 const antes=projetar(baseMorador(''),blank()).db,depois=structuredClone(antes);depois.processos[0].endereco.bairro='Centro';
 let {fila}=novaFila(),c={envios:0},d=diarioCom(baseMorador('Outro'),fila,c);
 let item=await d.adicionar(antes,depois),f=(await d.executar()).find(i=>i.id===item.id);
 assert.deepEqual([f.estado,f.erro.codigo,c.envios],['bloqueado_conflito','PT409',0]);d.fechar();
 ({fila}=novaFila());c={envios:0};d=diarioCom(baseMorador(''),fila,c);
 item=await d.adicionar(antes,depois);f=(await d.executar()).find(i=>i.id===item.id);
 assert.deepEqual([f.estado,c.envios],['confirmado',1]);d.fechar();
});
test('B3: sem operações e com diferença estrita em relação ao servidor continua INTENCAO_SEM_OPERACOES',async()=>{
 const base=baseMorador('Centro'),antes=projetar(base,blank()).db,depois=structuredClone(antes);depois.processos[0].endereco.bairro='Vila';
 const {fila}=novaFila(),c={envios:0};
 const d=criarDiarioCompartilhado({conta:CONTA,ativo:()=>true,fila,atualizou(){},estadoSessao:()=>'valida',carregar:async()=>projetar(structuredClone(base),blank()),
  preparar:async()=>({operacoes:[],sent:{},identicos:{}}),enviar:async()=>{c.envios++;},consultarRecibo:async()=>null,confirmar:async()=>{}});
 const item=await d.adicionar(antes,depois),f=(await d.executar()).find(i=>i.id===item.id);
 assert.deepEqual([f.estado,f.erro.codigo,c.envios],['bloqueado_validacao','INTENCAO_SEM_OPERACOES',0]);d.fechar();
});
test('B3: login antigo parado como INTENCAO_SEM_OPERACOES é reavaliado uma vez e dispensado como somente local',async()=>{
 const base=fixture();base.profiles=[{id:id(1),nome:'Eu',tipo:'Projetos',setor:null,ativo:true,email:'eu@example.invalid'}];
 const antes=projetar(base,blank()).db,u=antes.usuarios[0];
 const edicao={colecao:'usuarios',id:u.id,antes:{existe:true,valor:u},depois:{existe:true,valor:{...u,setorERP:'',online:true,ultimaAtividade:'2026-11-24T12:00:00.000Z'}}};
 const {fila:f0,abrir,editar,ler}=novaFila();
 const it=await f0.enfileirar({conta:CONTA,unidade:JSON.stringify(['usuarios',u.id]),recursos:[JSON.stringify(['usuarios',u.id])],modulo:'usuarios',operacoes:[],preparar:true,base:{},intencao:{edicoes:[edicao],arquivos:{}}});
 await editar(it.id,i=>Object.assign(i,{estado:'bloqueado_validacao',fase:'preparacao',falhas:1,proximaTentativa:MAX,erro:{status:null,codigo:'INTENCAO_SEM_OPERACOES',categoria:'validacao',rejeicaoConfirmada:false,fase:'preparacao'}}));
 await f0.fechar();const fila=abrir();
 assert.equal(await fila.reservar(CONTA,{dono:'d'}),null,'nada a preparar ou enviar');
 const d=await ler(it.id);
 assert.deepEqual([d.estado,d.decisao.tipo,d.semOperacoesVerificada],['dispensado','somente_presenca_ou_acesso_local',true]);
});

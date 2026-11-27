import test from 'node:test';
import assert from 'node:assert/strict';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';
import {CONTA,novaFila} from './apoio-sync-fila.js';
import {podeRetomarVinculo} from '../src/retomada-vinculo-ficha.js';

const reg=id(44),can=id(4),anterior=id(45);
const erro={codigo:'CLIENTE_SEM_VINCULO_CANONICO',fase:'preparacao',status:422,categoria:'validacao',rejeicaoConfirmada:true};
function servidor({bairro='Base',valido=true,ambiguo=false}={}){
 const b=fixture();
 b.integracao_moradores=[{colecao:'processos',registro_id:reg,referencia_tabela:valido?'fin_receb_clientes':null,referencia_id:valido?can:null,criado_por:id(1),dados:{endereco:{bairro}}}];
 if(ambiguo)b.integracao_moradores.push({...b.integracao_moradores[0],registro_id:id(46)});
 return b;
}
function processo(base,alteracao){
 const antes=projetar(base,blank()).db;
 const f=antes.processos.find(p=>p.id===reg);f.financeiroRef=anterior;
 const depois=structuredClone(antes);depois.processos.find(p=>p.id===reg).endereco.bairro=alteracao;
 return [antes,depois];
}
function criar(base,fila,c){
 return criarDiarioCompartilhado({conta:CONTA,ativo:()=>true,estadoSessao:()=>'valida',fila,atualizou(){},
  carregar:async()=>{c.leituras++;return projetar(structuredClone(base),blank());},
  preparar:async(st,dep)=>({operacoes:prepararEdicao(st.db,dep,st,st.db.usuarios[0]),sent:{},identicos:{}}),
  enviar:async(ops,pedido)=>{
   c.envios.push(pedido);assert.equal(ops.length,1);const [op]=ops;
   assert.equal(op.table,'integracao_moradores');assert.equal(op.key.registro_id,reg);assert.equal(op.insert,undefined);
   assert.equal(op.changes.referencia_id,undefined);assert.deepEqual(op.expected.dados,base.integracao_moradores[0].dados);
   if(c.envios.length===1)assert.deepEqual([op.expected.referencia_tabela,op.expected.referencia_id],['fin_receb_clientes',can]);
   base.integracao_moradores[0].dados=structuredClone(op.changes.dados);
   return {aliases:{}};
  },
  consultarRecibo:async()=>assert.fail('pedido nunca enviado não depende de recibo antigo'),
  confirmar:async(item,remoto)=>{c.confirmacoes++;assert.equal(remoto.db.processos.find(p=>p.id===reg).endereco.bairro,item.preparado.depois.processos[0].endereco.bairro);}
 });
}
const bloquear=(editar,item,extra={})=>editar(item.id,i=>Object.assign(i,{estado:'bloqueado_validacao',fase:'preparacao',proximaTentativa:Number.MAX_SAFE_INTEGER,erro,...extra}));
const cont=()=>({leituras:0,envios:[],confirmacoes:0});

test('bloqueio antigo é retomado na sessão normal; dependente espera confirmação real e só então grava',async()=>{
 const {fila,editar,ler}=novaFila(),base=servidor(),c=cont(),d=criar(base,fila,c);
 try{
  const [a,b]=processo(base,'Primeiro'),z=structuredClone(b);z.processos.find(p=>p.id===reg).endereco.bairro='Segundo';
  const it=await d.adicionar(a,b);await bloquear(editar,it);
  const dep=await d.adicionar(b,z);
  const antes=(await ler(it.id)).original;
  await d.executar();
  assert.deepEqual(c.envios,[it.id,dep.id]);
  assert.equal(c.confirmacoes,2);
  assert.equal(base.integracao_moradores[0].dados.endereco.bairro,'Segundo');
  assert.equal((await ler(it.id)).estado,'confirmado');
  assert.equal((await ler(dep.id)).estado,'confirmado');
  assert.deepEqual((await ler(it.id)).original,antes);
  assert.equal((await ler(it.id)).checksum,it.checksum);
  await d.executar();assert.deepEqual(c.envios,[it.id,dep.id]);
 }finally{d.fechar();}
});

test('se o valor já estiver na ficha, dispensa sem envio e sem fabricar recibo',async()=>{
 const {fila,editar,ler}=novaFila(),base=servidor({bairro:'Local'}),c=cont(),d=criar(base,fila,c);
 try{
  const it=await d.adicionar(...processo(servidor(),'Local'));await bloquear(editar,it);
  await d.executar();const atual=await ler(it.id);
  assert.equal(atual.estado,'dispensado');assert.equal(atual.decisao.tipo,'ja_presente_no_servidor');assert.equal(atual.recibo,undefined);assert.equal(c.envios.length,0);
 }finally{d.fechar();}
});

test('vínculo não comprovado, duplicado ou valor concorrente preservam original e não escrevem',async()=>{
 for(const [base,codigo] of [[servidor({valido:false}),'CLIENTE_SEM_VINCULO_CANONICO'],[servidor({ambiguo:true}),'CLIENTE_SEM_VINCULO_CANONICO'],[servidor({bairro:'Outra edição'}),'PT409']]){
  const {fila,editar,ler}=novaFila(),c=cont(),d=criar(base,fila,c);
  try{
   const it=await d.adicionar(...processo(servidor(),'Local'));await bloquear(editar,it);
   await d.executar();await d.executar();const atual=await ler(it.id);
   assert.equal(atual.erro.codigo,codigo);assert.equal(c.leituras,1);assert.equal(c.envios.length,0);
   assert.deepEqual(atual.original,it.original);assert.equal(atual.checksum,it.checksum);
  }finally{d.fechar();}
 }
});

test('não rearma tentativa iniciada, criação, anexos, mudança de vínculo ou outro tipo de falha',async()=>{
 const {fila,editar,ler}=novaFila(),base=servidor(),c=cont(),d=criar(base,fila,c);
 try{
  const it=await d.adicionar(...processo(base,'Local'));await bloquear(editar,it);
  const item=await ler(it.id);assert.equal(podeRetomarVinculo(item),true);
  for(const campos of [{enviadoEm:1},{tentativas:1},{payload:[]},{recibo:{}},{preparado:{}},
   {fase:'envio'},{vinculoCanonicoReavaliado:true},{erro:{...erro,codigo:'P0001'}}]){
   assert.equal(podeRetomarVinculo({...item,...campos}),false);
  }
  const mudar=fn=>{const x=structuredClone(item);fn(x.original.intencao);return x;};
  assert.equal(podeRetomarVinculo(mudar(o=>o.edicoes[0].antes={existe:false})),false);
  assert.equal(podeRetomarVinculo(mudar(o=>o.arquivos.arquivo={})),false);
  assert.equal(podeRetomarVinculo(mudar(o=>o.edicoes[0].depois.valor.financeiroRef=can)),false);
  await editar(it.id,i=>i.leaseAte=9e15);await d.executar();assert.equal(c.leituras,0);
 }finally{d.fechar();}
});


test('não grava linha financeira pela recuperação automática de complemento',async()=>{
 const {fila,editar,ler}=novaFila(),base=servidor(),c=cont(),d=criar(base,fila,c);
 try{
  const a=projetar(base,blank()).db,b=structuredClone(a);
  b.processos.find(p=>p.id===reg).requerente.nome='Outro nome';
  const it=await d.adicionar(a,b);await bloquear(editar,it);await d.executar();
  assert.equal((await ler(it.id)).estado,'bloqueado_validacao');
  assert.deepEqual(c.envios,[]);
 }finally{d.fechar();}
});

test('conflito de vínculo no envio não cai na conciliação genérica e não libera o dependente',async()=>{
 const {fila,editar,ler}=novaFila(),base=servidor();
 let envios=0,consultas=0,confirmacoes=0;
 const d=criarDiarioCompartilhado({conta:CONTA,ativo:()=>true,estadoSessao:()=>'valida',fila,atualizou(){},
  carregar:async()=>projetar(structuredClone(base),blank()),
  preparar:async(st,dep)=>({operacoes:prepararEdicao(st.db,dep,st,st.db.usuarios[0]),sent:{},identicos:{}}),
  enviar:async()=>{envios++;throw Object.assign(Error('vínculo mudou'),{status:409,code:'PT409'});},
  consultarRecibo:async()=>{consultas++;return null;},confirmar:async()=>{confirmacoes++;}
 });
 try{
  const [a,b]=processo(base,'Primeiro'),z=structuredClone(b);z.processos.find(p=>p.id===reg).endereco.bairro='Segundo';
  const it=await d.adicionar(a,b);await bloquear(editar,it);
  const dep=await d.adicionar(b,z);
  await d.executar();await d.executar();
  assert.deepEqual([envios,consultas,confirmacoes],[1,0,0]);
  assert.equal((await ler(it.id)).estado,'bloqueado_conflito');
  assert.equal((await ler(dep.id)).estado,'pendente_local');
 }finally{d.fechar();}
});

// Reprodução C4 (dono da correção: A4): comparação de confirmação e visibilidade da edição.
import test from 'node:test';
import assert from 'node:assert/strict';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
import {igualSemantico} from '../src/igualdade-semantica.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {uuid} from './apoio-sync-fila.js';

const P=uuid(1),E=uuid(2),U1='erp_'+uuid(11),U2='erp_'+uuid(12);
const semRede=()=>{throw new Error('callback de rede não esperado neste teste');};

// Projeção real (dados-compartilhados.js, planos → etapas): responsaveis vem de
// etapa_responsaveis lido com order=etapa_id,usuario_id, ou seja, ordenado por usuário,
// e não na ordem em que a pessoa marcou no formulário.
test('C4: responsáveis de ETAPA de plano lidos do servidor em outra ordem confirmam a gravação',()=>{
 const antes={planos:[{id:P,titulo:'Plano',etapas:[{id:E,titulo:'Etapa',responsaveis:[U1]}]}],auditoria:[]};
 const depois=structuredClone(antes);depois.planos[0].etapas[0].responsaveis=[U2,U1];depois.auditoria=[{id:'op'}];
 const remoto=structuredClone(depois);remoto.planos[0].etapas[0].responsaveis=[U1,U2];
 assert.equal(alteracoesConfirmadas(antes,depois,remoto),true,'caminho planos[].etapas[].responsaveis diverge só pela ordem');
 // A mesma regra vale para etapa nova (inserção parcial).
 const semEtapa={planos:[{id:P,titulo:'Plano',etapas:[]}],auditoria:[]};
 const nova=structuredClone(semEtapa);nova.planos[0].etapas=[{id:E,titulo:'Etapa',responsaveis:[U2,U1]}];
 const remotoNova=structuredClone(nova);remotoNova.planos[0].etapas[0].responsaveis=[U1,U2];
 assert.equal(alteracoesConfirmadas(semEtapa,nova,remotoNova),true,'etapa nova com responsáveis em outra ordem diverge');
});

test('[GUARDA] C4: responsáveis de etapa com membro faltando ou extra continuam divergentes',()=>{
 const antes={planos:[{id:P,etapas:[{id:E,responsaveis:[U1]}]}],auditoria:[]};
 const depois=structuredClone(antes);depois.planos[0].etapas[0].responsaveis=[U1,U2];
 for(const lido of [[U1],[U2],[U1,U2,'erp_'+uuid(13)]]){
  const remoto=structuredClone(depois);remoto.planos[0].etapas[0].responsaveis=lido;
  assert.equal(alteracoesConfirmadas(antes,depois,remoto),false,JSON.stringify(lido));
 }
});

test('[GUARDA] C4: igualSemantico permanece estrita (ordem, null/"" e número/texto)',()=>{
 assert.equal(igualSemantico(['a','b'],['b','a']),false);
 assert.equal(igualSemantico(null,''),false);
 assert.equal(igualSemantico(undefined,null),false);
 assert.equal(igualSemantico(1,'1'),false);
 assert.equal(igualSemantico({a:1,b:[1,2]},{b:[1,2],a:1}),true);
});

test('C4: item com recibo e LEITURA_DIVERGENTE continua com a edição visível em diario.materializar',async()=>{
 const item={conta:'c',id:'pedido-1',ordem:1,estado:'confirmado_aguardando_leitura',recibo:{aliases:{}},payload:[{table:'metas'}],
  erro:{codigo:'LEITURA_DIVERGENTE',categoria:'leitura',fase:'releitura'},tentativas:1,
  original:{unidade:'u',modulo:'metas',intencao:{arquivos:{},edicoes:[{colecao:'metas',id:'m1',antes:{existe:true,valor:{id:'m1',titulo:'Antes'}},depois:{existe:true,valor:{id:'m1',titulo:'Depois'}}}]}}};
 const fila={listar:async()=>[structuredClone(item)],fechar:async()=>{}};
 const diario=criarDiarioCompartilhado({conta:'c',ativo:()=>true,carregar:semRede,preparar:semRede,enviar:semRede,consultarRecibo:semRede,confirmar:semRede,atualizou:()=>{},fila});
 try{
  await diario.atualizar();
  const db=diario.materializar({metas:[{id:'m1',titulo:'Antes'}]});
  assert.equal(db.metas[0].titulo,'Depois','a edição com recibo some da tela enquanto aguarda releitura divergente');
 }finally{diario.fechar();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {falhaPreparacaoSemEnvio,orientacaoPendencia,podeVerificarPreparacaoAoReconectar,ciclosBackoffIntencao} from '../src/estado-sincronizacao.js';
const base=()=>({estado:'resultado_desconhecido',fase:'preparacao',tentativas:0,tentativasTotais:0,erro:{fase:'preparacao',categoria:'transitoria',codigo:'TRANSPORTE',status:503,rejeicaoConfirmada:false},original:{preparar:true,operacoes:[]}});
test('só mostra falha antes do envio quando a fase inteira é comprovada',()=>{
 const i=base(), antes=structuredClone(i);
 assert.equal(falhaPreparacaoSemEnvio(i),true);
 assert.match(orientacaoPendencia(i),/falhou antes de enviar/);
 assert.deepEqual(i,antes);
 for(const alterar of [x=>{x.fase='envio'},x=>{x.erro.fase='envio'},x=>{delete x.erro.fase},x=>{x.enviadoEm=0},x=>{x.tentativas=1},x=>{x.tentativasTotais=1},x=>{delete x.tentativasTotais},x=>{x.payload=[]},x=>{x.preparado={}},x=>{x.recibo={aliases:{}}},x=>{x.confirmadoEm=0},x=>{x.lidoEm=0},x=>{x.original.legado={}},x=>{x.original.operacoes=[{}]},x=>{x.erro.rejeicaoConfirmada=true},x=>{x.erro.status=429}]){
  const x=base();alterar(x);assert.equal(falhaPreparacaoSemEnvio(x),false);assert.doesNotMatch(orientacaoPendencia(x),/falhou antes de enviar/);
 }
});

test('uma reconexão reabre só uma preparação esgotada e nunca um envio incerto',()=>{
 const i={...base(),proximaTentativa:Number.MAX_SAFE_INTEGER};
 i.original.modulo='processos';i.original.intencao={edicoes:[{colecao:'auditoria',id:'a',antes:{existe:false},depois:{existe:true,valor:{id:'a',acao:'Cadastro alterado'}}}]};
 assert.equal(podeVerificarPreparacaoAoReconectar(i,100),true);
 for(const v of [{verificadaAoReconectar:true},{leaseAte:101},{enviadoEm:30},{proximaTentativa:110},{payload:[]},{tentativasTotais:1}]){
  assert.equal(podeVerificarPreparacaoAoReconectar({...i,...v},100),false);
 }
});

test('aumenta o intervalo só para a preparação de Cadastro alterado, não para Metas',()=>{
 const i={...base(),falhas:4};
 i.original.modulo='metas';
 assert.equal(ciclosBackoffIntencao(i),0);
 i.original.modulo='processos';
 assert.equal(ciclosBackoffIntencao(i),0);
 i.original.intencao={edicoes:[{colecao:'auditoria',id:'a',antes:{existe:false},depois:{existe:true,valor:{id:'a',acao:'Cadastro alterado'}}}]};
 assert.equal(ciclosBackoffIntencao(i),4);
 i.fase='envio';i.tentativas=2;
 assert.equal(ciclosBackoffIntencao(i),2);
});

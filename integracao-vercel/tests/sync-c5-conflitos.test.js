// Reprodução C4 (regra de conjunto na conciliação de três versões) e categoria registro_indisponivel (C1).
// Dono da correção: A4 (concorrencia.js, intencoes-edicao.js); classificação em estado-sincronizacao.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {conciliarEdicoes} from '../src/concorrencia.js';
import {aplicarIntencao} from '../src/intencoes-edicao.js';
import {classificarFalha} from '../src/estado-sincronizacao.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {CONTA,uuid,novaFila,erroCom} from './apoio-sync-fila.js';

const A='erp_'+uuid(1),B='erp_'+uuid(2),C='erp_'+uuid(3),X='erp_'+uuid(4);
const M=uuid(50);
const conjunto=xs=>[...xs].sort();
const semRede=()=>{throw new Error('callback de rede não esperado neste teste');};

test('C4/C5: responsáveis da meta com alterações compatíveis (local +A, remoto +B) fazem merge de conjunto sem conflito',()=>{
 const base={id:M,titulo:'Meta',responsaveis:[X]};
 const local={...base,responsaveis:[X,A]},remoto={...base,responsaveis:[X,B]};
 const r=aplicarIntencao({metas:[remoto]},[{colecao:'metas',id:M,antes:{existe:true,valor:base},depois:{existe:true,valor:local}}]);
 assert.deepEqual(r.conflitos.map(c=>c.chave),[],'adição compatível em lista de ids gerou conflito');
 assert.deepEqual(conjunto(r.dados.metas[0].responsaveis),conjunto([X,A,B]));
});

test('C4/C5: participantes do evento com remoção local e adição remota fazem merge de conjunto',()=>{
 const r=conciliarEdicoes({participantes:[A,X]},{participantes:[A]},{participantes:[A,X,B]});
 assert.deepEqual(r.conflitos,[],'remoção local + adição remota em lista de ids gerou conflito');
 assert.deepEqual(conjunto(r.dados.participantes),conjunto([A,B]));
});

test('C4/C5: mesma lista em outra ordem no remoto não gera conflito',()=>{
 const base={id:M,responsaveis:[A,B]},local={id:M,responsaveis:[A,B,C]},remoto={id:M,responsaveis:[B,A]};
 const r=conciliarEdicoes(base,local,remoto);
 assert.deepEqual(r.conflitos,[],'remoto só reordenou a lista e gerou conflito');
 assert.deepEqual(conjunto(r.dados.responsaveis),conjunto([A,B,C]));
});

test('[GUARDA] C5: texto alterado de forma diferente nos dois lados continua em conflito',()=>{
 const r=conciliarEdicoes({titulo:'a'},{titulo:'b'},{titulo:'c'});
 assert.equal(r.conflitos.length,1);
});

// Cadeia real: a 1ª edição já tem recibo mas a releitura divergiu; materializar a esconde
// (diario-compartilhado.js:32), então a 2ª edição do mesmo usuário é capturada com `antes`
// igual ao valor antigo. Quando o servidor mostra a 1ª edição, a 2ª vira PT409 contra si mesma.
const edicaoTitulo=(de,para)=>({colecao:'metas',id:M,antes:{existe:true,valor:{id:M,titulo:de}},depois:{existe:true,valor:{id:M,titulo:para}}});
async function segundaEdicao(prepararPrimeira){
 const {fila,editar}=novaFila();
 const primeira=await fila.enfileirar({conta:CONTA,id:'pedido-1',unidade:JSON.stringify(['metas',M]),recursos:[JSON.stringify(['metas',M])],modulo:'metas',operacoes:[],preparar:true,base:{},intencao:{edicoes:[edicaoTitulo('A','B')],arquivos:{}}});
 editar(primeira.id,prepararPrimeira);
 const diario=criarDiarioCompartilhado({conta:CONTA,ativo:()=>true,carregar:semRede,preparar:semRede,enviar:semRede,consultarRecibo:semRede,confirmar:semRede,atualizou:()=>{},fila});
 try{
  await diario.atualizar();
  const tela=diario.materializar({metas:[{id:M,titulo:'A'}]});
  const editado=structuredClone(tela);editado.metas[0].titulo='C';
  const segunda=await diario.adicionar(tela,editado);
  // Servidor já contém a 1ª edição do mesmo usuário.
  return aplicarIntencao({metas:[{id:M,titulo:'B'}]},segunda.original.intencao.edicoes);
 }finally{diario.fechar();}
}

test('[GUARDA] C5: segunda edição do mesmo campo com a 1ª ainda pendente não conflita',async()=>{
 const r=await segundaEdicao(()=>{});
 assert.deepEqual(r.conflitos,[]);assert.equal(r.dados.metas[0].titulo,'C');
});

test('C5: segunda edição do mesmo campo após recibo da 1ª (releitura divergente) não conflita',async()=>{
 const r=await segundaEdicao(i=>{Object.assign(i,{estado:'confirmado_aguardando_leitura',fase:'releitura',payload:[{table:'metas',key:{id:M},changes:{titulo:'B'}}],preparado:{antes:{},depois:{}},
  recibo:{aliases:{}},tentativas:1,tentativasTotais:1,erro:{codigo:'LEITURA_DIVERGENTE',categoria:'leitura',fase:'releitura'}});});
 assert.deepEqual(r.conflitos.map(c=>c.chave),[],'a 2ª edição do mesmo usuário conflitou com a própria 1ª edição');
 assert.equal(r.dados.metas[0].titulo,'C');
});

test('C1/C5: P0001 "Registro indisponível ou sem permissão" classifica como registro_indisponivel',()=>{
 const e=erroCom('Registro indisponível ou sem permissão',{status:400,code:'P0001'});
 assert.equal(classificarFalha(e).categoria,'registro_indisponivel');
 assert.equal(classificarFalha(erroCom('Outra regra de negócio',{status:400,code:'P0001'})).categoria,'validacao','[guarda] demais P0001 continuam validação');
});

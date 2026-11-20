import test from 'node:test';
import assert from 'node:assert/strict';
import {arquivoRecusado,resumoBytes,prepararRevisaoArquivo,protegerOperacoesArquivo} from '../src/revisao-arquivo-recusado.js';
import {checksumIntencao} from '../src/fila-intencoes.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {arquivosDaIntencao} from '../src/arquivos-intencoes.js';
const conta='owner',key='integracao-campo-offline-v1',id=conta+'|'+key;
async function fixture(){
 const local=await resumoBytes('local'),remote=await resumoBytes('remoto'),a={key,value:'local',version:'v1',expected:null};
 const row={colecao:'arquivos',registro_id:id,criado_por:conta,referencia_tabela:null,referencia_id:null,updated_at:'2026-11-20T00:00:00.000Z',dados:{chave:key,path:conta+'/'+remote.hash,...remote}};
 const original={intencao:{edicoes:[],arquivos:{[id]:a}}};
 const item={id:'root',conta,estado:'bloqueado_conflito',checksum:await checksumIntencao(original),original,erro:{codigo:'PT409',fase:'envio',rejeicaoConfirmada:true},preparado:{sent:{[id]:a}},payload:[{table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:id},insert:true,changes:{dados:{chave:key,path:conta+'/'+local.hash,...local}}}]};
 return {item,state:{db:{},base:{integracao_arquivos:[row]}},row,conta,lerConteudo:async()=> 'remoto',checksum:checksumIntencao,conferir:()=>{}};
}
test('backup valida bytes/hash de ambos os lados e não modifica original',async()=>{
 const f=await fixture(),before=structuredClone(f.item),a=await prepararRevisaoArquivo(f);
 assert.equal(a.anterior.value,'remoto');assert.equal(a.arquivoOriginal.value,'local');assert.deepEqual(f.item,before);
 for(const bad of ['conteúdo adulterado',''])await assert.rejects(prepararRevisaoArquivo({...f,lerConteudo:async()=>bad}));
 f.item.checksum='errado';await assert.rejects(prepararRevisaoArquivo(f));
});
test('nega incerto, recibo, terceiros, remoção, misto, arquivo público e lotes',async()=>{
 for(const change of [
 f=>{f.item.recibo={};},f=>{f.item.erro.rejeicaoConfirmada=false;},f=>{f.item.erro.fase='preparacao';},
 f=>{f.item.conta='outro';},f=>{f.row.criado_por='outro';},f=>{f.row.referencia_id='outro';},
 f=>{f.item.original.intencao.edicoes=[{}];},f=>{f.item.original.intencao.arquivos.extra={};},
 f=>{f.item.original.intencao.arquivos[id].value=null;},f=>{f.item.original.intencao.arquivos[id].key='integracao-timbrado-v1-x';},
 f=>{f.item.payload[0].remove=true;},f=>{f.row.dados.path='outro/'+f.row.dados.hash;},
 f=>{f.item.original.substitui='anterior';},f=>{delete f.item.erro.rejeicaoConfirmada;}
 ]){const f=await fixture();change(f);assert.equal(arquivoRecusado(f.item,conta,f.state),null);}
});
test('guarda exata fica primeiro, mesmo conteúdo mantém recibo e não muda timestamp',async()=>{
 const f=await fixture(),a=await prepararRevisaoArquivo(f),ops=protegerOperacoesArquivo([],a);
 assert.equal(ops.length,3);assert.equal(ops[0].changes.dados,undefined);assert.deepEqual(ops[0].expected.dados,f.row.dados);
 assert.equal(ops[0].changes.updated_at,f.row.updated_at);assert.deepEqual(ops[1].changes.dados,f.row.dados);
 assert.throws(()=>protegerOperacoesArquivo([{table:'metas'}],a));
});
test('cópia readback precede enqueue; falha, troca de conta, concorrência não enfileiram',async()=>{
 for(const mode of ['ok','backup','concorrencia','sessao','recibo','reciboErro']){
 const f=await fixture(),saved=[],queued=[],original=structuredClone(f.item);let reads=0,active=true;
 const fila={listar:async()=>[f.item],preservarLegado:async(c,texto)=>{saved.push({checksum:'b',texto});return saved[0];},exportar:async()=>({originais:mode==='backup'?[]:saved}),enfileirar:async p=>{assert.equal(saved.length,1);queued.push(p);return p;},fechar:()=>{}};
 const d=criarDiarioCompartilhado({conta,fila,ativo:()=>active,atualizou:()=>{},carregar:async()=>{
 reads++;if(mode==='concorrencia'&&reads===3)f.row.updated_at='mudou';return structuredClone(f.state);},
 consultarRecibo:async()=>{if(mode==='reciboErro')throw Error('PT409 recibo divergente');return mode==='recibo'?{aliases:{}}:null;},
 lerConteudoArquivo:async()=>{if(mode==='sessao')active=false;return 'remoto';}});
 try{await d.previa('root');if(mode==='ok')await d.substituirArquivo('root');else await assert.rejects(d.substituirArquivo('root'));
 assert.equal(queued.length,mode==='ok'?1:0);if(mode.startsWith('recibo'))assert.equal(saved.length,0);assert.deepEqual(f.item,original);
 if(queued.length){assert.equal(queued[0].substituirId,'root');assert.deepEqual(queued[0].intencao.arquivos[id].expected,f.row.dados);assert.equal(queued[0].intencao.recuperacaoArquivo.anterior.value,'remoto');}
 }finally{d.fechar();}
 }
});
test('linhagem raiz substituída e dois sucessores usa somente recibo verificado',async()=>{
 const f=await fixture(),audit=await prepararRevisaoArquivo(f),root=f.item;root.substituidaPor='replacement';
 const replacement={id:'replacement',ordem:1,estado:'confirmado',recibo:{aliases:{}},original:{substitui:root.id,intencao:{recuperacaoArquivo:audit,arquivos:{[id]:{...audit.arquivoOriginal,expected:audit.anterior.row.dados}}}},payload:protegerOperacoesArquivo([{table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:id},expected:{dados:audit.anterior.row.dados},changes:{dados:{hash:'local'}}}],audit)};
 const child={id:'child',dependencias:['root'],original:{intencao:{arquivos:{[id]:{key,value:'second',expected:null}}}}};
 assert.deepEqual(arquivosDaIntencao(child,[root,replacement])[id].expected,{hash:'local'});
 replacement.estado='confirmado_aguardando_leitura';assert.equal(arquivosDaIntencao(child,[root,replacement])[id].expected,null);replacement.estado='confirmado';
 const second={...child,ordem:2,estado:'confirmado',recibo:{},payload:[{table:'integracao_arquivos',key:{registro_id:id},expected:{dados:{hash:'local'}},changes:{dados:{hash:'second'}}}]};
 const third={...child,id:'third',dependencias:['root','child']};
 assert.deepEqual(arquivosDaIntencao(third,[root,replacement,second])[id].expected,{hash:'second'});
 root.checksum='alterado';assert.equal(arquivosDaIntencao(child,[root,replacement])[id].expected,null);
});

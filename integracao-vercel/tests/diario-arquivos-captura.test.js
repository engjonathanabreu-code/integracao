import test from 'node:test';
import assert from 'node:assert/strict';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
const arquivo=(key,version)=>({key,value:'conteúdo '+version,version,expected:null});
function ambiente(anteriores=[]){
 const items=structuredClone(anteriores);
 const fila={listar:async()=>structuredClone(items),enfileirar:async p=>{const item={id:p.id,estado:'pendente_local',tentativas:0,original:{...structuredClone(p)},dependencias:[],ordem:items.length+1};items.push(item);return item;},fechar:()=>{},exportar:async()=>({intencoes:structuredClone(items)})};
 const diario=criarDiarioCompartilhado({conta:'a',fila,ativo:()=>true,carregar:async()=>({db:{}}),preparar:async()=>({operacoes:[]}),enviar:async()=>({}),consultarRecibo:async()=>null,confirmar:async()=>{},atualizou:()=>{}});
 return {diario,items};
}
test('recuperação enfileira arquivos separadamente e eventos repetidos não duplicam versões',async()=>{
 const a=ambiente(),files={f:arquivo('f','1'),g:arquivo('g','2')};try{
  await Promise.all([a.diario.adicionarArquivos({},files),a.diario.adicionarArquivos({},files)]);
  assert.equal(a.items.length,2);assert.deepEqual(a.items.map(i=>Object.keys(i.original.intencao.arquivos)),[['f'],['g']]);
  await a.diario.adicionarArquivos({},{f:arquivo('f','3')});assert.equal(a.items.length,3);
 }finally{a.diario.fechar();}
});
test('captura congela a versão antes do await e exporta o trabalho enfileirado',async()=>{
 const a=ambiente(),files={f:arquivo('f','1')};try{
  const trabalho=a.diario.adicionarArquivos({},files);files.f.value='mudou depois';const backup=await a.diario.exportar();await trabalho;
  assert.equal(backup.intencoes[0].original.intencao.arquivos.f.value,'conteúdo 1');
 }finally{a.diario.fechar();}
});
test('arquivo excluído do escopo antigo é recuperado, sem alterar o original',async()=>{
 const old={id:'old',estado:'pendente_local',tentativas:0,original:{preparar:true,unidade:'meta',recursos:['meta','arquivo:f'],dependencias:[],intencao:{edicoes:[{colecao:'metas',id:'m',antes:{existe:true,valor:{id:'m',titulo:'base'}},depois:{existe:true,valor:{id:'m',titulo:'local'}}}],arquivos:{f:arquivo('f','1')}}}},a=ambiente([old]);
 try{await a.diario.adicionarArquivos({},{f:arquivo('f','1')});assert.equal(a.items.length,2);assert.deepEqual(a.items[0],old);}finally{a.diario.fechar();}
});

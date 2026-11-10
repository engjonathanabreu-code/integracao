import test from 'node:test';import assert from 'node:assert/strict';import {arquivosDaIntencao} from '../src/arquivos-intencoes.js';
const anterior=(id,ordem,dados)=>({id,ordem,estado:'confirmado',recibo:{aliases:{}},original:{intencao:{arquivos:{arquivo:{expected:null,value:'texto '+id}}}},payload:[{table:'integracao_arquivos',key:{registro_id:'arquivo'},changes:{dados}}]});
test('arquivo editado duas vezes avança somente pela base do predecessor confirmado',()=>{
 const a=anterior('a',1,{hash:'a'}),b=anterior('b',2,{hash:'b'}),item={dependencias:['a','b'],original:{intencao:{arquivos:{arquivo:{expected:null,value:'texto c'}}}}};
 assert.deepEqual(arquivosDaIntencao(item,[a,b]).arquivo.expected,{hash:'b'});assert.equal(item.original.intencao.arquivos.arquivo.expected,null);
 assert.equal(arquivosDaIntencao({...item,dependencias:[]},[a,b]).arquivo.expected,null);
 for(const estado of ['resultado_desconhecido','bloqueado_validacao','confirmado_aguardando_leitura'])assert.equal(arquivosDaIntencao({...item,dependencias:['a']},[{...a,estado}]).arquivo.expected,null);
 item.original.intencao.arquivos.arquivo.expected={hash:'servidor-mais-novo'};assert.deepEqual(arquivosDaIntencao(item,[a,b]).arquivo.expected,{hash:'servidor-mais-novo'});
});
test('substituição preserva sequência de arquivo e remoção confirmada vira base ausente',()=>{
 const a=anterior('novo',1,{hash:'a'}),item={dependencias:['antigo'],original:{intencao:{arquivos:{arquivo:{expected:null,value:'novo valor'}}}}};
 assert.deepEqual(arquivosDaIntencao(item,[{id:'antigo',substituidaPor:'novo'},a]).arquivo.expected,{hash:'a'});
 a.payload[0]={...a.payload[0],remove:true};assert.equal(arquivosDaIntencao(item,[{id:'antigo',substituidaPor:'novo'},a]).arquivo.expected,null);
});
test('edição criada após a primeira confirmação acompanha a base efetiva do próximo predecessor',()=>{
 const b=anterior('b',2,{hash:'b'});b.payload[0].expected={dados:{hash:'a'}};
 const c={dependencias:['b'],original:{intencao:{arquivos:{arquivo:{expected:{hash:'a'},value:'c'}}}}};
 assert.deepEqual(arquivosDaIntencao(c,[b]).arquivo.expected,{hash:'b'});
});

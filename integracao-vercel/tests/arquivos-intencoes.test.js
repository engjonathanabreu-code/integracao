import test from 'node:test';import assert from 'node:assert/strict';import {arquivosDaIntencao} from '../src/arquivos-intencoes.js';
const key='fixture-key',meta=hash=>({chave:key,hash});
const alvo=(base,dependencias,extra={})=>({id:'root',conta:'owner',ordem:10,dependencias,original:{intencao:{arquivos:{arquivo:{key,expected:base,value:'root',version:'v'}}}},...extra});
const anterior=(id,ordem,de,para,{base=de,typed=false}={})=>{
 const arquivo={key,expected:base,value:para===null?null:'texto '+id,version:id};
 const op={table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:'arquivo'},...(de===null?{insert:true}:{expected:{dados:de}}),...(para===null?{remove:true}:{changes:{dados:para}})};
 const recibo=typed?{protocoloRecibo:1,pedido:id,confirmadoEm:'2026-11-20T00:00:00Z',aliases:{},resultados:[{indice:0,tipo:'registro',tabela:op.table,chave:op.key,removido:!!op.remove,disponivel:true,versao:'1'.repeat(32),canonico:para===null?null:{...op.key,dados:para}}]}:{aliases:{}};
 return {id,pedido:id,conta:'owner',ordem,estado:'confirmado',recibo,original:{intencao:{arquivos:{arquivo}}},preparado:{sent:{arquivo:{...arquivo,expected:de}}},payload:[op]};
};
const expected=(item,items)=>arquivosDaIntencao(item,items).arquivo.expected;
test('A→B→C usa cada CAS efetivo apesar de originais X e lista fora de ordem',()=>{
 const [A,B,C,X]=['a','b','c','x'].map(meta),a=anterior('dep1',1,A,B,{base:X,typed:true}),b=anterior('dep2',2,B,C,{base:X,typed:true}),item=alvo(A,[b.id,a.id]),before=structuredClone([item,a,b]);
 assert.deepEqual(expected(item,[b,a]),C);
 assert.deepEqual([item,a,b],before);
 assert.deepEqual(expected({...item,dependencias:[]},[a,b]),A);
 assert.deepEqual(expected({...item,payload:[{}]},[a,b]),A);
 assert.deepEqual(expected({...item,tentativas:1},[a,b]),A);
});
test('base capturada intermediária e uma sequência insert/update/remove continuam legítimas',()=>{
 const [A,B,C]=['a','b','c'].map(meta);
 const a=anterior('a',1,null,A),b=anterior('b',2,A,B),c=anterior('c',3,B,C),d=anterior('d',4,C,null,{typed:true});
 assert.deepEqual(expected(alvo(null,['a','b']),[b,a]),B);
 assert.deepEqual(expected(alvo(B,['a','b','c']),[a,b,c]),C);
 assert.equal(expected(alvo(A,['a','b','c','d']),[a,b,c,d]),null);
});
test('substituição exige vínculo recíproco da mesma conta e posição',()=>{
 const A=meta('a'),B=meta('b'),a=anterior('novo',1,A,B),orig={id:'antigo',conta:'owner',ordem:1,estado:'substituido',substituidaPor:'novo'};
 const item=alvo(A,['antigo']);a.original.substitui='antigo';
 assert.deepEqual(expected(item,[orig,a]),B);
 for(const change of [{conta:'terceiro'},{ordem:2},{original:{...a.original,substitui:'outro'}}])assert.deepEqual(expected(item,[orig,{...a,...change}]),A);
 assert.deepEqual(expected(item,[{...orig,substituidaPor:'antigo'},a]),A);
});
test('gaps, stale forks, other accounts, future, ambiguous/malformed hops leave original untouched',()=>{
 const [A,B,C,X]=['a','b','c','x'].map(meta),a=anterior('a',1,A,B),item=alvo(A,['a','b']);
 for(const alterar of [
  b=>{b.payload[0].expected.dados=A;b.preparado.sent.arquivo.expected=A;},
  b=>{b.payload[0].expected.dados=X;b.preparado.sent.arquivo.expected=X;},
  b=>{delete b.payload[0].expected;},
  b=>{b.conta='other';},b=>{b.ordem=11;},b=>{b.ordem=1;},
  b=>{b.estado='confirmado_aguardando_leitura';},b=>{delete b.recibo;},b=>{b.recibo={};},b=>{b.recibo={aliases:[]};},
  b=>{b.payload.push(structuredClone(b.payload[0]));},b=>{b.payload={};},b=>{b.payload=[null];},
  b=>{b.payload[0].key.registro_id='wrong';},b=>{b.payload[0].key.colecao='wrong';},b=>{b.preparado.sent.arquivo.expected=X;},
 ]){const b=anterior('b',2,B,C,{base:A});alterar(b);assert.deepEqual(expected(item,[a,b]),A);}
 const b=anterior('b',2,B,C,{typed:true});
 for(const mudar of [
  x=>{x.recibo.pedido='other';},x=>{x.recibo.resultados[0].canonico.dados=X;},
  x=>{x.recibo.resultados[0].disponivel=false;x.recibo.resultados[0].canonico=null;x.recibo.resultados[0].versao=null;},
 ]){const x=structuredClone(b);mudar(x);assert.deepEqual(expected(item,[a,x]),A);}
 assert.deepEqual(expected(alvo(X,['a','b']),[a,b]),X);
 assert.deepEqual(expected(item,[a,b,structuredClone(b)]),A);
 // A genuine intent for another file does not participate in the chain.
 const other=anterior('other',3,C,X);other.payload[0].key.registro_id='other';other.original.intencao.arquivos={other:other.original.intencao.arquivos.arquivo};
 assert.deepEqual(expected(alvo(A,['other','b','a']),[a,b,other]),C);
});

test('edição seleciona só anexos dos registros alterados, incluindo remoções e KML implícito',async()=>{
 const {selecionarArquivosDaEdicao}=await import('../src/arquivos-intencoes.js');
 const arquivos={foto:{key:'foto-a',value:'foto'},removido:{key:'foto-removida',value:null},kml:{key:'integracao-kml-v1-n1',value:'mapa'},outro:{key:'foto-b',value:'outra'}};
 const edicoes=[{colecao:'nucleos',id:'n1',antes:{existe:true,valor:{anexos:[{chave:'foto-removida'}]}},depois:{existe:true,valor:{anexos:[{chave:'foto-a'}]}}},{colecao:'auditoria',depois:{existe:true,valor:[{texto:'foto-b'}]}}];
 const selecionados=selecionarArquivosDaEdicao(edicoes,arquivos);
 assert.deepEqual(Object.keys(selecionados),['foto','removido','kml']);selecionados.foto.value='mutado';assert.equal(arquivos.foto.value,'foto');
 assert.deepEqual(selecionarArquivosDaEdicao([{colecao:'metas',id:'m1',depois:{existe:true,valor:{titulo:'Independente'}}}],arquivos),{});
});

const legadoDados=()=>({id:'edicao',estado:'pendente_local',tentativas:0,dependencias:['anexo'],checksum:'preservado',original:{preparar:true,operacoes:[],dependencias:[],unidade:'meta:m',recursos:['meta:m','arquivo:f'],referencias:[],intencao:{edicoes:[{colecao:'metas',id:'m',antes:{existe:true,valor:{id:'m',titulo:'Antes'}},depois:{existe:true,valor:{id:'m',titulo:'Depois'}}}],arquivos:{f:{key:'foto-f',value:'conteudo',version:'v1',expected:null}}}}});
const bloqueioArquivo=()=>({id:'anexo',estado:'bloqueado_validacao',original:{unidade:'arquivo:f',recursos:['arquivo:f'],criadas:[]}});
test('legado não enviado isola arquivo sem editar original, checksum ou dependências históricas',async()=>{
 const {escopoArquivosDaIntencao}=await import('../src/arquivos-intencoes.js');
 const item=legadoDados(),antes=structuredClone(item),escopo=escopoArquivosDaIntencao(item,[bloqueioArquivo()]);
 assert.deepEqual(escopo,{versao:1,ids:[],dependencias:[]});assert.deepEqual(arquivosDaIntencao(item,[bloqueioArquivo()]),{});assert.deepEqual(item,antes);
 const retomado={...item,escopoArquivos:escopo,payload:[],recibo:{},enviadoEm:1,tentativas:1,estado:'confirmado_aguardando_leitura'};
 assert.deepEqual(escopoArquivosDaIntencao(retomado,[bloqueioArquivo()]),escopo);
});
test('escopo preserva dependência explícita, entidade, identidade criada e anexo relacionado',async()=>{
 const {escopoArquivosDaIntencao}=await import('../src/arquivos-intencoes.js');
 for(const caso of ['explicita','entidade','identidade','relacionado','origem-desconhecida']){
  const item=legadoDados(),anterior=bloqueioArquivo();
  if(caso==='explicita')item.original.dependencias=['anexo'];
  if(caso==='entidade')anterior.original.recursos.push('meta:m');
  if(caso==='identidade'){anterior.original.criadas=['nova'];item.original.referencias=['nova'];}
  if(caso==='relacionado')item.original.intencao.edicoes[0].depois.valor.chave='foto-f';
  if(caso==='origem-desconhecida')anterior.original.recursos=[];
  assert.deepEqual(escopoArquivosDaIntencao(item,[anterior]).dependencias,['anexo'],caso);
 }
});
test('originais fixos, enviados, legados ou só arquivos nunca são reinterpretados',async()=>{
 const {escopoArquivosDaIntencao}=await import('../src/arquivos-intencoes.js');
 for(const alteracao of [{payload:[]},{preparado:{}},{recibo:{}},{tentativas:1},{enviadoEm:0},{estado:'resultado_desconhecido'}])assert.equal(escopoArquivosDaIntencao(Object.assign(legadoDados(),alteracao),[]),null);
 for(const alteracao of [{substitui:'anterior'},{legado:{}},{preparar:false},{operacoes:[{}]}]){const item=legadoDados();Object.assign(item.original,alteracao);assert.equal(escopoArquivosDaIntencao(item,[]),null);}
 const item=legadoDados();item.original.intencao.edicoes=[];assert.equal(escopoArquivosDaIntencao(item,[]),null);
});
test('aceitar arquivo divergente não autoriza sucessor a sobrescrever o valor remoto',()=>{
 const a=anterior('a',1,null,meta('enviado')),item=alvo(null,['a']);
 a.decisao={tipo:'aceitar_estado_atual_apos_recibo',arquivosAtual:{arquivo:meta('aceito')}};assert.equal(expected(item,[a]),null);
 a.decisao.arquivosAtual.arquivo=null;assert.equal(expected(item,[a]),null);
 a.decisao.arquivosAtual.arquivo=meta('enviado');assert.deepEqual(expected(item,[a]),meta('enviado'));
});
test('recursos efetivos não prendem arquivo órfão ao conflito de dados do predecessor',async()=>{
 const {escopoArquivosDaIntencao,recursosEfetivosDaIntencao}=await import('../src/arquivos-intencoes.js');
 const anterior=legadoDados();anterior.id='dados';anterior.dependencias=[];
 const original=structuredClone(anterior.original),checksum=anterior.checksum;
 anterior.escopoArquivos=escopoArquivosDaIntencao(anterior,[]);anterior.estado='bloqueado_conflito';
 assert.deepEqual(recursosEfetivosDaIntencao(anterior),['meta:m']);assert.deepEqual(anterior.original,original);assert.equal(anterior.checksum,checksum);
 const arquivo=legadoDados();arquivo.id='arquivo';arquivo.dependencias=['dados'];arquivo.original.unidade='arquivo:f';arquivo.original.recursos=['arquivo:f'];arquivo.original.intencao.edicoes=[];
 const escopo=escopoArquivosDaIntencao(arquivo,[anterior]);assert.deepEqual(escopo,{versao:1,ids:['f'],dependencias:[]});
 assert.deepEqual(arquivosDaIntencao(arquivo,[anterior]),arquivo.original.intencao.arquivos);
 for(const alterar of [x=>x.original.dependencias=['dados'],x=>x.payload=[],x=>x.enviadoEm=1,x=>x.tentativas=1]){
  const protegido=structuredClone(arquivo);alterar(protegido);const e=escopoArquivosDaIntencao(protegido,[anterior]);assert.ok(e===null||e.dependencias.includes('dados'));
 }
 const semProva=structuredClone(anterior);delete semProva.escopoArquivos;assert.equal(escopoArquivosDaIntencao(arquivo,[semProva]),null);
 const substituido={...anterior,substituidaPor:'substituto'};assert.equal(escopoArquivosDaIntencao(arquivo,[substituido]),null);
 const identidade=structuredClone(anterior);identidade.original.criadas=['m'];arquivo.original.referencias=['m'];assert.equal(escopoArquivosDaIntencao(arquivo,[identidade]),null);
});

test('substituição herda dependências executáveis congeladas sem restaurar arquivo histórico',async()=>{
 const {dependenciasEfetivasDaIntencao}=await import('../src/arquivos-intencoes.js');
 const item=legadoDados();item.original.dependencias=['explicita'];item.dependencias=['explicita','anexo'];item.escopoArquivos={versao:1,ids:[],dependencias:['explicita']};
 const antes=structuredClone(item),herdadas=dependenciasEfetivasDaIntencao(item);
 assert.deepEqual(herdadas,['explicita']);herdadas.push('outra');assert.deepEqual(item,antes);
 item.escopoArquivos.dependencias=[];assert.deepEqual(dependenciasEfetivasDaIntencao(item),[]);
 delete item.escopoArquivos;assert.deepEqual(dependenciasEfetivasDaIntencao(item),['explicita','anexo']);
});

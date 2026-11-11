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
 const a=anterior('a',1,{hash:'enviado'}),item={dependencias:['a'],original:{intencao:{arquivos:{arquivo:{expected:null,value:'nova'}}}}};
 a.decisao={tipo:'aceitar_estado_atual_apos_recibo',arquivosAtual:{arquivo:{hash:'aceito'}}};assert.equal(arquivosDaIntencao(item,[a]).arquivo.expected,null);
 a.decisao.arquivosAtual.arquivo=null;assert.equal(arquivosDaIntencao(item,[a]).arquivo.expected,null);
 a.decisao.arquivosAtual.arquivo={hash:'enviado'};assert.deepEqual(arquivosDaIntencao(item,[a]).arquivo.expected,{hash:'enviado'});
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

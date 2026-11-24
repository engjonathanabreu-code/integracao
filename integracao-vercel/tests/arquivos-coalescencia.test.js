// Fila de arquivos: uma versão recusada ou pendente não pode prender as
// versões seguintes do mesmo arquivo. Somente dados fictícios, sem rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {novaFila,CONTA,enfileirarMeta,erroCom} from './apoio-sync-fila.js';
import {processarIntencao,reconciliarIntencaoMetas} from '../src/fila-intencoes.js';
import {arquivosDaIntencao,chaveCopiaCampo,provaArquivoSemGravacao} from '../src/arquivos-intencoes.js';
import {abrirArquivos,fecharArquivos,agendarArquivo,capturarArquivos,prepararArmazenamento,arquivoPresenteIdentico} from '../src/arquivos-compartilhados.js';
import {criarDiarioCompartilhado} from '../src/diario-compartilhado.js';
import {resumoDiagnostico} from '../src/diagnostico-sincronizacao.js';
import {definirSessao} from '../src/dados-compartilhados.js';

const fid=CONTA+'|'+chaveCopiaCampo;
const meta=(valor,key=chaveCopiaCampo)=>{const bytes=new TextEncoder().encode(valor),hash=createHash('sha256').update(bytes).digest('hex');return {chave:key,path:CONTA+'/'+hash,hash,bytes:bytes.length};};
const E0=meta('base antiga'),OUTRA=meta('pacote de outra instalação');
const linha=(dados,id=fid)=>({colecao:'arquivos',registro_id:id,criado_por:CONTA,referencia_tabela:null,referencia_id:null,dados,updated_at:'2026-11-24T10:00:00Z'});
const versao=(fila,n,{id=fid,key=chaveCopiaCampo,expected=E0,value='v'+n,extra={}}={})=>fila.enfileirar({conta:CONTA,id:'pedido-'+n,unidade:'arquivo:'+id,recursos:['arquivo:'+id],modulo:'arquivos',operacoes:[],preparar:true,base:{},intencao:{edicoes:[],arquivos:{[id]:{key,value,version:'ver'+n,expected}}},...extra});
// Servidor fictício com compare-and-set do ponteiro, como `integracao_gravar`.
function servidor(inicial){
 const s={dados:inicial,envios:0};
 s.callbacks=fila=>({conta:CONTA,dono:'worker',sessaoAtual:()=>true,consultarRecibo:async()=>null,reler:async()=>{},
  preparar:async item=>{
   const [id,a]=Object.entries(arquivosDaIntencao(item,await fila.listar(CONTA)))[0],dados=meta(a.value,a.key);
   return {operacoes:[a.expected?{table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:id},expected:{dados:a.expected},changes:{dados}}:{table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:id},insert:true,changes:{dados}}],sent:{[id]:a}};
  },
  enviar:async item=>{
   s.envios++;const op=item.payload[0];
   if(JSON.stringify(op.expected?.dados??null)!==JSON.stringify(s.dados))throw erroCom('conflito',{code:'PT409',status:409});
   s.dados=op.changes.dados;return {aliases:{}};
  }});
 return s;
}
const rodar=(fila,callbacks)=>processarIntencao(fila,callbacks).then(i=>i&&i.estado,e=>'ERRO '+e.code);
const vivos=async fila=>(await fila.listar(CONTA)).filter(i=>!['confirmado','substituido','dispensado'].includes(i.estado));
// Recria o estado gravado por um cliente anterior: todas as versões vivas e a
// última dependente de todas as anteriores.
function estadoAntigo(f,ids){
 for(const id of ids.slice(0,-1))f.editar(id,x=>{if(x.estado==='substituido'){x.estado=x.decisao.estadoAnterior;delete x.decisao;delete x.substituidaPor;}});
 f.editar(ids.at(-1),x=>{x.dependencias=ids.slice(0,-1);});
}

test('aparelho já preso: 1 conflito + N pendentes viram 1 pendência ao abrir, sem perder bytes, e a operação é idempotente',async()=>{
 const f=novaFila(),s=servidor(OUTRA),ids=[];
 ids.push((await versao(f.fila,1)).id);
 assert.equal(await rodar(f.fila,s.callbacks(f.fila)),'ERRO PT409');
 for(let n=2;n<=5;n++)ids.push((await versao(f.fila,n)).id);
 estadoAntigo(f,ids);
 const antes=ids.map(id=>f.ler(id));
 assert.deepEqual(resumoDiagnostico(antes).map(g=>[g.estado,g.codigo,g.quantidade]),[['bloqueado_conflito','PT409',1],['pendente_local','SEM_ERRO',4]]);
 const nova=f.abrir();
 const itens=await nova.listar(CONTA);
 assert.deepEqual(itens.map(i=>i.estado),['substituido','substituido','substituido','substituido','pendente_local']);
 for(const [n,i] of itens.slice(0,-1).entries()){
  assert.equal(i.substituidaPor,ids[4]);assert.equal(i.decisao.tipo,'versao_de_arquivo_superada');assert.equal(i.decisao.por,ids[4]);
  // Journal bytes, identity and the refused payload stay available for export.
  assert.deepEqual(i.original,antes[n].original);assert.equal(i.checksum,antes[n].checksum);assert.deepEqual(i.payload,antes[n].payload);
 }
 assert.equal(itens[0].decisao.estadoAnterior,'bloqueado_conflito');
 assert.deepEqual(itens[4].dependencias,[]);assert.deepEqual(itens[4].original,antes[4].original);
 const gravado=JSON.stringify(itens);
 await nova.fechar();const outra=f.abrir();
 assert.equal(JSON.stringify(await outra.listar(CONTA)),gravado);
 const reservado=await outra.reservar(CONTA,{dono:'worker'});
 assert.equal(reservado.id,ids[4]);assert.equal(JSON.stringify((await outra.listar(CONTA)).slice(0,4)),JSON.stringify(itens.slice(0,4)));
});

test('nova versão supera as anteriores não enviadas e a recusada; um pedido de outra unidade passa a esperar a sobrevivente',async()=>{
 const f=novaFila(),s=servidor(E0);
 const a=await versao(f.fila,1),dependente=await enfileirarMeta(f.fila,{dependencias:[a.id]});
 const b=await versao(f.fila,2);
 assert.deepEqual(b.dependencias,[]);
 assert.deepEqual((await f.fila.listar(CONTA)).map(i=>i.estado),['substituido','pendente_local','pendente_local']);
 const primeiro=await f.fila.reservar(CONTA,{dono:'worker'});
 assert.equal(primeiro.id,b.id,'o dependente não é liberado antes da versão que superou sua dependência');
 await f.fila.liberarReserva(primeiro);
 assert.equal(await rodar(f.fila,s.callbacks(f.fila)),'confirmado');
 assert.equal(s.envios,1,'somente a versão mais nova é enviada');assert.deepEqual(s.dados,meta('v2'));
 assert.equal((await f.fila.reservar(CONTA,{dono:'worker'})).id,dependente.id);
});

test('enviado sem veredito, com recibo, com reserva ativa, lote ou decisão explícita nunca são superados',async()=>{
 const f=novaFila(),s=servidor(E0);
 const a=await versao(f.fila,1);
 // Unknown result: sent, no server verdict.
 const reservado=await f.fila.reservar(CONTA,{dono:'worker'});
 const fixado=await f.fila.fixarPayload(reservado,(await s.callbacks(f.fila).preparar(reservado)).operacoes,{sent:{}});
 await f.fila.registrarEnvio(fixado);await f.fila.registrarFalha(fixado,new TypeError('fetch failed'),{fase:'envio'});
 const b=await versao(f.fila,2);
 assert.equal(f.ler(a.id).estado,'resultado_desconhecido');assert.deepEqual(b.dependencias,[a.id]);
 assert.equal(await f.fila.reservar(CONTA,{dono:'outro',ignorarIds:[a.id]}),null,'a nova versão continua esperando o resultado desconhecido');
 // Receipt waiting for read-back.
 f.editar(a.id,x=>{x.estado='confirmado_aguardando_leitura';x.recibo={aliases:{}};});
 await versao(f.fila,3);
 assert.deepEqual([a.id,b.id].map(id=>f.ler(id).estado),['confirmado_aguardando_leitura','substituido']);
 assert.deepEqual(f.ler('pedido-3').dependencias,[a.id]);
 // Active lease on a never-sent version, a multi-file batch and an explicit replacement.
 const g=novaFila();
 const x=await versao(g.fila,1);await g.fila.reservar(CONTA,{dono:'aba'});
 await versao(g.fila,2);assert.equal(g.ler(x.id).estado,'pendente_local');
 const h=novaFila();
 const lote=await h.fila.enfileirar({conta:CONTA,id:'lote',unidade:'arquivo:'+fid,recursos:['arquivo:'+fid,'arquivo:g'],modulo:'arquivos',operacoes:[],preparar:true,base:{},intencao:{edicoes:[],arquivos:{[fid]:{key:chaveCopiaCampo,value:'a',version:'l1',expected:null},g:{key:'integracao-foto-v4-g',value:'b',version:'l2',expected:null}}}});
 await versao(h.fila,2);assert.equal(h.ler(lote.id).estado,'pendente_local');
 const k=novaFila(),sk=servidor(OUTRA);
 const recusada=await versao(k.fila,1);assert.equal(await rodar(k.fila,sk.callbacks(k.fila)),'ERRO PT409');
 const substituta=await versao(k.fila,9,{value:'v1',extra:{substituirId:recusada.id}});
 await versao(k.fila,2);
 assert.equal(k.ler(substituta.id).estado,'pendente_local','a decisão explícita do usuário é enviada antes da versão seguinte');
 assert.deepEqual(k.ler('pedido-2').dependencias,[substituta.id]);
});

test('ciclo completo com outra instalação: sobra uma única revisão e "manter minha versão" parte do ponteiro exibido',async()=>{
 const f=novaFila(),s=servidor(OUTRA),enviados=[];
 for(let n=1;n<=4;n++)await versao(f.fila,n);
 const base=()=>({integracao_arquivos:s.dados?[linha(s.dados)]:[]});
 const diario=criarDiarioCompartilhado({conta:CONTA,fila:f.fila,ativo:()=>true,atualizou:()=>{},carregar:async()=>({db:{},base:base()}),
  preparar:async(remoto,_depois,arquivos)=>{const [id,a]=Object.entries(arquivos)[0],dados=meta(a.value);return {operacoes:[{table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:id},expected:{dados:a.expected},changes:{dados}}],sent:arquivos};},
  enviar:async payload=>{enviados.push(payload[0]);return s.callbacks(f.fila).enviar({payload});},consultarRecibo:async()=>null,confirmar:async()=>{},
  conferirArquivo:async()=>false,concluirArquivos:async()=>{}});
 try{
  await diario.executar();
  const pendentes=await vivos(f.fila);
  assert.deepEqual(pendentes.map(i=>[i.id,i.estado,i.erro.codigo]),[['pedido-4','bloqueado_conflito','PT409']]);
  assert.equal(enviados.length,1);
  const previa=await diario.previa('pedido-4');
  assert.deepEqual(previa.snapshot.arquivos,{[fid]:OUTRA});
  // The pointer changed after the preview: the decision must be reviewed again.
  const visto=s.dados;s.dados=meta('terceira instalação');
  await assert.rejects(diario.resolver('pedido-4',{}),/mudaram/);
  s.dados=visto;await diario.previa('pedido-4');
  await diario.resolver('pedido-4',{});
  const [substituta]=await vivos(f.fila);
  assert.equal(substituta.original.substitui,'pedido-4');
  assert.deepEqual(substituta.original.intencao.arquivos[fid],{key:chaveCopiaCampo,value:'v4',version:'ver4',expected:OUTRA});
  // A newer local version saved before that decision is sent waits for it and
  // is then based on that confirmed write, not on the stale captured pointer.
  f.relogio.agora+=1000;await versao(f.fila,5);f.relogio.agora+=1000;
  await diario.executar();
  assert.deepEqual(await vivos(f.fila),[]);assert.deepEqual(s.dados,meta('v5'));
  assert.deepEqual(enviados.map(op=>[op.expected.dados,op.changes.dados]),[[E0,meta('v4')],[OUTRA,meta('v4')],[meta('v4'),meta('v5')]],'um pedido por intenção');
 }finally{diario.fechar();}
});

test('base própria: só uma escrita confirmada (ou prova de presença) posterior à criação do pedido substitui o ponteiro capturado',async()=>{
 const f=novaFila(),s=servidor(OUTRA);
 const recusada=await versao(f.fila,1);assert.equal(await rodar(f.fila,s.callbacks(f.fila)),'ERRO PT409');
 const substituta=await versao(f.fila,9,{value:'v1',expected:OUTRA,extra:{substituirId:recusada.id}});
 f.relogio.agora+=10;const seguinte=await versao(f.fila,2);
 f.relogio.agora+=10;assert.equal(await rodar(f.fila,s.callbacks(f.fila)),'confirmado');
 const itens=await f.fila.listar(CONTA),alvo=itens.find(i=>i.id===seguinte.id);
 assert.deepEqual(arquivosDaIntencao(alvo,itens)[fid].expected,meta('v1'));
 const com=(id,fn)=>itens.map(i=>{if(i.id!==id)return i;const c=structuredClone(i);fn(c);return c;});
 // Written before this request existed: the captured base may already reflect a later pointer.
 assert.deepEqual(arquivosDaIntencao(alvo,com(substituta.id,x=>{x.enviadoEm=alvo.criadoEm-1;}))[fid].expected,E0);
 // A reviewed/accepted divergent read, a missing receipt or another account are not lineage.
 assert.deepEqual(arquivosDaIntencao(alvo,com(substituta.id,x=>{x.decisao={tipo:'aceitar_estado_atual_apos_recibo',arquivosAtual:{}};}))[fid].expected,E0);
 assert.deepEqual(arquivosDaIntencao(alvo,com(substituta.id,x=>{delete x.recibo;}))[fid].expected,E0);
 assert.deepEqual(arquivosDaIntencao(alvo,com(substituta.id,x=>{x.conta='outra';}))[fid].expected,E0);
 assert.deepEqual(arquivosDaIntencao({...alvo,payload:[{}]},itens)[fid].expected,E0,'payload fixado nunca é reinterpretado');
 // Proof of presence closes without a write and is the same kind of evidence.
 const prova={id:fid,version:'ver1',dados:meta('v1')};
 const dispensa=x=>{x.estado='dispensado';delete x.recibo;x.decisao={tipo:'arquivo_ja_presente_no_servidor',em:alvo.criadoEm+1,prova};};
 assert.deepEqual(arquivosDaIntencao(alvo,com(substituta.id,dispensa))[fid].expected,meta('v1'));
 assert.deepEqual(arquivosDaIntencao(alvo,com(substituta.id,x=>{dispensa(x);x.decisao.em=alvo.criadoEm-1;}))[fid].expected,E0);
 assert.deepEqual(arquivosDaIntencao(alvo,com(substituta.id,x=>{dispensa(x);x.decisao.tipo='manter_remoto';}))[fid].expected,E0);
});

test('cópia de Campo idêntica com versão mais nova na fila não entra em impasse; outro dependente não a impede de encerrar',async()=>{
 const f=novaFila(),dados=meta('v1');
 const cabeca=await versao(f.fila,1,{expected:null});
 const identica=fila=>({conta:CONTA,dono:'worker',sessaoAtual:()=>true,consultarRecibo:async()=>null,reler:async()=>{},enviar:async()=>assert.fail('nada a enviar'),
  preparar:async item=>{const a=item.original.intencao.arquivos[fid];return {operacoes:[],sent:{[fid]:a},identicos:{[fid]:{version:a.version,dados:meta(a.value)}}};}});
 // The newer version arrives while the copy is being verified (active lease).
 const chamadas={...identica(f.fila),preparar:async item=>{await versao(f.fila,2,{expected:null});return identica(f.fila).preparar(item);}};
 assert.equal(await rodar(f.fila,chamadas),'ERRO CAMPO_COPIA_COM_DEPENDENTES');
 assert.equal(f.ler(cabeca.id).estado,'resultado_desconhecido');
 f.relogio.agora+=600000;
 const proximo=await f.fila.reservar(CONTA,{dono:'worker'});
 assert.equal(proximo.id,'pedido-2','a versão nova segue; a antiga foi arquivada como superada');
 assert.equal(f.ler(cabeca.id).decisao.tipo,'versao_de_arquivo_superada');assert.equal(f.ler(cabeca.id).original.intencao.arquivos[fid].value,'v1');
 // Remaining case: a dependent that is not a newer version of this file.
 const g=novaFila(),copia=await versao(g.fila,1,{expected:null}),dependente=await enfileirarMeta(g.fila,{dependencias:[copia.id]});
 assert.equal(await rodar(g.fila,identica(g.fila)),'dispensado');
 assert.deepEqual(g.ler(copia.id).decisao.prova,{id:fid,version:'ver1',dados});assert.equal(g.ler(copia.id).recibo,undefined);
 assert.equal((await g.fila.reservar(CONTA,{dono:'worker'})).id,dependente.id);
});

test('arquivo sem nada a gravar encerra como dispensado com prova; sem prova continua em revisão',async()=>{
 const fetchOriginal=globalThis.fetch,persist=new Map(),storage={get:async k=>persist.get(k),set:async(k,v)=>persist.set(k,v)};
 const foto='integracao-foto-v4-fixture',igual=meta('mesma foto',foto);let uploads=0;
 globalThis.fetch=async(url,o)=>{if(String(url).includes('/storage/')){uploads++;return Response.json({error:'Duplicate'},{status:409});}return Response.json({});};
 definirSessao({user:{id:CONTA},access_token:'fixture-only',expires_in:3600});
 try{
  const cenario=async(base,agendar)=>{
   fecharArquivos();persist.clear();await abrirArquivos({erpRef:CONTA},base,storage);await agendar();
   const f=novaFila(),arquivos=capturarArquivos(),[id]=Object.keys(arquivos),encerrados=[];
   const item=await f.fila.enfileirar({conta:CONTA,id:'pedido',unidade:'arquivo:'+id,recursos:['arquivo:'+id],modulo:'arquivos',operacoes:[],preparar:true,base:{},intencao:{edicoes:[],arquivos}});
   const resultado=await rodar(f.fila,{conta:CONTA,dono:'worker',sessaoAtual:()=>true,consultarRecibo:async()=>null,reler:async()=>{},enviar:async()=>assert.fail('nada a enviar'),
    preparar:async()=>{const a=await prepararArmazenamento({base,bindings:[]},{},arquivos);return {operacoes:a.operations,sent:a.sent,identicos:a.identicos,aposDispensar:()=>encerrados.push(a.sent)};}});
   return {f,item:f.ler(item.id),resultado,encerrados,id,arquivos};
  };
  // Removal of a file that never reached the server.
  const remocao=await cenario({integracao_arquivos:[]},async()=>{await agendarArquivo(foto,'rascunho');await agendarArquivo(foto,null);});
  assert.equal(remocao.resultado,'dispensado');
  assert.deepEqual(remocao.item.decisao.prova,{tipo:'arquivo_sem_gravacao_necessaria',id:foto,version:remocao.arquivos[foto].version,motivo:'remocao_sem_registro'});
  assert.equal(remocao.item.recibo,undefined);assert.equal(remocao.item.tentativasTotais,0);assert.equal(remocao.encerrados.length,1);
  // Identical rewrite of content already under the current pointer.
  uploads=0;const identico=await cenario({integracao_arquivos:[linha(igual,foto)]},()=>agendarArquivo(foto,'mesma foto'));
  assert.equal(identico.resultado,'dispensado');assert.equal(uploads,1);
  assert.deepEqual(identico.item.decisao.prova,{tipo:'arquivo_sem_gravacao_necessaria',id:foto,version:identico.arquivos[foto].version,motivo:'conteudo_identico',dados:igual});
  assert.equal(identico.item.original.intencao.arquivos[foto].value,'mesma foto');
  // No proof: an unread table, or a row this device never knew, stays under review.
  for(const base of [{},{integracao_arquivos:[linha(igual,foto)]}]){
   fecharArquivos();persist.clear();await abrirArquivos({erpRef:CONTA},{integracao_arquivos:[]},storage);await agendarArquivo(foto,'rascunho');await agendarArquivo(foto,null);
   const a=await prepararArmazenamento({base,bindings:[]},{},capturarArquivos());
   assert.deepEqual([a.operations,a.identicos],[[],{}]);
  }
  const semProva=novaFila(),pedido=await versao(semProva.fila,1,{id:foto,key:foto,value:null,expected:null});
  assert.equal(await rodar(semProva.fila,{conta:CONTA,dono:'worker',sessaoAtual:()=>true,preparar:async()=>({operacoes:[],sent:{[foto]:pedido.original.intencao.arquivos[foto]},identicos:{}})}),'ERRO INTENCAO_SEM_OPERACOES');
  assert.equal(semProva.ler(pedido.id).estado,'bloqueado_validacao');
  // A forged or mismatched proof is not accepted either.
  const reservado={...semProva.ler(pedido.id),fase:'preparacao'},sent={[foto]:pedido.original.intencao.arquivos[foto]};
  assert.ok(provaArquivoSemGravacao(reservado,{operacoes:[],sent,identicos:{[foto]:{version:'ver1',motivo:'remocao_sem_registro'}}}));
  for(const pronto of [{operacoes:[{}],sent,identicos:{[foto]:{version:'ver1',motivo:'remocao_sem_registro'}}},{operacoes:[],sent,identicos:{[foto]:{version:'outra',motivo:'remocao_sem_registro'}}},{operacoes:[],sent,identicos:{[foto]:{version:'ver1',motivo:'conteudo_identico',dados:igual}}},{operacoes:[],sent:{[foto]:{...sent[foto],expected:igual}},identicos:{[foto]:{version:'ver1',motivo:'remocao_sem_registro'}}}])
   assert.equal(provaArquivoSemGravacao(reservado,pronto),null);
  assert.equal(provaArquivoSemGravacao({...reservado,tentativasTotais:1},{operacoes:[],sent,identicos:{[foto]:{version:'ver1',motivo:'remocao_sem_registro'}}}),null);
  // Already parked on a device: one new preparation after the update, never a loop.
  const nova=semProva.abrir();
  assert.equal((await nova.listar(CONTA))[0].estado,'pendente_local');
  assert.equal(await rodar(nova,{conta:CONTA,dono:'worker',sessaoAtual:()=>true,preparar:async()=>({operacoes:[],sent,identicos:{}})}),'ERRO INTENCAO_SEM_OPERACOES');
  await nova.fechar();
  assert.equal((await semProva.abrir().listar(CONTA))[0].estado,'bloqueado_validacao');
 }finally{fecharArquivos();definirSessao(null);globalThis.fetch=fetchOriginal;}
});

test('conflito de arquivo cujo conteúdo exato já está no servidor encerra com prova de bytes, sem recibo e sem reenvio',async()=>{
 const f=novaFila(),s=servidor(OUTRA),a=await versao(f.fila,1);
 assert.equal(await rodar(f.fila,s.callbacks(f.fila)),'ERRO PT409');
 const dados=meta('v1'),bytes=new TextEncoder().encode('v1'),ler=async()=>bytes.buffer;
 assert.equal(await arquivoPresenteIdentico([linha(dados)],fid,dados,bytes,ler),true);
 for(const rows of [[],[linha(dados),linha(dados)],[linha(OUTRA)],[{...linha(dados),colecao:'outra'}],null])assert.equal(await arquivoPresenteIdentico(rows,fid,dados,bytes,ler),false);
 assert.equal(await arquivoPresenteIdentico([linha(dados)],fid,dados,bytes,async()=>new TextEncoder().encode('v2').buffer),false);
 assert.equal(await arquivoPresenteIdentico([linha(dados)],fid,dados,bytes,async()=>{throw Error('offline')}),false);
 await assert.rejects(arquivoPresenteIdentico([linha(dados)],fid,dados,bytes,async()=>{throw Object.assign(Error('sessão'),{status:401})}),{status:401});
 // A proof for other metadata is refused and the conflict stays for review.
 const reconciliar=prova=>reconciliarIntencaoMetas(f.fila,{conta:CONTA,dono:'worker',sessaoAtual:()=>true,provar:async()=>prova&&{prova}});
 assert.equal(await reconciliar({tipo:'arquivo_ja_presente_no_servidor',id:fid,version:'ver1',dados:OUTRA}),false);
 assert.equal(f.ler(a.id).estado,'bloqueado_conflito');
 assert.equal(await reconciliar(null),null,'a mesma leitura não é repetida antes do intervalo');
 // Through the journal: the current row and bytes are read, then the same version leaves the auxiliary queue.
 f.relogio.agora+=120000;s.dados=dados;const conferidos=[],concluidos=[],relogio=Date.now;Date.now=()=>f.relogio.agora;
 const diario=criarDiarioCompartilhado({conta:CONTA,fila:f.fila,ativo:()=>true,atualizou:()=>{},carregar:async()=>({db:{},base:{integracao_arquivos:[linha(s.dados)]}}),
  preparar:async()=>assert.fail('não preparar de novo'),enviar:async()=>assert.fail('não reenviar'),consultarRecibo:async()=>assert.fail('sem recibo a consultar'),confirmar:async()=>assert.fail('sem releitura de recibo'),
  conferirArquivo:async(rows,id,d,b)=>{conferidos.push(id);return arquivoPresenteIdentico(rows,id,d,b,ler);},concluirArquivos:async(sent,base)=>{concluidos.push([sent,base]);}});
 try{
  await diario.executar();
  const item=f.ler(a.id);
  assert.equal(item.estado,'dispensado');assert.deepEqual(item.decisao.prova,{tipo:'arquivo_ja_presente_no_servidor',id:fid,version:'ver1',dados});
  assert.equal(item.recibo,undefined);assert.equal(s.envios,1);assert.deepEqual(conferidos,[fid]);
  assert.deepEqual(concluidos,[[{[fid]:item.original.intencao.arquivos[fid]},{integracao_arquivos:[linha(dados)]}]]);
 }finally{Date.now=relogio;diario.fechar();}
});

test('edição de dados que carrega o mesmo arquivo entre duas versões não cria espera circular',async()=>{
 const f=novaFila(),id='kml-n1',key='integracao-kml-v1-n1',EK=meta('kml base',key);
 const a=await versao(f.fila,1,{id,key,expected:EK});
 // Pedido misto: edição de dados que leva o mesmo arquivo; depende de A, e C dependerá dele.
 const b=await f.fila.enfileirar({conta:CONTA,id:'pedido-misto',unidade:'["nucleos","n1"]',recursos:['["nucleos","n1"]','arquivo:'+id],modulo:'nucleos',operacoes:[],preparar:true,base:{},
  intencao:{edicoes:[{colecao:'nucleos',id:'n1',antes:{existe:true,valor:{id:'n1',nome:'a'}},depois:{existe:true,valor:{id:'n1',nome:'b'}}}],arquivos:{[id]:{key,value:'v-misto',version:'ver-misto',expected:EK}}}});
 const c=await versao(f.fila,3,{id,key,expected:EK});
 // Enquanto houver pedido vivo, algum precisa ser elegível, e todos terminam em ordem.
 const ordem=[];
 for(let n=0;n<6;n++){
  const r=await f.fila.reservar(CONTA,{dono:'worker'});
  if(!r)break;
  ordem.push(r.id);f.editar(r.id,x=>{x.estado='confirmado';x.leaseAte=0;x.dono=null;});
 }
 const restantes=(await f.fila.listar(CONTA)).filter(i=>!['confirmado','substituido','dispensado'].includes(i.estado)).map(i=>i.id);
 assert.deepEqual(restantes,[],'nenhum pedido fica esperando para sempre: '+ordem.join('>'));
 assert.ok(ordem.indexOf(b.id)<ordem.indexOf(c.id),'o pedido misto anda antes da versão que depende dele');
 assert.ok(ordem.includes(a.id)||(await f.fila.listar(CONTA)).find(i=>i.id===a.id).estado==='substituido');
});

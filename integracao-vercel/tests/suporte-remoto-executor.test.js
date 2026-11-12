import test from 'node:test';
import assert from 'node:assert/strict';
import {criarApiSuporte,SUPORTE_REMOTO_HABILITADO} from '../src/suporte-remoto-api.js';
import {criarExecutorSuporte,sanitizarResultadoSuporte,atualizarSuporteComSeguranca} from '../src/suporte-remoto-executor.js';
import {obterVinculoSuporte} from '../src/suporte-remoto-vinculo.js';
import {configERP} from '../src/dados-compartilhados.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const privado='CPF 123.456.789-00 renda segredo token';
const item={id:id(7),pedido:id(7),estado:'confirmado_aguardando_leitura',codigo:'LEITURA_DIVERGENTE',fase:'releitura',tentativas:2,temRecibo:true,dependencias:[id(8)],restricao:null,espera:'retomada_manual'};
function fixture({tipo='diagnostico',pedido=null,patch={},aoChamar=async()=>{},aoExecutar=async()=>{}}={}){
 let tempo=10000,geracao=0,online=true,visivel=true,pronto=true,execucoes=0,avisos=0;
 const controller=new AbortController(),calls=[];
 const comando={id:id(4),usuario_id:id(1),instalacao_id:id(2),tipo,pedido,expira_em:new Date(tempo+300000).toISOString(),...patch};
 const capturarSessao=()=>{const gen=geracao;return {owner:id(1),signal:controller.signal,conferir:()=>{if(geracao!==gen)throw Object.assign(Error(privado),{code:'SESSAO_ALTERADA'});}};};
 const api={chamar:async(acao,args,options)=>{
  calls.push({acao,args:structuredClone(args),signal:options?.signal});await aoChamar(acao,args,ctx);
  return acao==='contatar'?{habilitado:true}:acao==='receber'?{habilitado:true,comando}:acao==='autorizar'||acao==='validar_execucao'?{autorizado:true}:{aceito:true};
 }};
 const sync={diagnosticoPronto:()=>pronto,executarSuporte:async(c,conferir,revalidar)=>{
  execucoes++;conferir();await revalidar();conferir();await aoExecutar(ctx,c);
  return {codigo:c.tipo==='solicitar_atualizacao'?'ATUALIZACAO_SOLICITADA':'DIAGNOSTICO',itens:[{...item,payload:{cpf:privado},message:privado}]};
 }};
 const executor=criarExecutorSuporte({usuario:{erpRef:id(1)},habilitado:true,api,sync,capturarSessao,obterVinculo:async()=>({conta:id(1),instalacao_id:id(2),prova_instalacao:'a'.repeat(64)}),diagnosticoInstalacao:id(9),consumidor:id(3),agora:()=>tempo,ambiente:()=>online&&visivel,onAtualizacao:()=>avisos++});
 const ctx={executor,api,sync,capturarSessao,comando,calls,controller,get execucoes(){return execucoes;},get avisos(){return avisos;},get tempo(){return tempo;},set tempo(v){tempo=v;},trocar:()=>geracao++,offline:()=>online=false,ocultar:()=>visivel=false,indisponivel:()=>pronto=false};
 return ctx;
}

test('suporte desativado por padrão não faz rede nem captura sessão',async()=>{
 assert.equal(SUPORTE_REMOTO_HABILITADO,false);
 let rede=0,capturas=0,vinculos=0;
 const api=criarApiSuporte({habilitado:false,requisitar:async()=>{rede++;}});
 assert.deepEqual(await api.capacidade(),{operador:false,habilitado:false});
 await assert.rejects(api.listar(),{code:'SUPORTE_DESATIVADO'});
 const worker=criarExecutorSuporte({usuario:id(1),api,sync:{diagnosticoPronto:()=>true},capturarSessao:()=>{capturas++;},obterVinculo:()=>{vinculos++;}});
 assert.equal(await worker.passo(),null);assert.equal(rede,0);assert.equal(capturas,0);assert.equal(vinculos,0);
});
test('API usa somente a RPC fixa e não propaga mensagem, detalhes ou cause',async()=>{
 const requests=[],controller=new AbortController();
 const api=criarApiSuporte({habilitado:true,requisitar:async(path,options)=>{requests.push({path,...options});return {ok:true};}});
 await api.chamar('contatar',{instalacao_id:id(2)},{signal:controller.signal});
 assert.equal(requests[0].path,'rpc/integracao_suporte_operar');assert.equal(requests[0].method,'POST');assert.equal(requests[0].signal,controller.signal);
 assert.deepEqual(JSON.parse(requests[0].body),{acao:'contatar',args:{instalacao_id:id(2)}});
 await assert.rejects(api.chamar('sql',{query:'delete'}),{code:'SUPORTE_RECUSADO'});assert.equal(requests.length,1);
 for(const e of [Object.assign(Error(privado),{status:403,details:privado}),new Error(privado,{cause:Error(privado)})]){
  const fail=criarApiSuporte({habilitado:true,requisitar:async()=>{throw e;}});
  await assert.rejects(fail.listar(),x=>!x.message.includes(privado)&&!JSON.stringify(x).includes(privado)&&!Object.hasOwn(x,'cause'));
 }
});
test('sem IndexedDB recuperável o vínculo não usa fallback e o executor não registra dispositivo',async()=>{
 const f=fixture();await assert.rejects(obterVinculoSuporte(id(1),{indexedDB:null,capturarSessao:f.capturarSessao}),{code:'PERSISTENCIA_INDISPONIVEL'});
 let rede=0;
 const worker=criarExecutorSuporte({usuario:id(1),habilitado:true,sync:f.sync,api:{chamar:async()=>{rede++;}},capturarSessao:f.capturarSessao,obterVinculo:async()=>{throw Object.assign(Error(privado),{code:'PERSISTENCIA_INDISPONIVEL'});}});
 assert.equal(await worker.passo(),null);assert.equal(rede,0);
 const g=fixture(),w=criarExecutorSuporte({usuario:id(1),habilitado:true,sync:g.sync,api:g.api,capturarSessao:g.capturarSessao,obterVinculo:async()=>{g.trocar();return {conta:id(1),instalacao_id:id(2),prova_instalacao:'a'.repeat(64)};}});
 assert.equal(await w.passo(),null);assert.equal(g.calls.length,0);
});
test('transporte real do suporte recusa configuração sem HTTPS antes de usar a sessão',async()=>{
 const anterior=configERP.url;
 try{configERP.url='http://example.invalid';await assert.rejects(criarApiSuporte({habilitado:true}).chamar('contatar',{prova_instalacao:'a'.repeat(64)}),{code:'SUPORTE_RECUSADO'});}
 finally{configERP.url=anterior;}
});
test('diagnóstico exportado tem esquema positivo sem payload, recibo ou mensagens',()=>{
 const r=sanitizarResultadoSuporte({codigo:'DIAGNOSTICO',payload:privado,itens:[{...item,restricao:'nome privado',dependencias:[id(8),privado],message:privado,original:{cpf:privado},recibo:{cpf:privado}},{...item,id:privado}]});
 assert.deepEqual(r,{codigo:'DIAGNOSTICO',itens:[{...item,dependencias:[id(8)],restricao:null}]});
 assert.doesNotMatch(JSON.stringify(r),/CPF|renda|segredo|token|message|original|recibo|payload/);
 assert.equal(sanitizarResultadoSuporte({codigo:privado}).codigo,'RESULTADO_INCERTO');
});
test('worker executa só alvo autorizado e inclui signal em todas as chamadas',async()=>{
 const f=fixture();const r=await f.executor.passo();assert.equal(r.estado,'concluida');assert.equal(f.execucoes,1);
 assert.deepEqual(f.calls.map(c=>c.acao),['contatar','receber','autorizar','validar_execucao','validar_execucao','concluir']);
 for(const c of f.calls)assert.equal(c.signal,f.controller.signal);
 const ack=f.calls.at(-1).args;assert.equal(ack.id,f.comando.id);assert.equal(ack.instalacao_id,id(2));assert.equal(ack.consumidor,id(3));assert.equal(ack.resultado.codigo,'DIAGNOSTICO');
 assert.equal(f.calls[0].args.diagnostico_instalacao_id,id(9));assert.equal(f.calls[0].args.instalacao_id,id(2));
 for(const c of f.calls)assert.equal(c.args.prova_instalacao,'a'.repeat(64));
 assert.equal(Object.hasOwn(ack.resultado,'prova_instalacao'),false);
 assert.doesNotMatch(JSON.stringify(ack),/CPF|segredo|message|payload/);
 assert.equal(await f.executor.passo(),null);assert.equal(f.execucoes,1,'mesmo comando nunca executa outra vez');
});
test('troca de conta em cada await interrompe efeitos e não relata na nova conta',async()=>{
 for(const etapa of ['contatar','receber','autorizar','validar_execucao','acao','concluir']){
  const f=fixture({tipo:'solicitar_atualizacao',aoChamar:async(a,args,c)=>{if(a===etapa)c.trocar();},aoExecutar:async c=>{if(etapa==='acao')c.trocar();}});
  assert.equal(await f.executor.passo(),null,etapa);assert.equal(f.avisos,0,etapa);
  if(['contatar','receber','autorizar','validar_execucao'].includes(etapa))assert.equal(f.execucoes,0,etapa);
  if(etapa!=='concluir')assert.equal(f.calls.filter(c=>c.acao==='concluir').length,0,etapa);
 }
});
test('expiração, sinal abortado, aba oculta, offline e aplicação sem diário impedem execução',async()=>{
 for(const alterar of [f=>f.tempo=Date.parse(f.comando.expira_em),f=>f.controller.abort(),f=>f.ocultar(),f=>f.offline(),f=>f.indisponivel()]){
  const f=fixture();alterar(f);await f.executor.passo();assert.equal(f.execucoes,0);
 }
 for(const etapa of ['contatar','receber','autorizar','validar_execucao']){
  const f=fixture({aoChamar:async(a,args,c)=>{if(a===etapa)c.tempo=Date.parse(c.comando.expira_em);}});
  await f.executor.passo();assert.equal(f.execucoes,0,etapa);
 }
 const f=fixture({aoChamar:async(a,args,c)=>{if(a==='autorizar')c.ocultar();}});await f.executor.passo();assert.equal(f.execucoes,0);
});
test('IDs de outra conta/instalação, pedidos ausentes e ação genérica são recusados antes de autorizar',async()=>{
 for(const patch of [{usuario_id:id(9)},{instalacao_id:id(9)},{id:'invalido'},{tipo:'sql',payload:privado},{tipo:'consultar_recibo',pedido:null},{tipo:'reler_confirmacao',pedido:privado}]){
  const f=fixture({patch});await f.executor.passo();assert.equal(f.execucoes,0);assert.equal(f.calls.some(c=>c.acao==='autorizar'),false);
 }
});
test('autorização com resposta perdida não é repetida e não executa',async()=>{
 const f=fixture({aoChamar:async a=>{if(a==='autorizar')throw Error(privado);}});
 assert.equal(await f.executor.passo(),null);assert.equal(await f.executor.passo(),null);assert.equal(f.execucoes,0);
 assert.equal(f.calls.filter(c=>c.acao==='autorizar').length,1);assert.equal(f.calls.filter(c=>c.acao==='concluir').length,0);
});
test('revogação entre autorizar e efeito impede execução e registra só código técnico',async()=>{
 const f=fixture({aoChamar:async a=>{if(a==='validar_execucao')throw Object.assign(Error(privado),{code:'SUPORTE_RECUSADO'});}});
 const r=await f.executor.passo();assert.equal(f.execucoes,0);assert.equal(r.estado,'negada');assert.equal(r.resultado.codigo,'REVISAO_NECESSARIA');
 assert.doesNotMatch(JSON.stringify(f.calls.at(-1).args),/CPF|segredo|message|details/);
});
test('efeito ou confirmação com resposta perdida não geram novo efeito nem confirmação diferente',async()=>{
 for(const etapa of ['acao','concluir']){
  const f=fixture({aoChamar:async a=>{if(etapa==='concluir'&&a==='concluir')throw Error(privado);},aoExecutar:async()=>{if(etapa==='acao')throw Error(privado);}});
  const r=await f.executor.passo();assert.equal(r.estado,'resultado_incerto');assert.equal(r.resultado.codigo,'RESULTADO_INCERTO');
  await f.executor.passo();assert.equal(f.execucoes,1);assert.equal(f.calls.filter(c=>c.acao==='concluir').length,1);
 }
});
test('passos simultâneos e encerramento não iniciam execução concorrente',async()=>{
 let liberar;const gate=new Promise(r=>liberar=r);const f=fixture({aoChamar:async a=>{if(a==='contatar')await gate;}});
 const primeiro=f.executor.passo();assert.equal(await f.executor.passo(),null);assert.equal(f.calls.length,1);
 f.executor.fechar();liberar();assert.equal(await primeiro,null);assert.equal(f.execucoes,0);assert.equal(await f.executor.passo(),null);
});
test('recusa durante o efeito ou no ACK não prova que o efeito foi negado',async()=>{
 for(const etapa of ['acao','concluir']){
  const falha=()=>{throw Object.assign(Error(privado),{code:'SUPORTE_RECUSADO',status:403});};
  const f=fixture({aoChamar:async a=>{if(a===etapa)falha();},aoExecutar:async()=>{if(etapa==='acao')falha();}});
  const r=await f.executor.passo();assert.equal(r.estado,'resultado_incerto');assert.equal(r.resultado.codigo,'RESULTADO_INCERTO');
  await f.executor.passo();assert.equal(f.execucoes,1);assert.equal(f.calls.filter(c=>c.acao==='concluir').length,1);
 }
});
test('ACK recusado por lease/cancelamento não confirma sucesso nem exibe aviso de atualização',async()=>{
 const f=fixture({tipo:'solicitar_atualizacao'}),chamar=f.api.chamar;
 f.api.chamar=async(a,args,o)=>a==='concluir'?{aceito:false,estado:'resultado_incerto'}:chamar(a,args,o);
 const r=await f.executor.passo();assert.equal(r.estado,'resultado_incerto');assert.equal(r.resultado.codigo,'RESULTADO_INCERTO');assert.equal(f.avisos,0);assert.equal(f.execucoes,1);
 await f.executor.passo();assert.equal(f.execucoes,1);
});
test('solicitação de atualização apenas avisa e recarga exige uma ação local segura',async()=>{
 const f=fixture({tipo:'solicitar_atualizacao'});await f.executor.passo();assert.equal(f.avisos,1);
 let reloads=0,preparacoes=0;
 assert.equal(await atualizarSuporteComSeguranca({owner:id(1),sync:{prepararAtualizacaoSuporte:async()=>{preparacoes++;return true;}},capturarSessao:f.capturarSessao,emEdicao:()=>true,recarregar:()=>reloads++}),false);
 assert.equal(preparacoes,0);assert.equal(reloads,0);
 let editando=false;
 assert.equal(await atualizarSuporteComSeguranca({owner:id(1),sync:{prepararAtualizacaoSuporte:async()=>{editando=true;return true;}},capturarSessao:f.capturarSessao,emEdicao:()=>editando,recarregar:()=>reloads++}),false);
 await assert.rejects(atualizarSuporteComSeguranca({owner:id(1),sync:{prepararAtualizacaoSuporte:async()=>{f.trocar();return true;}},capturarSessao:f.capturarSessao,emEdicao:()=>false,recarregar:()=>reloads++}),{code:'SESSAO_ALTERADA'});
 assert.equal(reloads,0);
 const g=fixture();assert.equal(await atualizarSuporteComSeguranca({owner:id(1),sync:{prepararAtualizacaoSuporte:async()=>false},capturarSessao:g.capturarSessao,emEdicao:()=>false,recarregar:()=>reloads++}),false);
 assert.equal(await atualizarSuporteComSeguranca({owner:id(1),sync:{prepararAtualizacaoSuporte:async()=>true},capturarSessao:g.capturarSessao,emEdicao:()=>false,recarregar:()=>reloads++}),true);assert.equal(reloads,1);
});

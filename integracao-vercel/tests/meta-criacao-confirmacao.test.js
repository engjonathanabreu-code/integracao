import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {criarConfirmacaoMeta,emSegundoPlano,MENSAGEM_SEGUNDO_PLANO,camposAlterados} from '../src/confirmacao-criacao-meta.js';
import {errosVisiveisMeta} from '../src/interface-regras.js';
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function ModalMetaERP('),source.indexOf('function ModalDetalheMeta('));
const compiled=transformSync(code,{loader:'jsx',jsx:'transform'}).code;
function harness(){
 const states=[],refs=[];let si=0,ri=0,seq=0;
 const c={db:{metas:[],usuarios:[],setoresMeta:[]},toasts:[],closed:0,requests:[],creations:0,retries:0,extras:[]};
 const wait=()=>new Promise((resolve,reject)=>c.requests.push({resolve,reject}));
 const mutar=()=>{throw Error('Produção não deve usar mutação otimista');};
 mutar.confirmado=(fn,acao,extra)=>{c.creations++;c.extras.push(extra);c.db=fn(structuredClone(c.db));return wait();};
 const empty=()=>null;
 const deps={errosVisiveisMeta,confirmarSaidaEdicao:()=>true,criarConfirmacaoMeta,emSegundoPlano,MENSAGEM_SEGUNDO_PLANO,camposAlterados,AMBIENTE:{DEMO:false},React:{createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'fragment'},
 useState:initial=>{const n=si++;if(!(n in states)){states[n]=typeof initial==='function'?initial():initial;if(n===0)states[n]={...states[n],titulo:'Meta teste',responsaveis:['destinatario']};}return [states[n],v=>states[n]=typeof v==='function'?v(states[n]):v];},useRef:initial=>refs[ri++]??(refs[ri-1]={current:initial}),
 semanaISO:()=> '2026-11-16',podeUsarAgentes:()=>false,uid:()=>String(++seq),dataBR:String,rotuloAssociacao:()=>'',registrarHistoricoMeta:()=>{},novaNotificacao:()=>{},
 Modal:empty,Plus:empty,Trash2:empty,SeletorIcone:empty,sugerirIcone:()=>'',META_STATUS:[],ASSOC_TIPOS:[],setoresUnicos:()=>[]};
 const Component=new Function('deps',`const {${Object.keys(deps)}}=deps;${compiled};return ModalMetaERP;`)(deps);
 c.render=()=>{si=0;ri=0;return Component({db:c.db,meta:null,usuario:{id:'autor',nome:'Teste'},mutar,setToast:x=>c.toasts.push(x),onFechar:()=>c.closed++});};
 c.save=()=>c.render().props.rodape.props.children[1].props.onClick();
 c.reject=()=>{const e=Error('Sem confirmação');e.retentarConfirmacao=()=>{c.retries++;return wait();};c.requests.shift().reject(e);};
 return c;
}
test('formulário real não anuncia sucesso nem fecha antes da confirmação; clique duplo cria uma vez',async()=>{
 const c=harness(),p=c.save();await c.save();await Promise.resolve();assert.equal(c.creations,1);assert.deepEqual(c.toasts,[]);assert.equal(c.closed,0);c.requests.shift().resolve();await p;assert.equal(c.closed,1);assert.match(c.toasts[0],/Gravação confirmada/);assert.equal(c.db.metas.length,1);
});
test('falha mantém formulário e retoma mesma intenção sem recriar meta',async()=>{
 const c=harness(),p=c.save();await Promise.resolve();c.reject();await p;assert.equal(c.closed,0);assert.deepEqual(c.toasts,[]);const view=c.render();assert.equal(view.props.rodape.props.children[1].props.children[0],'Confirmar mesmo pedido');const again=c.save();await Promise.resolve();assert.equal(c.retries,1);assert.equal(c.creations,1);c.requests.shift().resolve();await again;assert.equal(c.db.metas.length,1);assert.equal(c.closed,1);
});
test('erro sem retomada não reaplica criação e continua visível',async()=>{
 let n=0;const error=Error('Sessão indisponível'),attempt=criarConfirmacaoMeta(()=>{n++;throw error;});await assert.rejects(attempt.executar(),/Sessão/);assert.equal(attempt.podeRetentar(),false);await assert.rejects(attempt.executar(),/Sessão/);assert.equal(n,1);
});
test('confirmação concorrente compartilha tentativa; confirmação concluída nunca reenvia',async()=>{
 let n=0,resolve;const attempt=criarConfirmacaoMeta(()=>{n++;return new Promise(r=>resolve=r);});const a=attempt.executar(),b=attempt.executar();assert.equal(a,b);await Promise.resolve();resolve();await a;await attempt.executar();assert.equal(n,1);
});
test('falha comprovadamente pré-envio permite reconectar e enviar uma única criação',async()=>{
 let calls=0,online=false,writes=0;const attempt=criarConfirmacaoMeta(()=>{calls++;if(!online)throw Object.assign(Error('Offline'),{code:'SEM_CONEXAO'});writes++;});await assert.rejects(attempt.executar(),/Offline/);assert.equal(attempt.naoEnviada(),true);assert.equal(attempt.podeRetentar(),true);online=true;await attempt.executar();assert.equal(calls,2);assert.equal(writes,1);
});
test('erro após envio com mesmo código usa somente callback de confirmação',async()=>{
 let creates=0,retries=0;const attempt=criarConfirmacaoMeta(()=>{creates++;throw Object.assign(Error('Offline depois'),{code:'SEM_CONEXAO',retentarConfirmacao:()=>{retries++;}});});await assert.rejects(attempt.executar());assert.equal(attempt.naoEnviada(),false);await attempt.executar();assert.equal(creates,1);assert.equal(retries,1);
});
test('formulário não pode ser fechado enquanto criação aguarda confirmação',async()=>{
 const c=harness(),p=c.save();await Promise.resolve();const view=c.render();view.props.onFechar();assert.equal(c.closed,0);assert.equal(view.props.rodape.props.children[0].props.disabled,true);c.requests.shift().resolve();await p;assert.equal(c.closed,1);
});

test('ponte real sem sessão pronta identifica falha pré-envio e permite tentar após conexão',async()=>{
 const start=source.indexOf('  mutar.confirmado = (fn,acao,extra={},opcoes) => {');
 const end=source.indexOf('\n  };',start)+5;
 assert.ok(start>0&&end>start);
 let ready=false,writes=0;const mutar={};
 const compartilhado={ready:()=>ready,mutateConfirmed:async()=>{writes++;}};
 new Function('mutar','AMBIENTE','compartilhado','entrada',source.slice(start,end))(mutar,{DEMO:false},compartilhado,()=>({}));
 const attempt=criarConfirmacaoMeta(()=>mutar.confirmado(()=>{},'Meta criada'));
 await assert.rejects(attempt.executar(),{code:'SESSAO_ENCERRADA'});
 assert.equal(writes,0);assert.equal(attempt.naoEnviada(),true);assert.equal(attempt.podeRetentar(),true);
 ready=true;await attempt.executar();assert.equal(writes,1);
});

test('C6: timeout em segundo plano fecha sem erro, sem "Gravação confirmada" e sem nova criação',async()=>{
 const c=harness(),p=c.save();await Promise.resolve();
 const e=Object.assign(Error(MENSAGEM_SEGUNDO_PLANO),{code:'CONFIRMACAO_SEGUNDO_PLANO',segundoPlano:true,retentarConfirmacao:()=>{c.retries++;return new Promise(()=>{});}});
 c.requests.shift().reject(e);await p;
 assert.equal(c.closed,1);assert.deepEqual(c.toasts,[MENSAGEM_SEGUNDO_PLANO]);assert.doesNotMatch(c.toasts.join(' '),/Gravação confirmada/);
 assert.equal(c.creations,1);assert.equal(c.db.metas.length,1);
});
test('C6: idOperacao e id da meta nova são gerados ao abrir e reutilizados na nova tentativa',async()=>{
 const c=harness(),p=c.save();await Promise.resolve();
 const id=c.extras[0]?.id,metaId=c.db.metas[0].id;assert.ok(id,'a criação leva o idOperacao do formulário');
 c.reject();await p;
 // Nova renderização do mesmo formulário mantém as mesmas identidades.
 c.render();assert.equal(c.db.metas[0].id,metaId);assert.equal(c.extras.length,1);
});
test('C6: camposAlterados compara com os valores de abertura do formulário',()=>{
 assert.deepEqual(camposAlterados({titulo:'a',status:'x',responsaveis:['u']},{titulo:'a',status:'y',responsaveis:['u']}),{status:true});
 assert.deepEqual(camposAlterados({devolutiva:null},{devolutiva:null}),{});
 assert.equal(emSegundoPlano({code:'CONFIRMACAO_TIMEOUT'}),false);
});

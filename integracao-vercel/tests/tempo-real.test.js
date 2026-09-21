import test from 'node:test';import assert from 'node:assert/strict';import {conectarTempoReal} from '../src/tempo-real.js';import {falhaTransitoria,gruposDasOperacoes,tabelasDosGrupos} from '../src/sincronizacao-regras.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('WebSocket autentica, recebe só revisões, renova token, reconecta e fecha',async()=>{
 const sockets=[],timers=new Map();let seq=0,jwt='token1';const changes=[],states=[];
 class WS{constructor(url){this.url=url;this.sent=[];sockets.push(this);}send(m){this.sent.push(JSON.parse(m));}close(){this.closed=true;}emit(m){this.onmessage?.({data:JSON.stringify(m)});}}
 const c=conectarTempoReal({url:'https://example.supabase.co',chave:'publica',token:async()=>jwt,alterou:m=>changes.push(m),estado:s=>states.push(s),WebSocketImpl:WS,setTimer:(f,t)=>{const id=++seq;timers.set(id,{f,t});return id;},clearTimer:id=>timers.delete(id)});
 await tick();const s=sockets[0];s.onopen();const join=s.sent[0];assert.equal(join.payload.access_token,'token1');assert.deepEqual(join.payload.config.postgres_changes,[{event:'UPDATE',schema:'public',table:'integracao_revisoes'}]);
 s.emit({topic:join.topic,event:'phx_reply',ref:join.ref,payload:{status:'ok'}});s.emit({topic:join.topic,event:'system',payload:{status:'ok'}});assert.equal(states.at(-1),'conectado');assert.deepEqual(changes,[null]);
 s.emit({topic:join.topic,event:'postgres_changes',payload:{data:{record:{modulo:'metas',versao:2}}}});assert.equal(changes.at(-1),'metas');
 jwt='token2';const [pulseId,pulse]=[...timers.entries()].find(([,t])=>t.t===20000);timers.delete(pulseId);await pulse.f();assert.ok(s.sent.some(m=>m.event==='access_token'&&m.payload.access_token==='token2'));const beat=s.sent.at(-1);s.emit({topic:'phoenix',event:'phx_reply',ref:beat.ref});
 s.onclose();assert.equal(states.at(-1),'reconectando');c.fechar();assert.equal(timers.size,0);assert.equal(states.at(-1),'desconectado');
});
test('falhas de conexão podem ser repetidas; RLS, conflitos e autenticação exigem revisão',()=>{assert.equal(falhaTransitoria(new TypeError('rede')),true);for(const status of [429,500,503])assert.equal(falhaTransitoria({status}),true);for(const status of [400,401,403,409])assert.equal(falhaTransitoria({status}),false);assert.deepEqual(gruposDasOperacoes([{table:'metas'},{table:'meta_responsaveis'}]),['metas']);assert.ok(!tabelasDosGrupos(['metas']).includes('fin_receb_clientes'));});

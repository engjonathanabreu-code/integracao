import test from 'node:test';
import assert from 'node:assert/strict';
import {criarMonitorConexao} from '../src/conexao-rede.js';

const relogio=()=>{const r={agora:0,timers:[]};r.temporizar=(fn,ms)=>{const t={fn,em:r.agora+ms};r.timers.push(t);return t;};r.destemporizar=t=>{r.timers=r.timers.filter(x=>x!==t);};r.avancar=ms=>{r.agora+=ms;for(const t of r.timers.filter(t=>t.em<=r.agora)){r.timers=r.timers.filter(x=>x!==t);t.fn();}};return r;};

test('falha real de transporte marca servidor inacessível mesmo com navigator.onLine=true; primeiro sucesso limpa',async()=>{
 const r=relogio(),nav={onLine:true},mudancas=[];let sondas=0,falhaSonda=true;
 const m=criarMonitorConexao({navegador:nav,buscar:async()=>{sondas++;if(falhaSonda)throw new TypeError('Failed to fetch');return {status:204};},agendar:()=>1,cancelar:()=>{},agora:()=>r.agora,temporizar:r.temporizar,destemporizar:r.destemporizar,janelaFalhaMs:10000});
 const parar=m.observar(v=>mudancas.push(v));
 assert.equal(m.disponivel(),true);
 m.registrarFalhaTransporte();
 assert.equal(m.disponivel(),false,'falha de transporte deve ser sinal mesmo com onLine=true');
 await m.verificar();assert.ok(sondas>=1);
 assert.equal(m.disponivel(),false,'sonda falhou: continua inacessível dentro da janela');
 m.registrarSucessoTransporte();
 assert.equal(m.disponivel(),true,'primeiro sucesso limpa o sinal');
 assert.deepEqual(mudancas,[true,false,true]);
 parar();
});

test('janela de falha expira sozinha e republica, sem prender tentativas agendadas',async()=>{
 const r=relogio(),nav={onLine:true},mudancas=[];
 const m=criarMonitorConexao({navegador:nav,buscar:async()=>{throw new TypeError('Failed to fetch');},agendar:()=>1,cancelar:()=>{},agora:()=>r.agora,temporizar:r.temporizar,destemporizar:r.destemporizar,janelaFalhaMs:10000});
 const parar=m.observar(v=>mudancas.push(v));
 m.registrarFalhaTransporte();await m.verificar();
 assert.equal(m.disponivel(),false);
 r.avancar(10000);
 assert.equal(m.disponivel(),true,'janela limitada');
 assert.deepEqual(mudancas,[true,false,true],'expiração republica para retomar a fila');
 parar();
});

test('sonda /api/conexao não limpa falha contra o servidor de dados; só o sucesso do transporte ou a janela limpam',async()=>{
 const r=relogio(),alvo=new EventTarget(),nav={onLine:true};
 const m=criarMonitorConexao({navegador:nav,alvo,buscar:async()=>({status:204}),agendar:()=>1,cancelar:()=>{},agora:()=>r.agora,temporizar:r.temporizar,destemporizar:r.destemporizar});
 const parar=m.observar(()=>{});
 alvo.dispatchEvent(Object.assign(new Event('integracao:transporte'),{detail:{ok:false}}));
 assert.equal(m.disponivel(),false);
 // A sonda prova só o acesso à rede: publicar online aqui reabriria a fila em laço (achado do QA).
 await m.verificar();
 assert.equal(m.disponivel(),false);
 alvo.dispatchEvent(Object.assign(new Event('integracao:transporte'),{detail:{ok:true}}));
 assert.equal(m.disponivel(),true);
 parar();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import React from 'react';
import {parseHTML} from 'linkedom';
import {atalhoTrabalhoPessoal,diaTrabalho,filaTrabalhoPessoal,resumoTrabalhoPessoal} from '../src/trabalho-pessoal.js';
import {preparoEntregaPessoal} from '../src/preparo-entrega-pessoal.js';
const source=readFileSync(new URL('../src/PainelTrabalhoPessoal.jsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default ','');
const code=transformSync(source,{loader:'jsx',jsx:'transform'}).code;
const Componente=new Function('React','useEffect','useRef','useState','atalhoTrabalhoPessoal','diaTrabalho','filaTrabalhoPessoal','resumoTrabalhoPessoal','preparoEntregaPessoal',`${code};return PainelTrabalhoPessoal;`)(React,React.useEffect,React.useRef,React.useState,atalhoTrabalhoPessoal,diaTrabalho,filaTrabalhoPessoal,resumoTrabalhoPessoal,preparoEntregaPessoal);
for(const preparo of [false,true])for(const tipo of ['troca-id','troca-erpRef','desativacao',...(preparo?['retirada-atribuicao','conclusao']:[])])test(`${preparo?'preparo':'resumo'} fecha por identidade e ignora cópia tardia: ${tipo}`,async()=>{
 const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
 const anteriores={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolver;
 Object.assign(globalThis,{window,document:window.document,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'node',clipboard:{writeText:()=>new Promise(r=>{resolver=r})}}});
 const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');const root=createRoot(document.getElementById('root'));
 let metas=[{id:'meta',titulo:'Tarefa sintética A',status:'Em andamento',responsaveis:['a']}];
 const render=usuario=>root.render(React.createElement(Componente,{metas,usuario,ir:()=>{}}));
 const click=async label=>React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===label).dispatchEvent(new window.Event('click',{bubbles:true})));
 try{
  await React.act(async()=>render({id:'a',erpRef:'a',ativo:true}));
  await click(preparo?'Preparar entrega':'Preparar resumo de trabalho');await click(preparo?'Copiar preparo':'Copiar resumo');assert.equal(typeof resolver,'function');
  if(tipo==='retirada-atribuicao')metas=[{...metas[0],responsaveis:['outro']}];
  if(tipo==='conclusao')metas=[{...metas[0],status:'Concluído'}];
  const novo=tipo==='troca-id'?{id:'b',erpRef:'b',ativo:true}:tipo==='troca-erpRef'?{id:'a',erpRef:'b',ativo:true}:{id:'a',erpRef:'a',ativo:tipo!=='desativacao'};
  await React.act(async()=>{flushSync(()=>render(novo));assert.equal(document.querySelector('textarea'),null);});
  if(tipo!=='desativacao'&&!preparo)await click('Preparar resumo de trabalho');
  await React.act(async()=>resolver());
  assert.doesNotMatch(document.body.textContent,/Resumo copiado|Preparo copiado/);
  if(tipo==='troca-id'&&!preparo)assert.doesNotMatch(document.querySelector('textarea').value,/Tarefa sintética A/);
 }finally{await React.act(async()=>root.unmount());Object.assign(globalThis,anteriores);if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;}
});

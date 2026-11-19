import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import React from 'react';
import {parseHTML} from 'linkedom';
import {atalhoTrabalhoPessoal,diaTrabalho,filaTrabalhoPessoal,resumoTrabalhoPessoal} from '../src/trabalho-pessoal.js';
const source=readFileSync(new URL('../src/PainelTrabalhoPessoal.jsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default ','');
const code=transformSync(source,{loader:'jsx',jsx:'transform'}).code;
const Componente=new Function('React','useEffect','useState','atalhoTrabalhoPessoal','diaTrabalho','filaTrabalhoPessoal','resumoTrabalhoPessoal',`${code};return PainelTrabalhoPessoal;`)(React,React.useEffect,React.useState,atalhoTrabalhoPessoal,diaTrabalho,filaTrabalhoPessoal,resumoTrabalhoPessoal);
for(const tipo of ['troca-id','troca-erpRef','desativacao'])test(`resumo fecha por identidade e ignora cópia tardia: ${tipo}`,async()=>{
 const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
 const anteriores={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolver;
 Object.assign(globalThis,{window,document:window.document,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'node',clipboard:{writeText:()=>new Promise(r=>{resolver=r})}}});
 const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');const root=createRoot(document.getElementById('root'));
 const metas=[{id:'meta',titulo:'Tarefa sintética A',status:'Em andamento',responsaveis:['a']}];
 const render=usuario=>root.render(React.createElement(Componente,{metas,usuario,ir:()=>{}}));
 const click=async label=>React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===label).dispatchEvent(new window.Event('click',{bubbles:true})));
 try{
  await React.act(async()=>render({id:'a',erpRef:'a',ativo:true}));
  await click('Preparar resumo de trabalho');await click('Copiar resumo');assert.equal(typeof resolver,'function');
  const novo=tipo==='troca-id'?{id:'b',erpRef:'b',ativo:true}:tipo==='troca-erpRef'?{id:'a',erpRef:'b',ativo:true}:{id:'a',erpRef:'a',ativo:false};
  await React.act(async()=>{flushSync(()=>render(novo));assert.equal(document.querySelector('textarea'),null);});
  if(tipo!=='desativacao')await click('Preparar resumo de trabalho');
  await React.act(async()=>resolver());
  assert.doesNotMatch(document.body.textContent,/Resumo copiado/);
  if(tipo==='troca-id')assert.doesNotMatch(document.querySelector('textarea').value,/Tarefa sintética A/);
 }finally{await React.act(async()=>root.unmount());Object.assign(globalThis,anteriores);if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;}
});

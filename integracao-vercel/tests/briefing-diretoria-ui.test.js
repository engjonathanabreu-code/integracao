import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import React from 'react';
import {parseHTML} from 'linkedom';
import {prepararPauta,textoPauta} from '../src/briefing-diretoria.js';
const source=readFileSync(new URL('../src/BriefingDiretoria.jsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default ','');
const code=transformSync(source,{loader:'jsx',jsx:'transform'}).code;
const Componente=new Function('React','useMemo','useState','prepararPauta','textoPauta',`${code};return BriefingDiretoria;`)(React,React.useMemo,React.useState,prepararPauta,textoPauta);
test('fluxo real prepara/copia, informa falha e bloqueia dados obsoletos',async()=>{
 const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
 const previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copiado='';
 Object.assign(globalThis,{window,document:window.document,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'node',clipboard:{writeText:async texto=>{copiado=texto;}}}});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 const dados={setor:'juridico',painel:{hoje:'2026-11-19',metas:{abertas:0,pendencias:[]}}};
 const render=async indisponivel=>React.act(async()=>root.render(React.createElement(Componente,{dados,indisponivel})));
 const click=async label=>React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===label).dispatchEvent(new window.Event('click',{bubbles:true})));
 try {
  await render(false);assert.equal(document.querySelector('textarea'),null);
  await click('Preparar reunião de gestão');assert.match(document.querySelector('textarea').value,/juridico/);
  await click('Copiar pauta');assert.equal(copiado,document.querySelector('textarea').value);assert.match(document.querySelector('[role=status]').textContent,/copiada/);
  navigator.clipboard.writeText=async()=>{throw Error('permission');};await click('Copiar pauta');assert.match(document.querySelector('[role=status]').textContent,/Selecione e copie/);
  await render(true);assert.equal(document.querySelector('textarea'),null);assert(document.querySelector('button').disabled);
 } finally {await React.act(async()=>root.unmount());Object.assign(globalThis,previous);if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;}
});
test('pauta exige a resposta da consulta completa e nunca adiciona requisição',()=>{
 const panorama=readFileSync(new URL('../src/AgentesPanorama.jsx',import.meta.url),'utf8');
 assert.match(panorama,/consulta: `\$\{setor\}-\$\{paradoDias\}-\$\{recarga\}`/);
 assert.match(panorama,/estado\.consulta !== `\$\{setor\}-\$\{paradoDias\}-\$\{recarga\}`/);
 assert.doesNotMatch(source,/fetch\(|pedirAgentes|localStorage|sessionStorage/);
});

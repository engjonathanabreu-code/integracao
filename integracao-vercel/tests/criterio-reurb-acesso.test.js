import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {permissoes} from '../src/permissoes.js';
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function AbaRegrasMunicipio('), app.indexOf('function dataEntradaEtapaMorador('));
const code = transformSync(source, {loader:'jsx', jsx:'transform'}).code;
const Stub = ({children}) => React.createElement('div', null, children);
const deps = {React, useState:React.useState, useEffect:React.useEffect, permissoes,
  empresaDoMunicipio: db => db.empresa, ajustesDoMunicipio:(db,id)=>db.ajustesMunicipio?.[id],
  escopoRegrasMunicipio:db=>db, CHAVE_MODELO_PRF_MUN:'fixture-',
  Secao:Stub, Aviso:Stub, Tag:Stub, ConfigRegras:Stub, parseNum:Number};
const Regras = new Function(...Object.keys(deps), `${code}; return AbaRegrasMunicipio;`)(...Object.values(deps));
const props = {db:{empresa:{}, nucleos:[], ajustesMunicipio:{m1:{criterioREURB:{salarioMinimo:'1500',rendaMaxima:'4500'}}}}, municipio:{id:'m1',nome:'Município teste'}, mutar:()=>assert.fail('renderização não deve gravar'), setToast:()=>{}};
test('atalho do núcleo abre o editor municipal existente na aba de critério', () => {
  const nucleo = app.slice(app.indexOf('function PaginaNucleo('), app.indexOf('function PaginaNucleo(')+17000);
  assert.match(nucleo, /cad\.abrir\(\{ tipo: "criterio", municipio: m \}\)[^\n]*Critério REURB-S/);
  assert.match(app, /modal\.tipo === "criterio" \? <Modal[^\n]*onFechar=\{fechar\}[^\n]*<AbaRegrasMunicipio[^\n]*municipio=\{modal\.municipio\}[^\n]*abaInicial="criterio"/);
  assert.doesNotMatch(app, /Defina no cadastro do núcleo/);
});
test('administrador vê a aba e os valores municipais diretamente, sem gravação ao abrir', () => {
  const html=renderToStaticMarkup(React.createElement(Regras,{...props,usuario:{setor:'diretoria'},abaInicial:'criterio'}));
  assert.match(html,/aria-selected="true"[^>]*>Critério REURB/);
  assert.match(html,/id="municipio-sm"[^>]*value="1500"/);
  assert.match(html,/id="municipio-teto"[^>]*value="4500"/);
  assert.match(html,/Salvar critério municipal/);
  assert.doesNotMatch(html, /id="municipio-sm"[^>]*disabled/);
});
test('consulta conserva somente leitura no mesmo atalho', () => {
  const html=renderToStaticMarkup(React.createElement(Regras,{...props,usuario:{setor:'consulta'},abaInicial:'criterio'}));
  assert.match(html,/id="municipio-sm"[^>]*disabled/);
  assert.match(html,/id="municipio-teto"[^>]*disabled/);
  assert.doesNotMatch(html,/Salvar critério municipal/);
});
test('acesso municipal anterior continua iniciando na aba de IA', () => {
  const html=renderToStaticMarkup(React.createElement(Regras,{...props,usuario:{setor:'diretoria'}}));
  assert.match(html,/aria-selected="true"[^>]*>Regras da IA/);
  assert.doesNotMatch(html,/id="municipio-sm"/);
});

test('modal real abre, salva só o município correto e reabre sem reenquadrar moradores', async () => {
  const {parseHTML}=await import('linkedom');
  const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
  const previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
  Object.assign(globalThis,{window,document:window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client');
  const {act}=React;
  const sourceModal=app.slice(app.indexOf('function Modal({'),app.indexOf('function ModalMotivo('));
  const sourceHook=app.slice(app.indexOf('function useCadastros('),app.indexOf('/* ---------------- páginas da hierarquia'));
  const allDeps={...deps,useRef:React.useRef,X:Stub,armazenamento:{get:async()=>null}};
  const compiled=transformSync(sourceModal+'\n'+source+'\n'+sourceHook,{loader:'jsx',jsx:'transform'}).code;
  const useCadastros=new Function(...Object.keys(allDeps),`${compiled}; return useCadastros;`)(...Object.values(allDeps));
  const db=structuredClone(props.db);
  db.ajustesMunicipio.m2={criterioREURB:{salarioMinimo:'1000',rendaMaxima:'3000'}};
  db.nucleos=[{id:'n1',municipioId:'m1',criterio:{salarioMinimo:'900',rendaMaxima:'2700'}}];
  db.processos=[{id:'p1',municipioId:'m1',modalidade:'REURB-E'}];
  const before=JSON.stringify([db.nucleos,db.processos,db.ajustesMunicipio.m2]);
  let writes=0,metadata,open;
  function Harness(){
    const cad=useCadastros({...props,db,usuario:{setor:'diretoria',nome:'Teste'},mutar:(fn,acao,meta)=>{writes++;metadata=meta;fn(db);}});
    open=()=>cad.abrir({tipo:'criterio',municipio:props.municipio});
    return cad.elemento;
  }
  const root=createRoot(document.getElementById('root'));
  const click=async el=>act(async()=>el.dispatchEvent(new window.Event('click',{bubbles:true})));
  const change=async (id,value)=>act(async()=>{
    const input=document.getElementById(id);
    // linkedom does not synthesize React's native input event; exercise the mounted real handler.
    input[Object.keys(input).find(k=>k.startsWith('__reactProps'))].onChange({target:{value}});
  });
  try {
    await act(async()=>root.render(React.createElement(Harness)));
    await act(async()=>open());
    assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-label'),'Critério REURB-S — Município teste');
    assert.equal(document.querySelector('[aria-selected=true]').textContent,'Critério REURB');
    assert.equal(writes,0);
    await change('municipio-sm','1600');await change('municipio-teto','4800');
    await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar critério municipal'));
    assert.equal(writes,1);assert.equal(metadata.municipioId,'m1');
    assert.deepEqual(db.ajustesMunicipio.m1.criterioREURB,{salarioMinimo:'1600',rendaMaxima:'4800'});
    assert.equal(JSON.stringify([db.nucleos,db.processos,db.ajustesMunicipio.m2]),before);
    await click(document.querySelector('[aria-label=Fechar]'));
    assert.equal(document.querySelector('[role=dialog]'),null);
    await act(async()=>open());
    assert.equal(document.querySelector('[aria-selected=true]').textContent,'Critério REURB');
    assert.equal(document.getElementById('municipio-sm').value,'1600');
    assert.equal(document.getElementById('municipio-teto').value,'4800');
    assert.equal(writes,1);
  } finally {await act(async()=>root.unmount());Object.assign(globalThis,previous);}
});

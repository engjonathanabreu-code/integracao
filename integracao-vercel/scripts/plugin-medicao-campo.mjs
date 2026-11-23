import {readFile} from 'node:fs/promises';
// Adapt only the test fixture, in memory, identically in every checkout. Load
// raw JSX before React transforms it; production files remain untouched.
export function pluginMedicaoCampo(){
 return {name:'observar-commit-campo-fixture',enforce:'pre',async load(id){
  const file=id.split('?')[0];if(!file.replaceAll('\\','/').endsWith('/tests/sincronizacao-ciclo.jsx'))return null;
  const code=await readFile(file,'utf8'),cabecalho="import React,{useEffect,useState} from 'react';",alvo=' window.syncHarness=';
  if(!code.includes(cabecalho)||!code.includes(alvo))throw Error('Fixture incompatível com o medidor.');
  return code.replace(cabecalho,"import React,{useEffect,useState,useLayoutEffect} from 'react';").replace(alvo,
   " useLayoutEffect(()=>{window.dispatchEvent(new CustomEvent('medicao:campo-commit',{detail:{pendencias:sync.pendencias.map(i=>i.id),gravacoes:stats.writes}}));});\n"+alvo);
 }};
}

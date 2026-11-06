import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import React,{act,useState,useRef,useEffect} from 'react';
import {parseHTML} from 'linkedom';

// Executa as funções reais de App.jsx. Somente componentes visuais periféricos
// e a fronteira de persistência são substituídos; não há rede nem dados reais.
const {window}=parseHTML('<!doctype html><html><body></body></html>');
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Node isolated test'},configurable:true});
const {createRoot}=await import('react-dom/client');
const {Simulate}=await import('react-dom/test-utils');
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
const nomes=['AbaUnidades','AbaMemorialNucleo','AbaMapaNucleo'];
const funcoes=nomes.map(nome=>{
  const no=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===nome);
  assert.ok(no,`Função ${nome} existe`);return source.slice(no.start,no.end);
}).join('\n');
const h=React.createElement, vazio=()=>null;
const deps={React,useState,useRef,useEffect,clone:structuredClone,permissoes:u=>u.perm,ativo:()=>true,unidadesDe:p=>p.unidades,
  parseNum:v=>Number(String(v).replace(',','.')),preenchido:v=>!!v,MIN_MEMORIAL:10,
  codigoUnidade:(p,i)=>`${p.codigo}${i}`,codigosUnidades:p=>p.unidades.map((_,i)=>`${p.codigo}${i}`),letraUnidade:(_,i)=>String(i),
  separarQuadraLote:()=>({lote:'',quadra:''}),
  Secao:({titulo,children,acao})=>h('section',null,h('h2',null,titulo),acao,children),
  Tag:({children})=>h('span',null,children),
  Modal:({titulo,children,rodape,onFechar})=>h('div',{role:'dialog'},h('h2',null,titulo),children,rodape,h('button',{onClick:onFechar},'Fechar')),
  useTimbrado:()=>null,escaparHtml:s=>s,dataHoraBR:s=>s,dataBR:s=>s,
  ImportadorGeoJSON:vazio,ImportadorPerimetro:({podeImportar})=>h('button',{disabled:!podeImportar},'Importar KML'),Mapa:vazio,
  zoomParaLimites:()=>16,coordBR:String,poligonosParaMapa:g=>g?.poligonos||[],CAMADAS:{satelite:{nome:'Satélite'}},
  extrairKMLdoKMZ:vazio,Eye:vazio,Download:vazio,Plus:vazio,Check:vazio,Trash2:vazio,Search:vazio};
const js=transformSync(funcoes,{loader:'jsx',jsx:'transform'}).code;
const components=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;\n${js}\nreturn {${nomes.join(',')}};`)(deps);
const fixture=()=>({processos:[{id:'p1',codigo:'M001',municipioId:'m1',nucleoId:'n1',imovel:{},requerente:{nome:'Pessoa fictícia'},endereco:{},unidades:[
  {id:'u1',area:'100,00',memorial:'Memorial da unidade um',loteQuadra:'',lote:'1',quadra:'2'},
  {id:'u2',area:'90,00',memorial:'Memorial da unidade dois',loteQuadra:'',lote:'2',quadra:'2'}]}],
  nucleos:[{id:'n1',codigo:'N001',municipioId:'m1',memorial:{texto:'Memorial anterior'},geo:{arquivo:'perimetro.kml',centro:{lat:-27,lng:-49},limites:{sul:-28,norte:-26,oeste:-50,leste:-48},poligonos:[],importadoEm:'2026-11-06'}}]});
async function montar(nome){
  const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
  const ctx={el,db:fixture(),chamadas:0,retentativas:0,pendentes:[],toasts:[]};
  const esperar=()=>new Promise((resolve,reject)=>ctx.pendentes.push({resolve,reject}));
  const mutar=()=>{throw new Error('Mutação sem confirmação não esperada neste teste');};
  mutar.confirmado=fn=>{ctx.chamadas++;const next=fn(structuredClone(ctx.db));ctx.db=next;ctx.publicar(next);return esperar();};
  function Host(){const [db,setDb]=useState(ctx.db);ctx.publicar=setDb;return h(components[nome],{db,p:db.processos[0],n:db.nucleos[0],mutar,setToast:t=>ctx.toasts.push(t),ir:()=>{},usuario:{nome:'Equipe de teste',perm:{etapa:()=>true,areaUnidade:true,loteQuadraUnidade:true,editarClientes:false,memorialNucleo:true,mapaNucleo:true}}});}
  await act(async()=>root.render(h(Host)));
  ctx.botao=nome=>[...el.querySelectorAll('button')].find(b=>b.textContent===nome);
  ctx.clicar=async nome=>{const b=ctx.botao(nome);assert.ok(b,`Botão ${nome}`);assert.equal(b.disabled,false,`Botão ${nome} habilitado`);await act(async()=>Simulate.click(b));};
  ctx.editar=async(seletor,value)=>{const input=el.querySelector(seletor);assert.ok(input);await act(async()=>Simulate.change(input,{target:{value}}));};
  ctx.falhar=async()=>{const erro=new Error('A conexão falhou; confirmação pendente.');erro.retentarConfirmacao=()=>{ctx.retentativas++;return esperar();};await act(async()=>ctx.pendentes.shift().reject(erro));};
  ctx.confirmar=async()=>{assert.ok(ctx.pendentes.length);await act(async()=>ctx.pendentes.shift().resolve({confirmado:true}));};
  ctx.fechar=async()=>{await act(async()=>root.unmount());el.remove();};
  return ctx;
}

test('unidades: falha otimista preserva dirty, retenta a mesma intenção e mantém edição posterior',async()=>{
  const c=await montar('AbaUnidades');
  try{
    await c.editar('#area-u1','123,4500');
    const salvar=c.botao('Salvar unidades');
    await act(async()=>{Simulate.click(salvar);Simulate.click(salvar);});
    assert.equal(c.chamadas,1,'clique duplo não aplica duas mutações');
    assert.equal(c.toasts.length,0,'snapshot otimista não anuncia sucesso');
    assert.ok(c.el.querySelector('[data-edicao-pendente="true"]'));
    await c.falhar();
    assert.ok(c.botao('Confirmar salvamento'));
    assert.equal(c.botao('Descartar').disabled,true,'não anuncia cancelamento de envio já pendente');
    assert.equal(c.el.querySelector('#area-u1').value,'123,4500');
    await c.editar('#area-u1','140,0010');
    await c.clicar('Confirmar salvamento');await c.confirmar();
    assert.equal(c.retentativas,1);assert.equal(c.chamadas,1,'CAS não foi reexecutado sobre o próprio snapshot');
    assert.equal(c.el.querySelector('#area-u1').value,'140,0010','nova edição não foi sobrescrita pela confirmação anterior');
    assert.equal(c.botao('Salvar unidades').disabled,false);
    await c.clicar('Salvar unidades');await c.confirmar();
    assert.equal(c.chamadas,2);assert.equal(c.db.processos[0].unidades[0].area,'140,0010');
    assert.equal(c.db.processos[0].unidades[1].area,'90,00','a segunda unidade foi preservada');
    assert.equal(c.botao('Salvar unidades').disabled,true);
    assert.equal(c.el.querySelector('[data-edicao-pendente="true"]'),null);
  }finally{await c.fechar();}
});

test('memorial: readback pendente mantém edição, bloqueia exportação e retoma sem repetir CAS',async()=>{
  const c=await montar('AbaMemorialNucleo');
  try{
    await c.editar('textarea','  Memorial revisado  ');await c.clicar('Salvar memorial');
    assert.equal(c.toasts.length,0);await c.falhar();
    assert.ok(c.el.querySelector('[data-edicao-pendente="true"]'));
    assert.equal(c.botao('DOCX'),undefined);assert.equal(c.botao('PDF'),undefined);
    await c.editar('textarea','Memorial com revisão posterior');
    await c.clicar('Confirmar salvamento');await c.confirmar();
    assert.equal(c.chamadas,1);assert.equal(c.retentativas,1);
    assert.equal(c.el.querySelector('textarea').value,'Memorial com revisão posterior');
    assert.equal(c.botao('Salvar memorial').disabled,false);
    await c.clicar('Salvar memorial');await c.confirmar();
    assert.equal(c.db.nucleos[0].memorial.texto,'Memorial com revisão posterior');
    assert.equal(c.botao('Salvar memorial').disabled,true);assert.ok(c.botao('DOCX'));
  }finally{await c.fechar();}
});

test('remoção: falha mantém confirmação recuperável mesmo quando o snapshot já não contém o perímetro',async()=>{
  const c=await montar('AbaMapaNucleo');
  try{
    await c.clicar('Remover delimitação');
    const remover=c.botao('Remover');await act(async()=>{Simulate.click(remover);Simulate.click(remover);});
    assert.equal(c.chamadas,1);assert.equal(c.db.nucleos[0].geo,null);
    assert.equal(c.toasts.length,0);await c.falhar();
    assert.ok(c.el.querySelector('[role="dialog"]'));
    assert.match(c.el.querySelector('[role="dialog"]').textContent,/perimetro\.kml/);
    assert.equal(c.botao('Importar KML').disabled,true,'nova substituição aguarda a remoção pendente');
    await c.clicar('Voltar');assert.equal(c.el.querySelector('[role="dialog"]'),null);
    await c.clicar('Confirmar remoção pendente');await c.clicar('Confirmar remoção');await c.confirmar();
    assert.equal(c.chamadas,1);assert.equal(c.retentativas,1);
    assert.equal(c.el.querySelector('[role="dialog"]'),null);
    assert.deepEqual(c.toasts,['Delimitação removida.']);assert.equal(c.botao('Importar KML').disabled,false);
  }finally{await c.fechar();}
});

test('unidades: atualização de outra sessão aparece quando não há rascunho local',async()=>{
  const c=await montar('AbaUnidades');
  try{
    const recebido=structuredClone(c.db);recebido.processos[0].unidades[0].area='135,7500';
    await act(async()=>{c.db=recebido;c.publicar(recebido);});
    assert.equal(c.el.querySelector('#area-u1').value,'135,7500');assert.equal(c.botao('Salvar unidades').disabled,true);
  }finally{await c.fechar();}
});

test('unidades: confirmação adota alteração remota em campo não editado sem afetar o rascunho enviado',async()=>{
  const c=await montar('AbaUnidades');
  try{
    await c.editar('#area-u1','122,35');
    const recebido=structuredClone(c.db);recebido.processos[0].unidades[1].area='310,2222';
    await act(async()=>{c.db=recebido;c.publicar(recebido);});
    await c.clicar('Salvar unidades');await c.falhar();
    await c.clicar('Confirmar salvamento');await c.confirmar();
    assert.equal(c.chamadas,1);assert.equal(c.el.querySelector('#area-u1').value,'122,35');
    assert.equal(c.el.querySelector('#area-u2').value,'310,2222');
    assert.equal(c.botao('Salvar unidades').disabled,true);
  }finally{await c.fechar();}
});

test('unidades e memorial preservam bloqueio de conflito real e não mostram sucesso',async()=>{
  for(const nome of ['AbaUnidades','AbaMemorialNucleo']){
    const c=await montar(nome);
    try{
      const unidade=nome==='AbaUnidades';
      await c.editar(unidade?'#area-u1':'textarea',unidade?'123,4000':'Minha edição');
      const recebido=structuredClone(c.db);
      if(unidade)recebido.processos[0].unidades[0].area='450,8000';else recebido.nucleos[0].memorial.texto='Edição de outra sessão';
      await act(async()=>{c.db=recebido;c.publicar(recebido);});
      await c.clicar(unidade?'Salvar unidades':'Salvar memorial');
      assert.equal(c.toasts.length,0);assert.equal(c.pendentes.length,0);
      assert.ok(c.el.querySelector('[role="alert"]'));assert.ok(c.el.querySelector('[data-edicao-pendente="true"]'));
      assert.equal(c.el.querySelector(unidade?'#area-u1':'textarea').value,unidade?'123,4000':'Minha edição');
      assert.equal(unidade?c.db.processos[0].unidades[0].area:c.db.nucleos[0].memorial.texto,unidade?'450,8000':'Edição de outra sessão');
    }finally{await c.fechar();}
  }
});

test('remoção recusa perímetro alterado por outra sessão após a confirmação ser aberta',async()=>{
  const c=await montar('AbaMapaNucleo');
  try{
    await c.clicar('Remover delimitação');
    const recebido=structuredClone(c.db);recebido.nucleos[0].geo.arquivo='novo-perimetro.kml';
    await act(async()=>{c.db=recebido;c.publicar(recebido);});
    await c.clicar('Remover');assert.equal(c.toasts.length,0);assert.equal(c.pendentes.length,0);
    assert.equal(c.db.nucleos[0].geo.arquivo,'novo-perimetro.kml');
    assert.match(c.el.querySelector('[role="dialog"]').textContent,/O perímetro mudou/);
  }finally{await c.fechar();}
});

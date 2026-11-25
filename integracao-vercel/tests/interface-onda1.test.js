import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CAMPO_DO_ERRO_META,errosVisiveisMeta} from '../src/interface-regras.js';

const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const css=fonte.slice(fonte.indexOf('const CSS'),fonte.indexOf('function Modal('));
const trecho=(inicio,fim)=>fonte.slice(fonte.indexOf(inicio),fonte.indexOf(fim));

test('UI-M1: no celular a grade de formulário vira uma coluna mesmo com colunas definidas na própria janela',()=>{
 const regra=css.match(/@media \(max-width:640px\)\{\.rb \.fg\{([^}]*)\}\.rb \.fg>div\{([^}]*)\}/);
 assert.ok(regra,'regra de 640 px da grade .fg existe');
 // As janelas definem as colunas no atributo style; só !important vence esse estilo.
 assert.equal(regra[1],'grid-template-columns:1fr!important');
 assert.equal(regra[2],'grid-column:auto!important');
 const formulario=trecho('function ModalMetaERP(','function ModalDetalheMeta(');
 assert.match(formulario,/className="fg" style=\{\{ gridTemplateColumns: "1fr 1fr" \}\}/,'o formulário de meta usa a grade .fg coberta pela regra');
});

test('UI-M2: erro de meta só aparece no campo tocado ou depois de tentar salvar',()=>{
 const erros=['Informe o título da meta','Selecione ao menos um responsável','Informe o prazo final para responder','O prazo não pode ser antes da chegada','Mensagem ainda sem campo'];
 assert.deepEqual(errosVisiveisMeta(erros,{},false),{},'ao abrir, nenhum erro é mostrado');
 assert.deepEqual(errosVisiveisMeta(erros,{titulo:true},false),{titulo:'Informe o título da meta.'});
 assert.deepEqual(errosVisiveisMeta(erros,{},true),{titulo:'Informe o título da meta.',responsaveis:'Selecione ao menos um responsável.',
  prazoDev:'Informe o prazo final para responder. O prazo não pode ser antes da chegada.',geral:'Mensagem ainda sem campo.'});
 assert.deepEqual(errosVisiveisMeta([],{titulo:true},true),{});
 assert.deepEqual(errosVisiveisMeta(undefined),{});
});
test('UI-M2: toda validação do formulário de meta tem campo na tela, e Salvar não fica apagado por erro',()=>{
 const formulario=trecho('function ModalMetaERP(','function ModalDetalheMeta(');
 const mensagens=[...formulario.matchAll(/erros\.push\("([^"]+)"\)/g)].map(m=>m[1]);
 assert.ok(mensagens.length>=11,'validações localizadas no formulário');
 for(const m of mensagens)assert.ok(CAMPO_DO_ERRO_META[m],`mensagem sem campo: ${m}`);
 for(const campo of new Set(Object.values(CAMPO_DO_ERRO_META)))assert.ok(formulario.includes(`{ev.${campo}}`),`campo ${campo} mostra o próprio erro`);
 assert.doesNotMatch(formulario,/podeRetentar\(\) : erros\.length > 0/,'Salvar não é desabilitado pelos erros');
 assert.match(formulario,/if \(erros\.length\) \{ setTentouSalvar\(true\);[^\n]*return; \}/,'tentar salvar com erro revela os avisos e não grava');
 assert.match(formulario,/Título da nova meta \(obrigatório\)/);assert.match(formulario,/Responsáveis \(obrigatório\)/);
});

test('UI-M3: as ações da janela ficam num rodapé fixo, visível sem rolar até o fim',()=>{
 const regra=css.match(/\.rb \.modal-rodape\{([^}]*)\}/);
 assert.ok(regra,'estilo do rodapé existe');
 assert.match(regra[1],/position:sticky/);assert.match(regra[1],/bottom:0/);assert.match(regra[1],/background:var\(--card\)/,'o conteúdo rolado não aparece por trás dos botões');
 assert.match(css,/\.rb \.modal\{[^}]*overflow-y:auto/,'a própria janela é a área de rolagem em que o rodapé se fixa');
 const js=transformSync(trecho('function Modal(','function ModalMotivo('),{loader:'jsx',jsx:'transform'}).code;
 const Modal=new Function('React','useRef','useEffect','X',`${js};return Modal;`)(React,React.useRef,React.useEffect,()=>null);
 const h=React.createElement;
 const html=renderToStaticMarkup(h(Modal,{titulo:'Meta',onFechar(){},rodape:h('button',null,'Concluir')},h('p',null,'conteúdo longo')));
 assert.match(html,/<p>conteúdo longo<\/p><div class="[^"]*\bmodal-rodape\b[^"]*"[^>]*><button>Concluir<\/button><\/div>/);
 assert.doesNotMatch(renderToStaticMarkup(h(Modal,{titulo:'Sem ações',onFechar(){}},'x')),/modal-rodape/);
 const detalhe=trecho('function ModalDetalheMeta(','function CartaoMeta(');
 assert.match(detalhe,/rodape=\{<><button className="btn" onClick=\{fechar\}>Fechar<\/button>/,'Concluir, Editar, Excluir e Recusar seguem no rodapé da janela da meta');
});

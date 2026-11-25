import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const trecho=fonte.slice(fonte.indexOf('function permissoes(u)'),fonte.indexOf('const papelDe'));
const contexto=vm.createContext({SETORES:{},SETOR_DA_ETAPA:{topografia:'topografia',projeto:'projeto'}});
vm.runInContext(trecho,contexto);
test('todos os setores autenticados podem usar Campo offline',()=>{
 for(const setor of ['diretoria','comercial','topografia','projeto','juridico','posprotocolo','consulta'])assert.equal(contexto.permissoes({setor}).campoOffline,true,setor);
 assert.equal(contexto.permissoes(null).campoOffline,false);
});
test('liberação offline não concede edição nas outras telas',()=>{
 const p=contexto.permissoes({setor:'consulta'});
 for(const campo of ['diretor','campo','cadastro','juridico','validarDocs','config','usuarios'])assert.equal(p[campo],false,campo);
 assert.equal(p.etapa('topografia'),false);
});
test('menu, pré-carga e formulário usam a permissão offline',()=>{
 assert.match(fonte,/perm\.campoOffline && navItem\(rota\.pag === "campoOffline"/);
 assert.match(fonte,/pode=\{perm\.campoOffline && !un\.conflito\}/);
 const pagina=fonte.slice(fonte.indexOf('function PaginaCampoOffline('),fonte.indexOf('function ComercialOffline('));
 assert.match(pagina,/perm\.campoOffline && \(/);
 assert.match(fonte,/const podeComercial = perm\.campoOffline;/);
});

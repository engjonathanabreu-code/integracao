import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {permissoes} from '../src/permissoes.js';
const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
test('todos os setores autenticados podem usar Campo offline',()=>{
 for(const setor of ['diretoria','comercial','topografia','projeto','juridico','posprotocolo','consulta'])assert.equal(permissoes({setor}).campoOffline,true,setor);
 assert.equal(permissoes(null).campoOffline,false);
});
test('liberação offline não concede edição nas outras telas',()=>{
 const p=permissoes({setor:'consulta'});
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

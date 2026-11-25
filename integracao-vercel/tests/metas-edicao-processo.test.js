import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {metaParaEditar} from '../src/metas-semana.js';
const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const inicio=fonte.indexOf('function AbaMetasNucleo(');
const aba=fonte.slice(inicio,fonte.indexOf('\nfunction ',inicio+10));
test('Editar no detalhe da meta aberta de dentro do processo abre o formulário de edição',()=>{
 assert.ok(inicio>0);
 assert.doesNotMatch(aba,/onEditar=\{\(\) => \{\}\}/);
 assert.match(aba,/onEditar=\{\(\) => \{ const m = metaParaEditar\(db\.metas, detalhe\); setDetalhe\(null\); setEditando\(m\); \}\}/);
 assert.match(aba,/\{editando && <ModalMetaERP db=\{db\} meta=\{editando\} /);
});
test('nenhum detalhe de meta fica com o botão Editar sem ação',()=>{
 assert.doesNotMatch(fonte,/<ModalDetalheMeta[^\n]*onEditar=\{\(\) => \{\}\}/);
});
test('a meta a editar é a do detalhe aberto; meta removida não abre formulário',()=>{
 const metas=[{id:'a',titulo:'A'},{id:'b',titulo:'B'}];
 assert.equal(metaParaEditar(metas,'b'),metas[1]);
 assert.equal(metaParaEditar(metas,'x'),null);assert.equal(metaParaEditar(undefined,'a'),null);
});

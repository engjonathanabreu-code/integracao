import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nucleosParaCampoOffline, dadosParaPacoteOffline } from '../src/campo-offline-catalogo.js';
const base = () => ({
 municipios:[{id:'m',nome:'Guaratuba'}],remessas:[],
 nucleos:[{id:'n',municipioId:'m',codigo:'NUI01'}],processos:[],
});
const arquivo = {extras:{arquivamento:{ativo:true}}};
test('catálogo não depende de moradores/resumo ainda não carregados',()=>{
 const db=base(),antes=JSON.stringify(db);
 assert.deepEqual(nucleosParaCampoOffline(db).map(n=>n.id),['n']);
 assert.equal(JSON.stringify(db),antes);
});
test('catálogo preserva exclusão de núcleos e municípios arquivados',()=>{
 for(const colecao of ['nucleos','municipios']){
  const db=base();Object.assign(db[colecao][0],arquivo);
  assert.deepEqual(nucleosParaCampoOffline(db),[]);
 }
});
test('pré-carga só aceita moradores completos e ativos no núcleo solicitado',()=>{
 const db=base();db.processos=[{id:'p',nucleoId:'n',situacao:'Ativo'}];
 assert.deepEqual(dadosParaPacoteOffline(db,'n').processos,db.processos);
 db.processos[0]._resumo=true;
 assert.throws(()=>dadosParaPacoteOffline(db,'n'),/por completo/);
 for(const processos of [[],[{id:'p',nucleoId:'outro',situacao:'Ativo'}],[{id:'p',nucleoId:'n',situacao:'Inativo'}],[{id:'p',nucleoId:'n',situacao:'Ativo',...arquivo}]]){
  assert.throws(()=>dadosParaPacoteOffline({...base(),processos},'n'),/não tem moradores ativos/);
 }
});
test('dados indisponíveis/arquivados não geram pacote vazio nem substituem dados locais',()=>{
 assert.throws(()=>dadosParaPacoteOffline(null,'n'),/Não foi possível/);
 assert.throws(()=>dadosParaPacoteOffline(base(),'removido'),/não está mais disponível/);
 const db=base();Object.assign(db.nucleos[0],arquivo);
 assert.throws(()=>dadosParaPacoteOffline(db,'n'),/não está mais disponível/);
});
test('tela usa catálogo independente, valida carga antes de gravar e libera botão após falha',()=>{
 const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(fonte,/const candidatos = nucleosParaCampoOffline\(db\)/);
 assert.match(fonte,/dadosParaPacoteOffline\(await carregarMunicipio\(n.municipioId\), n.id\)/);
 assert.match(fonte,/finally \{ setBaixando\(false\); \}/);
 assert.doesNotMatch(fonte,/Todos os núcleos com moradores ativos já estão no aparelho/);
});

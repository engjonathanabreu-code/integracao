import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nucleosParaCampoOffline, dadosParaPacoteOffline, municipioCompletoParaCampo, contagemMoradoresPorNucleo } from '../src/campo-offline-catalogo.js';
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
 assert.match(fonte,/const candidatos = nucleosParaCampoOffline\(db, offline.municipiosCarregados\)/);
 assert.match(fonte,/dadosParaPacoteOffline\(carga, n.id\)/);
 assert.match(fonte,/finally \{ setBaixando\(false\); \}/);
 assert.doesNotMatch(fonte,/Todos os núcleos com moradores ativos já estão no aparelho/);
});
test('homônimos mantêm IDs e só excluem vazio após carga completa comprovada',()=>{
 const db=base();db.nucleos.push({...db.nucleos[0],id:'crm',nome:'Mesmo nome'});
 db.nucleos[0].nome='Mesmo nome';
 assert.deepEqual(nucleosParaCampoOffline(db).map(n=>n.id),['n','crm']);
 db.processos=[{id:'p',nucleoId:'n',municipioId:'m',situacao:'Ativo'}];
 const antes=JSON.stringify(db);
 assert.deepEqual(nucleosParaCampoOffline(db,['m']).map(n=>n.id),['n']);
 assert.deepEqual(nucleosParaCampoOffline(db,['outro']).map(n=>n.id),['n','crm']);
 assert.equal(JSON.stringify(db),antes);
});

test('carga ausente ou com resumo não autoriza esconder núcleos',()=>{
 assert.equal(municipioCompletoParaCampo(null,'m'),false);
 assert.equal(municipioCompletoParaCampo({...base(),processos:[{municipioId:'m',_resumo:true}]},'m'),false);
 assert.equal(municipioCompletoParaCampo(base(),'m'),true);
 const db={...base(),processos:[{id:'p1',nucleoId:'n',situacao:'Ativo'},{id:'p2',nucleoId:'n',situacao:'Inativo'},{id:'p3',nucleoId:'n',situacao:'Ativo',...arquivo}]};
 assert.equal(contagemMoradoresPorNucleo(db).get('n'),1);
});

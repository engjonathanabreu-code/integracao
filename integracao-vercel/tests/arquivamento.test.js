import test from 'node:test';
import assert from 'node:assert/strict';
import { alterarArquivamento, dadosVisiveis, vinculadosAoRegistro, pacotesVisiveis } from '../src/arquivamento.js';
import { compactarResumo, expandirResumo } from '../src/resumo-transporte.js';
const diretor={id:'d',nome:'Diretor',setor:'diretoria',ativo:true};
const base=()=>({municipios:[{id:'m',nome:'Município'}],remessas:[{id:'r',municipioId:'m'}],nucleos:[{id:'n',municipioId:'m',remessaId:'r',etapa:2}],processos:[{id:'p',municipioId:'m',remessaId:'r',nucleoId:'n',etapa:3,extras:{outro:'preservado'},docs:[{id:'doc'}],unidades:[{memorial:'existente'}]}]});
test('arquivar município oculta vínculos sem reescrever filhos nem apagar documentos',()=>{
 const db=base(),filhos=structuredClone([db.remessas,db.nucleos,db.processos]);
 alterarArquivamento(db,'municipios','m',true,diretor,'2026-09-16');
 assert.equal(dadosVisiveis(db).processos.length,0);assert.equal(dadosVisiveis(db).nucleos.length,0);
 assert.deepEqual([db.remessas,db.nucleos,db.processos],filhos);
 alterarArquivamento(db,'municipios','m',false,diretor);
 assert.equal(dadosVisiveis(db).processos.length,1);assert.equal(db.processos[0].etapa,3);
});
test('restaurar pai mantém arquivamento individual e preserva extras/histórico',()=>{
 const db=base();alterarArquivamento(db,'processos','p',true,diretor);alterarArquivamento(db,'nucleos','n',true,diretor);
 assert.throws(()=>alterarArquivamento(db,'processos','p',false,diretor),/primeiro/);
 alterarArquivamento(db,'nucleos','n',false,diretor);assert.equal(dadosVisiveis(db).processos.length,0);
 alterarArquivamento(db,'processos','p',false,diretor);assert.equal(db.processos[0].extras.outro,'preservado');
 assert.equal(db.processos[0].extras.arquivamento.arquivadoPorId,'d');assert.equal(db.processos[0].extras.arquivamento.restauradoPorId,'d');
 assert.equal(db.processos[0].unidades[0].memorial,'existente');
});
test('controle da Diretoria e bloqueio de alteração em resumo incompleto',()=>{
 const db=base();assert.throws(()=>alterarArquivamento(db,'processos','p',true,{setor:'comercial'}),/Diretoria/);
 db.processos[0]._resumo=true;assert.throws(()=>alterarArquivamento(db,'processos','p',true,diretor),/carregue/);
});
test('contagem inclui todos os descendentes e projeção mantém base para reservar códigos',()=>{
 const db=base(),v=vinculadosAoRegistro(db,'municipios','m');assert.equal(v.remessas.size,1);assert.equal(v.nucleos.size,1);assert.equal(v.processos.size,1);
 alterarArquivamento(db,'processos','p',true,diretor);const view=dadosVisiveis(db);assert.equal(view.processos.length,0);assert.equal(view._baseArquivo.processos.length,1);assert.equal(JSON.stringify(view).includes('_baseArquivo'),false);
});
test('arquivamento chega ao outro dispositivo também pela carga resumida',()=>{
 const db=base();alterarArquivamento(db,'processos','p',true,diretor);
 const rows=expandirResumo(compactarResumo(db.processos));assert.equal(dadosVisiveis({...db,processos:rows}).processos.length,0);
});

test('pacotes offline ficam ocultos sem perder conteúdo ainda não sincronizado',()=>{
 const pacotes={n:{unidades:[{id:'p',alterado:true,campo:{texto:'rascunho'}}]}};const original=structuredClone(pacotes);
 const mapa={nucleos:new Set(['n']),remessas:new Set(),processos:new Set(['p'])};
 assert.deepEqual(pacotesVisiveis(pacotes,mapa),{});assert.deepEqual(pacotes,original);
 mapa.nucleos.clear();assert.equal(pacotesVisiveis(pacotes,mapa).n.unidades.length,0);
 mapa.processos.clear();assert.equal(pacotesVisiveis(pacotes,mapa).n.unidades[0].campo.texto,'rascunho');
});

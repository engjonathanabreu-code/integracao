import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarProcessos, municipiosDosProcessos, etapasDosProcessos } from '../src/processos-filtros.js';
const municipios = [{id:'z',nome:'Zortéa'}, {id:'b',nome:'Blumenau'}, {id:'a',nome:'Águas'}, {id:'v',nome:'Vazio'}];
const nucleos = [{id:1,municipioId:'z',etapa:'Comercial'}, {id:2,municipioId:'a',etapa:'Comercial'}, {id:3,municipioId:'b',etapa:'Topografia'}, {id:4,municipioId:'a',etapa:'Etapa importada'}];
const etapaDe = n => n.etapa;
test('municípios do quadro e da busca seguem ordem alfabética sem acentos', () => {
  assert.deepEqual(municipiosDosProcessos(municipios,nucleos).map(m=>m.nome), ['Águas','Blumenau','Zortéa']);
});
test('Comercial inclui somente municípios e contagens da fase filtrada', () => {
  const lista = filtrarProcessos(nucleos,{etapa:'Comercial'},etapaDe,n=>n.id);
  assert.equal(lista.length,2);
  assert.deepEqual(municipiosDosProcessos(municipios,lista).map(m=>m.id),['a','z']);
});
test('todo núcleo tem uma coluna mesmo com etapa importada fora do padrão', () => {
  const etapas=etapasDosProcessos(['Comercial','Topografia'],nucleos,etapaDe);
  const cards=etapas.flatMap(e=>nucleos.filter(n=>etapaDe(n)===e));
  assert.equal(cards.length,nucleos.length);
  assert.equal(new Set(cards.map(n=>n.id)).size,nucleos.length);
});

test('cada etapa exclui todos os municípios sem núcleo correspondente', () => {
  for (const etapa of ['Comercial', 'Topografia', 'Etapa importada', 'Projetos']) {
    const lista = filtrarProcessos(nucleos, { etapa }, etapaDe, n => n.id);
    const exibidos = municipiosDosProcessos(municipios, lista);
    assert.deepEqual(exibidos.map(m => m.id).sort(), [...new Set(nucleos.filter(n => n.etapa === etapa).map(n => n.municipioId))].sort());
  }
});

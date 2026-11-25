import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const pagina = fonte.slice(fonte.indexOf('function PaginaMunicipios('), fonte.indexOf('function PaginaMunicipio('));

test('aba Clientes tem a busca de clientes no topo, em todos os municípios', () => {
  assert.match(pagina, /function PaginaMunicipios\(\{[^)]*\babrirCliente\b[^)]*\}\)/);
  const busca = pagina.match(/<BuscaClientes [^>]*\/>/)?.[0];
  assert.ok(busca, 'busca de clientes ausente na aba Clientes');
  assert.doesNotMatch(busca, /municipioId/);
  assert.match(busca, /abrirCliente=\{abrirCliente\}/);
  assert.match(busca, /demo=\{AMBIENTE\.DEMO\}/);
  assert.ok(pagina.indexOf('<BuscaClientes ') < pagina.indexOf('aria-label="Filtrar por UF"'), 'a busca deve vir antes dos filtros de município');
  assert.ok(pagina.indexOf('<BuscaClientes ') > pagina.indexOf('<h1>Clientes</h1>'));
});

test('a aba recebe a mesma abertura de ficha usada na busca do Início', () => {
  assert.match(fonte, /const props = \{[^}]*\babrirCliente\b/);
  assert.match(fonte, /rota\.pag === "municipios" && <PaginaMunicipios \{\.\.\.props\} \/>/);
  assert.match(pagina, /aria-label="Buscar município"/);
});

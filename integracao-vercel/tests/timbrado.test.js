import test from 'node:test';
import assert from 'node:assert/strict';
import { configTimbrado, timbradoPadrao, imagemPadrao, aplicarTimbrado, versaoTimbrado } from '../src/timbrado.js';

test('instalação sem timbrado emite as duas imagens incorporadas e na ordem correta', () => {
  const config = configTimbrado(null);
  const imagens = Object.fromEntries(['cabecalho', 'rodape'].map(lugar => [lugar, imagemPadrao(config[lugar], lugar)]));
  for (const lugar of ['cabecalho', 'rodape']) {
    assert.match(imagens[lugar], /^data:image\/png;base64,/);
    const png = Buffer.from(imagens[lugar].split(',')[1], 'base64');
    assert.equal(png.readUInt32BE(16), config[lugar].largura);
    assert.equal(png.readUInt32BE(20), config[lugar].altura);
  }
  const html = aplicarTimbrado('<p>Documento</p>', { ...config, imagens });
  assert.ok(html.indexOf(imagens.cabecalho) < html.indexOf('<p>Documento</p>'));
  assert.ok(html.indexOf(imagens.rodape) > html.indexOf('<p>Documento</p>'));
  assert.equal((html.match(/<img /g) || []).length, 2);
});

test('preserva configuração personalizada, desativação e remoção de cada parte', () => {
  const personalizada = { ativo: false, cabecalho: { chave: 'personalizado' }, rodape: null };
  assert.equal(configTimbrado(personalizada), personalizada);
  assert.equal(imagemPadrao(personalizada.cabecalho, 'cabecalho'), null);
  assert.equal(imagemPadrao(null, 'rodape'), null);
  assert.equal(aplicarTimbrado('Texto', { ...personalizada, imagens: { cabecalho: 'teste' } }), 'Texto');
  assert.equal(aplicarTimbrado('Texto', { ativo: true, imagens: {} }), 'Texto');
  const config = timbradoPadrao();
  config.cabecalho = null;
  assert.equal(configTimbrado(config).cabecalho, null);
  assert.equal((aplicarTimbrado('Texto', { ...config, imagens: { rodape: imagemPadrao(config.rodape, 'rodape') } }).match(/<img /g) || []).length, 1);
});

test('troca de imagem na mesma chave invalida a leitura anterior', () => {
  const a = { cabecalho: { chave: 'mesma-chave', enviadoEm: '2026-09-17T10:00:00Z' } };
  const b = { cabecalho: { ...a.cabecalho, enviadoEm: '2026-09-17T11:00:00Z' } };
  assert.notEqual(versaoTimbrado(a), versaoTimbrado(b));
});

test('alterações nas margens não modificam o modelo padrão', () => {
  const config = timbradoPadrao();
  config.margens.topo = 99;
  assert.equal(timbradoPadrao().margens.topo, 2);
});

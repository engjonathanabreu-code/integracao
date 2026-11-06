import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_TERMO, preencherTermoMunicipal, htmlTermoMunicipal, modelosDoMunicipio, validarModeloTermo, validarContextoTermo } from '../src/termos-municipais.js';

const modelo = (municipioId = 'municipio-a', corpo = '{{requerente.nome}}, unidade {{unidade.codigo}}, {{municipio.nome}}. {{qualificacao}}') => ({
  id: 'versao-a-1', modeloId: 'modelo-a', municipioId, versao: 1, titulo: 'Texto fictício para teste', variante: 'Variante de teste', corpo, obrigatorios: ['requerente.nome', 'unidade.codigo', 'municipio.nome', 'qualificacao'],
});
const dados = { 'requerente.nome': 'Pessoa Fictícia', 'unidade.codigo': 'TESTE-001-A', 'municipio.nome': 'Município A', qualificacao: 'Qualificação fictícia completa.' };

test('dois municípios mantêm textos independentes, sem fallback municipal', () => {
  const a = modelo(); const b = { ...modelo('municipio-b'), id: 'versao-b-1', corpo: 'Outro texto: {{requerente.nome}}', obrigatorios: ['requerente.nome'] };
  assert.deepEqual(modelosDoMunicipio([a, b], 'municipio-c'), []);
  assert.deepEqual(modelosDoMunicipio([a, b], 'municipio-a'), [a]);
  assert.notEqual(preencherTermoMunicipal(a, dados).texto, preencherTermoMunicipal(b, dados).texto);
  assert.equal(modelosDoMunicipio([{ ...a, ativo: false }], 'municipio-a').length, 0);
});

test('geração não muta modelo ou dados e emissão anterior conserva texto', () => {
  const m = modelo(); const antes = JSON.stringify({ m, dados });
  const emissao = structuredClone(preencherTermoMunicipal(m, dados));
  const textoAnterior = emissao.texto;
  assert.equal(JSON.stringify({ m, dados }), antes);
  const novaVersao = { ...m, id: 'versao-a-2', versao: 2, corpo: `${m.corpo}\n\nNovo texto fornecido pelo administrador.` };
  assert.notEqual(preencherTermoMunicipal(novaVersao, dados).texto, textoAnterior);
  assert.equal(emissao.texto, textoAnterior);
});

test('indica campos obrigatórios ausentes e qualificação incompleta sem inventar valores', () => {
  const preenchido = preencherTermoMunicipal(modelo(), { ...dados, 'requerente.nome': '', qualificacao: 'Pessoa [RG do requerente].' });
  assert.deepEqual(preenchido.faltas, ['requerente.nome', 'qualificacao']);
  assert.match(preenchido.texto, /Pessoa \[RG do requerente\]/);
  assert.doesNotMatch(preenchido.texto, /brasileiro|REURB-S/);
});

test('texto e valores maliciosos são escapados para prévia e exportação', () => {
  const m = { ...modelo(), titulo: '<img src=x onerror=alert(1)>', corpo: '<script>alert(1)</script> {{requerente.nome}}', obrigatorios: ['requerente.nome'] };
  const resultado = preencherTermoMunicipal(m, { 'requerente.nome': '<img src=x onerror=alert(2)>' });
  assert.doesNotMatch(resultado.html, /<script|<img/i);
  assert.match(resultado.html, /&lt;script&gt;/);
  assert.equal(resultado.html, htmlTermoMunicipal(resultado.texto, resultado.titulo));
});

test('rejeita marcadores desconhecidos, caminhos de protótipo e controles incompletos', () => {
  for (const corpo of ['{{__proto__.polluted}}', '{{constructor}}', '{{#se:modalidade}}', '{{requerente.nome}', 'texto }}']) {
    const m = { ...modelo(), corpo, obrigatorios: [] };
    assert.ok(validarModeloTermo(m).erros.length);
    assert.throws(() => preencherTermoMunicipal(m, dados));
  }
  assert.ok(validarModeloTermo({ ...modelo(), obrigatorios: ['conjuge.nome'] }).erros.length);
});

test('substituição é literal, preserva decimais e não interpreta marcadores presentes nos dados', () => {
  const m = { ...modelo(), corpo: '{{unidade.area}} / {{requerente.nome}} / {{conjuge.nome}}', obrigatorios: ['unidade.area'] };
  const preenchido = preencherTermoMunicipal(m, { 'unidade.area': '120,0450', 'requerente.nome': '{{municipio.nome}} $&' });
  assert.equal(preenchido.texto, '120,0450 / {{municipio.nome}} $& / ');
  assert.deepEqual(preenchido.faltas, []);
});

test('bloqueia modelo de outra cidade e unidade fora do cadastro selecionado', () => {
  const contexto = { modelo: modelo(), processo: { municipioId: 'municipio-a', nucleoId: 'n-a', unidades: [{ id: 'u-a' }] }, municipio: { id: 'municipio-a' }, nucleo: { id: 'n-a', municipioId: 'municipio-a' }, unidade: { id: 'u-a' } };
  assert.equal(validarContextoTermo(contexto), true);
  assert.throws(() => validarContextoTermo({ ...contexto, unidade: { id: 'u-b' } }), /unidade/);
  assert.throws(() => validarContextoTermo({ ...contexto, modelo: modelo('municipio-b') }), /município/);
  assert.throws(() => validarContextoTermo({ ...contexto, nucleo: { id: 'n-b', municipioId: 'municipio-a' } }), /núcleo/);
});

test('regra de Ilhota é texto fornecido no modelo e não se propaga a outros municípios', () => {
  // Texto meramente fictício para verificar roteamento, não é um modelo jurídico.
  const ilhota = { ...modelo('ilhota'), corpo: 'REGRA DE TESTE: ligações de água e energia: requerente. Demais infraestruturas: Prefeitura. Modalidade: {{modalidade}}.', obrigatorios: ['modalidade'] };
  const outro = { ...modelo('outra-cidade'), corpo: 'TEXTO DISTINTO DE TESTE.', obrigatorios: [] };
  assert.match(preencherTermoMunicipal(ilhota, { modalidade: 'REURB-S' }).texto, /energia: requerente/);
  assert.doesNotMatch(preencherTermoMunicipal(outro, {}).texto, /Prefeitura|energia/);
  assert.ok(Object.keys(CAMPOS_TERMO).length > 10);
});

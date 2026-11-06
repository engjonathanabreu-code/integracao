import test from 'node:test';
import assert from 'node:assert/strict';
import { criarHistoricoEditor, erroObservacao, lerTrechosDOM, marcarItem, mudarTipoBloco, observacaoVazia, podeEditarObservacao, textoObservacao, validarObservacao } from '../src/observacoes-documentos.js';

const modelo = () => ({ version: 1, blocks: [
  { id: 'a', type: 'paragraph', runs: [{ text: 'Conferir ', bold: true }, { text: 'documentos', italic: true }] },
  { id: 'b', type: 'check', checked: false, runs: [{ text: 'Confirmar matrícula' }] },
  { id: 'c', type: 'ordered', runs: [{ text: 'Analisar' }] },
  { id: 'd', type: 'ordered', runs: [{ text: 'Aprovar' }] }
] });

test('conteúdo formatado e checklist sobrevivem ida e volta JSON sem perder dados', () => {
  const origem = modelo(), salvo = validarObservacao(JSON.parse(JSON.stringify(origem)));
  assert.deepEqual(salvo, origem); assert.notEqual(salvo, origem);
  const marcado = marcarItem(salvo, 'b', true);
  assert.equal(marcado.blocks[1].checked, true); assert.equal(origem.blocks[1].checked, false);
  assert.equal(textoObservacao(marcado), 'Conferir documentos\n[x] Confirmar matrícula\n1. Analisar\n2. Aprovar');
});
test('validação rejeita HTML, campos desconhecidos, estado inválido e ids duplicados', () => {
  for (const mutacao of [
    c => c.html = '<img src=x onerror=alert(1)>',
    c => c.blocks[0].runs[0].html = '<script>1</script>',
    c => c.blocks[0].onclick = 'alert(1)',
    c => c.blocks[0].runs[0].bold = 'true',
    c => c.blocks[1].checked = 'false',
    c => c.blocks[2].id = 'a',
    c => c.blocks[0].runs[0].text = '\u0000',
    c => c.blocks[0].type = 'script',
    c => c.blocks[0].id = {},
    c => c.blocks[0].checked = false,
    c => c.blocks[0].runs = []
  ]) { const c = modelo(); mutacao(c); assert.throws(() => validarObservacao(c)); }
  const literal = modelo(); literal.blocks[0].runs = [{ text: '<script>alert(1)</script>' }];
  assert.equal(validarObservacao(literal).blocks[0].runs[0].text, '<script>alert(1)</script>'); // Texto literal, nunca HTML.
});
test('limites impedem observações vazias ou excessivas sem alterar o original', () => {
  assert.throws(() => validarObservacao(observacaoVazia()), /Escreva/);
  assert.doesNotThrow(() => validarObservacao(observacaoVazia(), { permitirVazia: true }));
  const grande = modelo(); grande.blocks[0].runs = [{ text: 'a'.repeat(20001) }];
  assert.throws(() => validarObservacao(grande), /limite/);
  const blocos = modelo(); blocos.blocks = Array.from({ length: 201 }, (_, i) => ({ id: `id${i}`, type: 'paragraph', runs: [{ text: 'a' }] }));
  assert.throws(() => validarObservacao(blocos), /200/);
  const trechos = modelo(); trechos.blocks[0].runs = Array.from({ length: 1001 }, () => ({ text: 'a' }));
  assert.throws(() => validarObservacao(trechos), /limite/);
});
test('autoria usa identidade de conta, sem autorizar por nome igual', () => {
  const obs = { autor_id: 'uuid1', autor_nome: 'Ana' };
  assert.equal(podeEditarObservacao(obs, { id: 'uuid2', nome: 'Ana' }), false);
  assert.equal(podeEditarObservacao(obs, { id: 'local', erpId: 'uuid1' }), true);
  assert.equal(podeEditarObservacao(obs, { id: 'local', erpRef: 'uuid1' }), true);
  assert.equal(podeEditarObservacao(obs, { id: 'erp_uuid1' }), true);
  assert.equal(podeEditarObservacao(obs, { id: 'erp_uuid1', ativo: false }), false);
  assert.equal(podeEditarObservacao(obs, { id: 'uuid2' }, true), true);
  assert.equal(podeEditarObservacao(obs, null, true), false);
});
test('troca de tipo e checklist não alteram outros blocos e validam o alvo', () => {
  const c = modelo(), novo = mudarTipoBloco(c, 'a', 'check');
  assert.equal(novo.blocks[0].checked, false); assert.equal(c.blocks[0].type, 'paragraph');
  assert.deepEqual(novo.blocks.slice(1), c.blocks.slice(1));
  assert.equal('checked' in mudarTipoBloco(novo, 'a', 'bullet').blocks[0], false);
  assert.throws(() => marcarItem(c, 'a', true), /inválido/);
  assert.throws(() => marcarItem(c, 'ausente', true), /não encontrado/);
});
test('desfazer e refazer preservam estados independentes e removem futuro divergente', () => {
  const base = modelo(), historico = criarHistoricoEditor(base), alterado = marcarItem(base, 'b', true);
  historico.registrar(alterado); alterado.blocks[1].checked = false;
  assert.equal(historico.podeDesfazer, true); assert.deepEqual(historico.desfazer(), base);
  assert.equal(historico.refazer().blocks[1].checked, true);
  historico.desfazer(); historico.registrar(mudarTipoBloco(base, 'a', 'bullet'));
  assert.equal(historico.podeRefazer, false);
});
test('DOM para estrutura remove scripts e mídia, ignorando atributos executáveis', () => {
  const text = value => ({ nodeType: 3, nodeValue: value });
  const el = (tag, children, style = {}) => ({ nodeType: 1, tagName: tag, childNodes: children, style, onclick: 'evil' });
  const dom = { childNodes: [el('STRONG', [text('Texto seguro')]), el('BR', []), el('EM', [text('itálico')]), el('SCRIPT', [text('evil()')]), el('SVG', [text('evil')]), el('IMG', [], { onerror: 'evil' }), el('A', [text('link em texto')])] };
  assert.deepEqual(lerTrechosDOM(dom), [{ text: 'Texto seguro', bold: true }, { text: '\n' }, { text: 'itálico', italic: true }, { text: 'link em texto' }]);
});
test('conflitos e falhas preservam instrução útil, sem declarar gravação', () => {
  assert.match(erroObservacao({ code: '40001' }), /outra sessão/);
  assert.match(erroObservacao({ message: 'Versão alterada' }), /texto foi mantido/);
  assert.match(erroObservacao({}), /texto foi mantido/);
});

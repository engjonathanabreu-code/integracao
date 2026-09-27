import test from 'node:test';
import assert from 'node:assert/strict';
import { separarAcoes } from '../src/panorama-acoes.js';

test('separa dez ações multilinha sem perder contexto, acentos ou negrito', () => {
  const texto = Array.from({length:10}, (_,i) => `${i+1}. **Conferir núcleo ${i+1}**\r\nContexto: **São José**\r\nPrazo: **15 dias**, sugerido.`).join('\r\n\r\n');
  const r = separarAcoes(texto);
  assert.equal(r.itens.length,10);
  assert.ok(r.itens.every(t => t.includes('**São José**') && t.includes('**15 dias**')));
});
test('preserva textos legados, observações e caracteres HTML como texto', () => {
  const r = separarAcoes('Observação inicial\n1) **Revisar**\n<img src=x onerror=alert(1)>\n2. Conferir\nObservação final');
  assert.equal(r.introducao,'Observação inicial');
  assert.equal(r.itens.length,2);
  assert.ok(r.itens[0].includes('<img src=x onerror=alert(1)>'));
  assert.ok(r.itens[1].endsWith('Observação final'));
  assert.equal(separarAcoes('Texto antigo sem lista').introducao,'Texto antigo sem lista');
  assert.deepEqual(separarAcoes('**1. Conferir núcleo**\n**2.** Revisar cadastro').itens,['**Conferir núcleo**','Revisar cadastro']);
});

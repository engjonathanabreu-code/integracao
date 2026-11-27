import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seloStatusMeta } from '../src/metas-organizacao.js';

test('cada status de meta tem selo com nome escrito e cor própria', () => {
  const selos = ['Em andamento', 'Aguardando aprovação', 'Concluído', 'Cancelado'].map(s => seloStatusMeta(s));
  assert.deepEqual(selos.map(s => s.rotulo), ['Em andamento', 'Aguardando aprovação', 'Concluído', 'Cancelado']);
  const atrasada = seloStatusMeta('Em andamento', true);
  assert.equal(atrasada.rotulo, 'Atrasada');
  const todos = [...selos, atrasada];
  assert.equal(new Set(todos.map(s => s.cor + '|' + s.fundo)).size, todos.length);
  assert.notEqual(seloStatusMeta('Em andamento').cor, seloStatusMeta('Concluído').cor);
  assert.notEqual(seloStatusMeta('Em andamento').fundo, seloStatusMeta('Concluído').fundo);
});

test('selo usa somente variáveis de cor que o tema já define no claro e no escuro', () => {
  const css = readFileSync(new URL('../src/ui-guide.css', import.meta.url), 'utf8');
  const [claro, escuro] = [css.slice(0, css.indexOf('.rb.escuro[data-ui-guide]{')), css.slice(css.indexOf('.rb.escuro[data-ui-guide]{'))];
  for (const args of [['Em andamento'], ['Aguardando aprovação'], ['Concluído'], ['Cancelado'], ['Em andamento', true], ['Outro']]) {
    const selo = seloStatusMeta(...args);
    for (const valor of [selo.cor, selo.fundo]) {
      const nome = /^var\((--[a-z-]+)\)$/.exec(valor)?.[1];
      assert.ok(nome, `cor fora da paleta: ${valor}`);
      assert.ok(claro.includes(`${nome}:`) && escuro.includes(`${nome}:`), `${nome} ausente em um dos temas`);
    }
  }
});

test('meta encerrada nunca aparece como atrasada e status desconhecido mostra o próprio nome', () => {
  assert.equal(seloStatusMeta('Concluído', true).chave, 'concluido');
  assert.equal(seloStatusMeta('Cancelado', true).chave, 'cancelado');
  assert.equal(seloStatusMeta('Pausada').rotulo, 'Pausada');
  assert.equal(seloStatusMeta('').rotulo, 'Sem status');
  assert.equal(seloStatusMeta(undefined, true).chave, 'atrasada');
});

test('cartão de meta escreve o nome do status vindo da regra única', () => {
  const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const cartao = fonte.slice(fonte.indexOf('function CartaoMeta('), fonte.indexOf('function PaginaMetas('));
  assert.match(cartao, /seloStatusMeta\(m\.status, !!atrasada\)/);
  assert.match(cartao, /className="selo-status-meta"[^>]*>\{sinal\.titulo\}/);
});

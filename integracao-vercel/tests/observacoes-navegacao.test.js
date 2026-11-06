import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

// Executa os handlers reais da composição, sem importar App (que abre serviços)
// nem manter uma cópia da lógica de navegação no teste.
function fonte(nome) {
  const texto = readFileSync(new URL(`../src/${nome}`, import.meta.url), 'utf8');
  return { texto, ast: parse(texto, { sourceType: 'module', plugins: ['jsx'] }) };
}
function buscar(no, predicado) {
  if (!no || typeof no !== 'object') return [];
  const encontrados = predicado(no) ? [no] : [];
  for (const valor of Object.values(no)) {
    if (Array.isArray(valor)) for (const item of valor) encontrados.push(...buscar(item, predicado));
    else if (valor && typeof valor === 'object') encontrados.push(...buscar(valor, predicado));
  }
  return encontrados;
}
const app = fonte('App.jsx'), arquivo = fonte('ArquivoCadastros.jsx');
const funcao = (f, nome) => buscar(f.ast, n => n.type === 'FunctionDeclaration' && n.id?.name === nome)[0];
const variavel = (f, dono, nome) => buscar(funcao(f, dono), n => n.type === 'VariableDeclarator' && n.id?.name === nome)[0]?.init;
const atributo = (f, dono, elemento, nome, filtro = () => true) => {
  const abertura = buscar(funcao(f, dono), n => n.type === 'JSXOpeningElement' && n.name?.name === elemento && filtro(n))[0];
  return abertura?.attributes.find(a => a.name?.name === nome)?.value?.expression;
};
function executar(f, node, ambiente) {
  assert.ok(node, 'Handler real deve existir');
  return Function(...Object.keys(ambiente), `return (${f.texto.slice(node.start, node.end)});`)(...Object.values(ambiente));
}
const tab = atributo(app, 'PaginaProcesso', 'button', 'onClick', n => n.attributes.some(a => a.name?.name === 'role' && a.value?.value === 'tab'));
const painel = atributo(app, 'PaginaProcesso', 'PainelEtapa', 'onAbrirAba');

for (const [nome, node] of [['aba superior', tab], ['painel de requisitos', painel]]) {
  test(`${nome}: aba ativa conserva pendência; cancelamento não desmonta o editor`, () => {
    for (const mesmaAba of [true, false]) {
      const chamadas = [];
      const handler = executar(app, node, { aba: 'documentos', id: mesmaAba ? 'documentos' : 'cadastro', observacaoPendente: true,
        window: { confirm: () => { chamadas.push('confirmar'); return false; } },
        setObservacaoPendente: v => chamadas.push(['pendente', v]), setAba: v => chamadas.push(['aba', v]) });
      handler(mesmaAba ? 'documentos' : 'cadastro');
      assert.deepEqual(chamadas, mesmaAba ? [] : ['confirmar']);
    }
    const chamadas = [];
    executar(app, node, { aba: 'documentos', id: 'cadastro', observacaoPendente: true, window: { confirm: () => true },
      setObservacaoPendente: v => chamadas.push(['pendente', v]), setAba: v => chamadas.push(['aba', v]) })('cadastro');
    assert.deepEqual(chamadas, [['pendente', false], ['aba', 'cadastro']]);
  });
}

test('aplicar sugestões não altera cadastro nem abandona observação ao cancelar', () => {
  const chamadas = [];
  const mutacao = nome => () => chamadas.push(nome);
  executar(app, variavel(app, 'PaginaProcesso', 'aplicarIA'), { observacaoPendente: true,
    window: { confirm: () => false }, setObservacaoPendente: mutacao('pendência'), setRascunho: mutacao('cadastro'),
    setIaPaths: mutacao('realce'), mutar: mutacao('auditoria'), setAba: mutacao('aba'), setToast: mutacao('aviso') })([]);
  assert.deepEqual(chamadas, []);
});

test('navegação entre moradores e saída manual conservam sessão e editor ao cancelar', async () => {
  for (const nome of ['ir', 'sair']) {
    const chamadas = [];
    const handler = executar(app, variavel(app, 'App', nome), {
      document: { querySelector: seletor => { assert.ok(seletor.includes('.obs-doc[data-edicao-pendente="true"]')); return {}; } },
      window: { confirm: () => { chamadas.push('confirmar'); return false; } },
      navegacao: { current: 0 }, setMenuAberto: () => chamadas.push('menu'), setAbrindoMunicipio: () => chamadas.push('carregar'),
      mutar: () => chamadas.push('mutar'), compartilhado: { close: () => chamadas.push('fechar sessão') },
      setUsuarioId: () => chamadas.push('usuário'), setJanela: () => chamadas.push('janela')
    });
    await handler({ pag: 'processo', id: 'outro' });
    assert.deepEqual(chamadas, ['confirmar']);
  }
});

test('arquivar com observação pendente exige descarte explícito antes de carregar ou mutar', async () => {
  const node = variavel(arquivo, 'ArquivoCadastros', 'salvar');
  for (const [pendente, aceitar, arquivar, deveMutar] of [[true, false, true, false], [true, true, true, true], [false, false, true, true], [true, false, false, true]]) {
    const chamadas = [];
    const handler = executar(arquivo, node, { document: { querySelector: () => pendente ? {} : null }, window: { confirm: () => { chamadas.push('confirmar'); return aceitar; } },
      setOcupado: () => {}, setErro: () => {}, carregarMunicipio: async () => chamadas.push('carregar'),
      mutar: async () => chamadas.push('mutar'), selecionar: () => {}, setToast: () => {},
      usuario: {}, nomes: { processos: 'Morador' }, nomeRegistro: () => 'Fictício' });
    await handler('processos', { id: 'p1', municipioId: 'm1' }, arquivar);
    assert.equal(chamadas.includes('mutar'), deveMutar);
    assert.equal(chamadas.includes('carregar'), deveMutar);
    assert.equal(chamadas.includes('confirmar'), pendente && arquivar);
  }
});

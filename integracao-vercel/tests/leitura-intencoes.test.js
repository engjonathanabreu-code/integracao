import test from 'node:test';
import assert from 'node:assert/strict';
import {gruposDeLeituraDaIntencao} from '../src/leitura-intencoes.js';
import {tabelasDosGrupos} from '../src/sincronizacao-regras.js';

test('somente Metas e sua auditoria usam escopo restrito com autorização e arquivos atuais',()=>{
 for(const edicoes of [[{colecao:'metas'}],[{colecao:'metas'},{colecao:'auditoria'}],[{colecao:'auditoria'},{colecao:'metas'},{colecao:'metas'}]]){
  const antes=structuredClone(edicoes),grupos=gruposDeLeituraDaIntencao(edicoes),tabelas=tabelasDosGrupos(grupos);
  assert.deepEqual(grupos,['metas','usuarios','auxiliar']);assert.deepEqual(edicoes,antes);
  for(const t of ['profiles','metas','meta_setores','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','meta_arquivos','integracao_metas','integracao_auditoria','integracao_arquivos','integracao_notificacoes'])assert.ok(tabelas.includes(t),t);
  assert.equal(tabelas.includes('erp_mensagens'),false);assert.equal(tabelas.includes('fin_receb_clientes'),false);
 }
});
test('intenções vazias, de arquivos, alheias ou mistas conservam leitura completa',()=>{
 for(const edicoes of [null,undefined,{},[],[{colecao:'auditoria'}],[{colecao:'arquivos'}],[{colecao:'metas'},null],[{colecao:'metas'},{colecao:'arquivos'}],[{colecao:'metas'},{colecao:'nucleos'}],[{colecao:'metas'},{colecao:'notificacoes'}],[{colecao:'metas'},{}]])assert.equal(gruposDeLeituraDaIntencao(edicoes),null);
 const grupos=gruposDeLeituraDaIntencao([{colecao:'metas'}]);grupos.pop();assert.deepEqual(gruposDeLeituraDaIntencao([{colecao:'metas'}]),['metas','usuarios','auxiliar']);
});

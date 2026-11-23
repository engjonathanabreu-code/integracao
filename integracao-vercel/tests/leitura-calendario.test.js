import test from 'node:test';
import assert from 'node:assert/strict';
import {gruposDeLeituraDaIntencao} from '../src/leitura-intencoes.js';
import {tabelasDosGrupos} from '../src/sincronizacao-regras.js';
test('Calendário isolado mantém eventos autorizados, agendas, respostas, contrato, vínculos e arquivos atuais',()=>{
 for(const colecoes of [['eventos'],['agendas'],['eventos','agendas','auditoria']]){
  const edicoes=colecoes.map(colecao=>({colecao})),original=structuredClone(edicoes);
  const grupos=gruposDeLeituraDaIntencao(edicoes),tabelas=tabelasDosGrupos(grupos);
  assert.deepEqual(grupos,['calendario','usuarios','auxiliar']);assert.deepEqual(edicoes,original);
  for(const t of ['erp_agendas','erp_eventos','erp_evento_respostas','integracao_calendario','profiles','integracao_usuarios','integracao_arquivos','integracao_auditoria','integracao_notificacoes'])assert.ok(tabelas.includes(t),t);
  assert.equal(tabelas.includes('erp_mensagens'),false);
  assert.equal(tabelas.includes('fin_receb_clientes'),false);
 }
});
test('Calendário com efeito fora do módulo ou edição desconhecida conserva leitura completa',()=>{
 for(const outras of ['metas','nucleos','processos','notificacoes','arquivos',null])assert.equal(gruposDeLeituraDaIntencao([{colecao:'eventos'},outras?{colecao:outras}:null]),null);
 const grupos=gruposDeLeituraDaIntencao([{colecao:'eventos'}]);grupos.pop();assert.deepEqual(gruposDeLeituraDaIntencao([{colecao:'eventos'}]),['calendario','usuarios','auxiliar']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {classificarFalha,revisaoDeRecusa,orientacaoPendencia} from '../src/estado-sincronizacao.js';
import {resumoDiagnostico,coberturaDispositivos,instalacaoDiagnostico} from '../src/diagnostico-sincronizacao.js';
import {conciliarEdicoes} from '../src/concorrencia.js';
test('sessão, permissão, campos e leituras recebem ações diferentes sem copiar mensagens',()=>{
 for(const [erro,categoria] of [[{status:401},'sessao'],[{code:'PGRST301'},'sessao'],[{status:403,code:'42501'},'permissao'],[{status:422,code:'23503'},'validacao'],[{code:'LEITURA_DIVERGENTE',status:409},'leitura'],[{cause:{status:503}},'transitoria']])assert.equal(classificarFalha(erro).categoria,categoria);
 assert.equal(revisaoDeRecusa({estado:'bloqueado_validacao',erro:{categoria:'sessao'}}),false);
 assert.equal(revisaoDeRecusa({estado:'bloqueado_conflito',enviadoEm:123,erro:{status:409,codigo:'PT409'}}),false);
 assert.equal(classificarFalha(new Error('falha',{cause:new DOMException('quota','QuotaExceededError')})).categoria,'armazenamento');
 assert.equal(revisaoDeRecusa({estado:'bloqueado_validacao',erro:{categoria:'permissao',rejeicaoConfirmada:false}}),false);
 assert.equal(revisaoDeRecusa({estado:'bloqueado_validacao',erro:{categoria:'permissao',rejeicaoConfirmada:true}}),true);
 assert.match(orientacaoPendencia({estado:'bloqueado_validacao',erro:{categoria:'sessao'}}),/mesma conta/);
 assert.match(orientacaoPendencia({estado:'confirmado_aguardando_leitura',recibo:{}}),/somente a leitura/);
});
test('diagnóstico usa lista permitida e contagens sem conteúdo pessoal ou IDs de pedidos',()=>{
 const itens=[{id:'cpf-secreto',estado:'bloqueado_validacao',original:{modulo:'processos',intencao:{cpf:'123'}},erro:{codigo:'23503',message:'senha privada'}},{estado:'bloqueado_validacao',original:{modulo:'processos'},erro:{codigo:'23503'}},{estado:'confirmado',original:{modulo:'metas'}},{estado:'resultado_desconhecido',original:{modulo:'Nome privado'},erro:{codigo:'Um código privado'}}];
 assert.deepEqual(resumoDiagnostico(itens),[{estado:'bloqueado_validacao',modulo:'processos',codigo:'23503',quantidade:2},{estado:'resultado_desconhecido',modulo:'outros',codigo:'OUTRO',quantidade:1}]);
 const storage=new Map(),adapter={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 assert.equal(instalacaoDiagnostico(adapter),instalacaoDiagnostico(adapter));
});
test('ausência de contato, relato antigo e múltiplos aparelhos nunca viram fila vazia atual',()=>{
 const agora=Date.now(),usuarios=[{nome:'A',erpRef:'a',ativo:true},{nome:'B',erpRef:'b',ativo:true}];
 const rows=coberturaDispositivos(usuarios,[{usuario_id:'a',instalacao_id:'1',ultimo_contato:new Date(agora-600000).toISOString(),resumo:[]},{usuario_id:'a',instalacao_id:'2',ultimo_contato:new Date(agora).toISOString(),resumo:[]}],agora);
 assert.deepEqual(rows.map(r=>r.estado),['desconhecido','relato_recente','desconhecido']);assert.equal(rows[2].resumo,undefined);
});
test('conflito preserva base original, local e remoto para revisão',()=>{
 const {conflitos}=conciliarEdicoes({etapa:1},{etapa:2},{etapa:3});assert.equal(conflitos[0].base,1);assert.equal(conflitos[0].local,2);assert.equal(conflitos[0].remoto,3);
});

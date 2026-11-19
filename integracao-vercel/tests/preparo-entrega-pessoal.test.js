import test from 'node:test';
import assert from 'node:assert/strict';
import {preparoEntregaPessoal} from '../src/preparo-entrega-pessoal.js';
const usuario={id:'erp_eu',erpRef:'eu',setor:'topografia',ativo:true};
const meta=(patch={})=>({id:'m1',titulo:'Entrega sintética',status:'Em andamento',prazo:'2026-11-19',responsaveis:['eu'],checklist:[{titulo:'Já feito',concluido:true},{titulo:'Conferir campo',concluido:false},{titulo:'Preparar peças',concluido:false}],...patch});
const preparar=(metas=[meta()],u=usuario,id='m1')=>preparoEntregaPessoal(metas,u,id,'2026-11-19');
test('preparo reúne todos os itens pendentes da meta sem alterar dados ou expor outros campos',()=>{
 const metas=[meta({observacoes:'PRIVADO',comentarios:[{texto:'SEGREDO'}],arquivos:[{nome:'ANEXO_PRIVADO'}]}),meta({id:'m2',titulo:'META ALHEIA',responsaveis:['outro']})];
 const antes=JSON.stringify(metas),r=preparar(metas);
 assert.match(r,/1\. Conferir campo\n2\. Preparar peças/);
 assert.match(r,/Prazo registrado: 2026-11-19/);
 assert.match(r,/não enviado, não salvo/);
 assert.match(r,/anexos não foram examinados/);
 assert.doesNotMatch(r,/Já feito|PRIVADO|SEGREDO|META ALHEIA/);
 assert.equal(JSON.stringify(metas),antes);
});
test('revalida atribuição e status a cada preparo; seleção não autoriza leitura',()=>{
 for(const m of [meta({responsaveis:['outro']}),meta({status:'Concluído'}),meta({status:'Cancelado'}),meta({planejamento:{tipo:'ideia'}})])assert.equal(preparar([m]),null);
 assert.equal(preparar([],usuario),null);
 assert.equal(preparar([meta()],null),null);
 assert.equal(preparar([meta()],{...usuario,ativo:false}),null);
 assert.equal(preparar([meta()],{...usuario,id:'outro',erpRef:'outro'}),null);
 assert.equal(preparar([meta()],usuario,'inexistente'),null);
});
test('aguardando aprovação não vira plano de refazer o checklist',()=>{
 const r=preparar([meta({status:'Aguardando aprovação'})]);
 assert.match(r,/Não refazer a entrega/);
 assert.doesNotMatch(r,/1\. Conferir campo|CHECKLIST PENDENTE REGISTRADO/);
});
test('ID repetido no cache não mistura checklist de meta alheia com atribuição própria',()=>{
 const r=preparar([meta({responsaveis:['outro'],checklist:[{titulo:'ITEM ALHEIO'}]}),meta()]);
 assert.match(r,/Conferir campo/);assert.doesNotMatch(r,/ITEM ALHEIO/);
});
test('prazo inválido e checklist vazio não comprovam urgência nem conclusão',()=>{
 const r=preparar([meta({prazo:'2026-02-30',checklist:[]})]);
 assert.match(r,/Prazo registrado: não informado ou inválido/);
 assert.match(r,/não comprova que a entrega esteja completa/);
 assert.doesNotMatch(r,/Vencida|2026-02-30/);
});
for(const [setor,trecho] of Object.entries({comercial:/medidor oficial/,topografia:/sincronização do campo/,projeto:/regras vigentes do município/,posprotocolo:/não inventar previsão/,juridico:/profissional responsável/,financeiro:/sem presumir pagamento/,consulta:/não concede permissão/,desconhecido:/atribuições atuais/}))test(`orientação de conferência para ${setor} distingue sugestão de exigência`,()=>{
 const r=preparar([meta()],{...usuario,setor});
 assert.match(r,trecho);assert.match(r,/SUGESTÕES, NÃO EXIGÊNCIAS CADASTRADAS/);
});

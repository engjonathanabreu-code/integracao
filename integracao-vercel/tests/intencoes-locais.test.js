import test from 'node:test';import assert from 'node:assert/strict';
import {edicaoSomenteLocal,pendenciaSomenteLocal} from '../src/intencoes-locais.js';
import {extrairIntencao} from '../src/intencoes-edicao.js';
const edicao=()=>({colecao:'usuarios',id:'u',antes:{existe:true,valor:{id:'u',nome:'Pessoa',online:false}},depois:{existe:true,valor:{id:'u',nome:'Pessoa',online:true,ultimaAtividade:'agora'}}});
const item=()=>({estado:'pendente_local',tentativas:0,original:{preparar:true,operacoes:[],intencao:{edicoes:[edicao()],arquivos:{}}}});
test('sinal de atividade não gera intenção nem dependência sobre usuário',()=>{
 const e=edicao();assert.equal(edicaoSomenteLocal(e),true);
 assert.deepEqual(extrairIntencao({usuarios:[e.antes.valor]},{usuarios:[e.depois.valor]}),[]);
 const depois={...e.depois.valor,nome:'Outro'};assert.equal(extrairIntencao({usuarios:[e.antes.valor]},{usuarios:[depois]}).length,1);
});
test('não dispensa criação, exclusão, nome, perfil, permissão, tema ou mistura com processo',()=>{
 for(const campo of ['nome','ativo','tipoERP','setor','tema','agendaPessoal']){const e=edicao();e.depois.valor[campo]='alterado';assert.equal(edicaoSomenteLocal(e),false,campo);}
 for(const lado of ['antes','depois']){const e=edicao();e[lado]={existe:false};assert.equal(edicaoSomenteLocal(e),false);}
 const i=item();i.original.intencao.edicoes.push({colecao:'processos',id:'p',antes:{existe:false},depois:{existe:true,valor:{id:'p'}}});assert.equal(pendenciaSomenteLocal(i),false);
});
test('só dispensa presença não enviada, mantendo resultados desconhecidos e arquivos',()=>{
 assert.equal(pendenciaSomenteLocal(item()),true);
 for(const change of [{tentativas:1},{payload:[]},{recibo:{}},{estado:'resultado_desconhecido'},{estado:'bloqueado_validacao'}])assert.equal(pendenciaSomenteLocal({...item(),...change}),false);
 for(const change of [{legado:{}},{operacoes:[{}]},{preparar:false}]){const i=item();Object.assign(i.original,change);assert.equal(pendenciaSomenteLocal(i),false);}
 const i=item();i.original.intencao.arquivos={chave:'conteudo'};assert.equal(pendenciaSomenteLocal(i),false);
});
test('somente eventos locais de acesso são excluídos, auditoria de negócio permanece',()=>{
 const antes={auditoria:[]},depois={auditoria:[{id:'a',acao:'Entrou no sistema'}]};assert.deepEqual(extrairIntencao(antes,depois),[]);
 depois.auditoria[0].acao='Processo alterado';assert.equal(extrairIntencao(antes,depois).length,1);
});

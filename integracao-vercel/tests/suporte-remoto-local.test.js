import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticosSuporte,prepararRecuperacaoAtualizacao,edicaoVisivelParaAtualizar} from '../src/suporte-remoto-local.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('campo editável visível impede atualização mesmo sem foco ou aviso de edição',()=>{
 const controle={disabled:false,readOnly:false,getClientRects:()=>[{}]},doc=linhas=>({querySelectorAll:()=>linhas});
 assert.equal(edicaoVisivelParaAtualizar(doc([controle])),true);
 assert.equal(edicaoVisivelParaAtualizar(doc([{...controle,readOnly:true}])),false);
 assert.equal(edicaoVisivelParaAtualizar(doc([{...controle,disabled:true}])),false);
 assert.equal(edicaoVisivelParaAtualizar(doc([{...controle,getClientRects:()=>[]}])),false);
 assert.equal(edicaoVisivelParaAtualizar(doc([])),false);
 assert.equal(edicaoVisivelParaAtualizar(null),true,'sem inspeção de DOM não há prova de ponto seguro');
});
test('diagnóstico técnico não transmite originais, valores, recibos, autores ou mensagens',()=>{
 const i={id:id(1),pedido:id(1),estado:'confirmado_aguardando_leitura',tentativas:2,recibo:{dados:'segredo'},original:{unidade:'meta:'+id(2),intencao:{cpf:'documento privado'}},erro:{codigo:'LEITURA_DIVERGENTE',message:'dados pessoais'},dependencias:[id(3)],payload:[{changes:{renda:123}}]};
 const texto=JSON.stringify(diagnosticosSuporte([i]));
 assert.doesNotMatch(texto,/segredo|privado|pessoais|renda|original|payload|changes/);
 assert.equal(JSON.parse(texto)[0].temRecibo,true);
 assert.deepEqual(diagnosticosSuporte([i],id(4)),[]);
 assert.deepEqual(diagnosticosSuporte([{...i,id:'legado:segredo'}]),[]);
 assert.equal(diagnosticosSuporte([{...i,estado:'confirmado'}]).length,0);
 assert.equal(diagnosticosSuporte([{...i,estado:'confirmado'}],i.id).length,1);
});
function caso(){const dados={conta:id(1),originais:['conteúdo preservado']},mapa=new Map();return {dados,mapa,args:{conta:id(1),storage:{set:async(k,v)=>mapa.set(k,v),get:async k=>mapa.get(k)},snapshot:()=>dados,seguro:()=>true,conferir:()=>{},esperar:async()=>{}}};}
test('recuperação local é conferida por leitura antes da atualização e mantém a cópia',async()=>{
 const c=caso();assert.equal(await prepararRecuperacaoAtualizacao(c.args),true);assert.equal(c.mapa.size,1);assert.deepEqual(JSON.parse([...c.mapa.values()][0]),c.dados);
 assert.equal(await prepararRecuperacaoAtualizacao(c.args),true);assert.equal(c.mapa.size,2,'não sobrescreve cópia anterior');
});
test('não libera recarga se surgir edição ou cópia não puder ser comprovada',async()=>{
 for(const mudar of [c=>{c.args.esperar=async()=>{c.dados.novo='edição';};},c=>{c.args.storage.get=async()=>null;},c=>{let n=0;c.args.seguro=()=>++n<3;}]){const c=caso();mudar(c);assert.equal(await prepararRecuperacaoAtualizacao(c.args),false);}
 const c=caso();c.args.storage.set=async()=>{throw new DOMException('quota','QuotaExceededError');};await assert.rejects(prepararRecuperacaoAtualizacao(c.args),{name:'QuotaExceededError'});
});
test('sessão alterada durante persistência impede atualização',async()=>{
 const c=caso();let ativa=true;c.args.conferir=()=>{if(!ativa)throw Object.assign(Error('sessão'),{code:'SESSAO_ALTERADA'});};c.args.storage.set=async()=>{ativa=false;};
 await assert.rejects(prepararRecuperacaoAtualizacao(c.args),{code:'SESSAO_ALTERADA'});
});

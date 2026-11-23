import test from 'node:test';
import assert from 'node:assert/strict';
import {podeAnalisarDevolutiva,podeGerirDevolutivaPosProtocolo,podeAnexarDevolutivaPosProtocolo,comEdicaoDevolutiva,validarLoteDevolutiva} from '../src/metas-identidade.js';
import {registrarContrato,limparContratos} from '../src/permissoes-contrato.js';

const pos={id:'erp_pos',erpRef:'pos',tipoERP:'Pós-protocolo',setor:'posprotocolo',ativo:true};
const meta={id:'m',associacao_tipo:'nucleo',associacao_id:'n',devolutiva:{origem:'Prefeitura',chegada:'2026-11-01',analiseIA:{etapa1:{resumo:'Original'}},registroId:'d'},arquivos:[{id:'a'}],historico:[{id:'h'}],responsaveis:['terceiro'],status:'Em andamento',titulo:'Original',prazo:'2026-11-20'};

test('só o papel canônico ativo cria/edita devolutivas e não ganha análise genérica',()=>{
 for(const usuario of [pos,{...pos,tipoERP:'Pós Protocolo'}]){
  assert(podeGerirDevolutivaPosProtocolo(null,usuario));
  assert(podeGerirDevolutivaPosProtocolo(meta,usuario));
  assert(podeAnexarDevolutivaPosProtocolo(meta,usuario));
  assert(!podeGerirDevolutivaPosProtocolo({...meta,devolutiva:null},usuario));
  assert(!podeGerirDevolutivaPosProtocolo({...meta,associacao_tipo:'plano'},usuario));
  assert(!podeGerirDevolutivaPosProtocolo({...meta,associacao_id:''},usuario));
  assert(!podeAnalisarDevolutiva(meta,usuario));
 }
 for(const usuario of [null,{...pos,ativo:false},{...pos,tipoERP:'Comercial'},{id:'local',setor:'posprotocolo'},{...pos,tipoERP:'Diretor Técnico',setor:'diretoria'}]){
  assert(!podeGerirDevolutivaPosProtocolo(null,usuario));
  assert(!podeGerirDevolutivaPosProtocolo(meta,usuario));
 }
 assert(podeAnalisarDevolutiva(meta,{id:'terceiro',setor:'projeto'}));
 assert(podeAnalisarDevolutiva(meta,{id:'dir',setor:'diretoria'}));
});

test('restrição explícita de contrato prevalece e upload é separado de editar texto',()=>{
 try {
  registrarContrato(pos.erpRef,{regras:{metas:{criar:false},documentos:{criar:false}}});
  assert(!podeGerirDevolutivaPosProtocolo(null,pos));
  assert(podeGerirDevolutivaPosProtocolo(meta,pos));
  assert(!podeAnexarDevolutivaPosProtocolo(meta,pos));
  registrarContrato(pos.erpRef,{regras:{metas:{editar:false}}});
  assert(!podeGerirDevolutivaPosProtocolo(meta,pos));
  registrarContrato(pos.erpRef,{regras:{metas:{ler:false}}});
  assert(!podeGerirDevolutivaPosProtocolo(meta,pos));
  registrarContrato(pos.erpRef,{revisao_compativel:false});
  assert(!podeGerirDevolutivaPosProtocolo(meta,pos));
 } finally { limparContratos(); }
});

test('edição não substitui arquivos, análise, histórico, vínculos nem status',()=>{
 const editada=comEdicaoDevolutiva(meta,{prazo:'2026-12-01',status:'Concluído',analiseIA:null,registroId:'outro'},[{id:'b'}]);
 assert.deepEqual(editada.arquivos,[{id:'a'},{id:'b'}]);
 assert.equal(editada.devolutiva.prazo,'2026-12-01');
 assert.equal(editada.prazo,'2026-11-20','prazo geral da meta não é alterado');
 assert.deepEqual(editada.devolutiva,{...meta.devolutiva,prazo:'2026-12-01'});
 assert.deepEqual({...editada,arquivos:meta.arquivos,devolutiva:meta.devolutiva},meta);
 assert.throws(()=>comEdicaoDevolutiva({...meta,arquivos:Array(5).fill({})},{},[{id:'extra'}]),/até 5/);
 assert.equal(meta.arquivos.length,1);
});

test('anexos validam total cumulativo, extensão, tipo e tamanho',()=>{
 const a={name:'Resposta.PDF',type:'application/pdf',size:12};
 const check=(files,existentes=0)=>validarLoteDevolutiva(files,existentes,['.pdf','.png'],25*1024*1024);
 assert.equal(check([a],4),'');
 assert.match(check([a],5),/até 5/);
 assert.match(check([a,a],4),/até 5/);
 assert.match(check([{...a,name:'codigo.html'}]),/PDF ou imagem/);
 assert.match(check([{...a,type:'text/html'}]),/PDF ou imagem/);
 assert.match(check([{...a,size:0}]),/ter conteúdo/);
 assert.match(check([{...a,size:30*1024*1024}]),/25 MB/);
});

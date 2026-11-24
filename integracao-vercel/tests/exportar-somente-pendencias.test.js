import test from 'node:test';
import assert from 'node:assert/strict';
import {somentePendencias} from '../src/exportar-somente-pendencias.js';
import {id} from './fixture.js';
const original=(edicoes=[],arquivos={})=>({modulo:'metas',intencao:{edicoes,arquivos},base:{token:'INCLUSAO_PROIBIDA'}});
const editar=(a,b,colecao='metas')=>({colecao,id:a.id,antes:{existe:true,valor:a},depois:{existe:true,valor:b}});
const pendente=(o,idFoi=id(8))=>({id:idFoi,pedido:idFoi,estado:'bloqueado_conflito',checksum:'a'.repeat(64),recibo:{bytes:'INCLUSAO_PROIBIDA'},original:o});

test('exportação local inclui só delta permitido e ativo; não contexto, arquivos, recibos ou fila fechada',()=>{
 const anterior={id:id(1),nome:'INCLUSAO_PROIBIDA',status:'Em andamento',historico:[{id:id(2),cpf:'INCLUSAO_PROIBIDA'}]};
 const rogue={id:id(3),acao:'Editada',token:'INCLUSAO_PROIBIDA',apiKey:'INCLUSAO_PROIBIDA',jwt:'INCLUSAO_PROIBIDA',credenciais:{a:'INCLUSAO_PROIBIDA'},privateContext:'INCLUSAO_PROIBIDA',
   foto:'data:image/png;base64,INCLUSAO_PROIBIDA',outro:'data:text/plain,INCLUSAO%5FPROIBIDA',bytes:new Uint8Array([91,62]),
   extra:{password:'INCLUSAO_PROIBIDA',session_id:'INCLUSAO_PROIBIDA',baseline:{cpf:'INCLUSAO_PROIBIDA'},'access-token':'INCLUSAO_PROIBIDA'}};
 const edicao=editar(anterior,{...anterior,status:'Cancelado',historico:[...anterior.historico,rogue]});
 const arq='integracao-meta-arq-v1-'+id(10);
 const ativo=pendente(original([edicao,{colecao:'config',id:id(4),antes:{existe:false},depois:{existe:true,valor:{dados:'INCLUSAO_PROIBIDA'}}}],
   {[arq]:{version:id(11),value:'INCLUSAO_PROIBIDA'},INCLUSAO_PROIBIDA:{version:'opaque',value:'INCLUSAO_PROIBIDA'}}));
 const outras=[{...ativo,id:id(21),pedido:id(21),estado:'confirmado'},{...ativo,id:id(22),pedido:id(22),original:{...original(),legado:{baseline:'INCLUSAO_PROIBIDA'}}}];
 const arquivo=somentePendencias({intencoes:[ativo,...outras],legados:[{dados:'INCLUSAO_PROIBIDA'}]});
 assert.equal(arquivo.pendencias.length,1);assert.equal(arquivo.originaisOpacos,1);assert.equal(arquivo.edicoesOmitidas,1);
 assert.equal(arquivo.arquivosOmitidos,1);assert.ok(arquivo.camposOmitidos>=9);
 assert.equal(arquivo.pendencias[0].versao,'a'.repeat(64));assert.equal(arquivo.incluiArquivos,false);
 assert.deepEqual(arquivo.pendencias[0].arquivos,[{id:arq,versao:id(11)}]);
 assert.deepEqual(arquivo.pendencias[0].mudancas,[
  {caminho:['metas',{id:id(1)},'status'],acao:'substituir',valor:'Cancelado'},
  {caminho:['metas',{id:id(1)},'historico',{id:id(3)}],acao:'incluir',valor:{id:id(3),acao:'Editada'},posicao:1}
 ]);
 assert.doesNotMatch(JSON.stringify(arquivo),/INCLUSAO|recibo|cpf|Em andamento|base64|privateContext|apiKey|credenciais|Uint8Array|000000000002/);
});

test('recusa tipos e IDs malformados em campos nominalmente permitidos e preserva aprovação estruturada',()=>{
 const meta={id:id(1),status:'Aguardando aprovação',solicitacaoConclusao:{id:id(2),solicitanteId:'erp_'+id(3),data:'2026-11-24T10:00:00Z'},checklist:[]};
 const historia={id:'licenca:INCLUSAO_PROIBIDA',acao:'Editada'};
 const foto='data:application/octet-stream,%00%FFINCLUSAO_PROIBIDA';
 const arquitetura=pendente(original([editar(meta,{...meta,semana_inicio:foto,status:'Concluído',solicitacaoConclusao:null,
  checklist:[historia],responsaveis:[new Uint8Array([12,3])]}),editar({...meta,id:'INCLUSAO_PROIBIDA'},meta)]));
 const json=somentePendencias({intencoes:[arquitetura]});
 assert.equal(json.edicoesOmitidas,1);assert.ok(json.camposOmitidos>=3);
 assert.deepEqual(json.pendencias[0].mudancas,[
  {caminho:['metas',{id:id(1)},'status'],acao:'substituir',valor:'Concluído'},
  {caminho:['metas',{id:id(1)},'solicitacaoConclusao'],acao:'substituir',valor:null},
 ]);
 assert.doesNotMatch(JSON.stringify(json),/INCLUSAO|data:|licenca|responsaveis|checklist/);
});

test('edição de responsáveis não repete identidades não afetadas',()=>{
 const anterior={id:id(1),status:'Em andamento',responsaveis:[id(2),id(3)]};
 const atual={...anterior,responsaveis:[id(2),id(4)]};
 const json=somentePendencias({intencoes:[pendente(original([editar(anterior,atual)]))]});
 assert.deepEqual(json.pendencias[0].mudancas,[
  {caminho:['metas',{id:id(1)},'responsaveis',{id:id(3)}],acao:'remover'},
  {caminho:['metas',{id:id(1)},'responsaveis',{id:id(4)}],acao:'incluir',valor:id(4),posicao:1},
 ]);
 assert.doesNotMatch(JSON.stringify(json),/000000000002/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {classificarFalha,orientacaoPendencia} from '../src/estado-sincronizacao.js';

test('P0001 sem status exige revisão sem inventar regra ou campo',()=>{
 assert.equal(classificarFalha({code:'P0001',message:'conteúdo sensível'}).categoria,'validacao');
 const mensagem=orientacaoPendencia({estado:'bloqueado_validacao',erro:{codigo:'P0001',categoria:'validacao',rejeicaoConfirmada:false}});
 assert.match(mensagem,/revisão/);assert.doesNotMatch(mensagem,/conteúdo sensível|foreign|constraint/);
});

import {podeRetomarReleitura} from '../src/estado-sincronizacao.js';
import {motivoEsperaLocal,diagnosticoOperacao} from '../src/diagnostico-sincronizacao.js';
import {sanitizarResultadoSuporte} from '../src/suporte-remoto-executor.js';
const pedido='00000000-0000-4000-8000-000000000001';
const esgotada={id:pedido,pedido,estado:'confirmado_aguardando_leitura',recibo:{aliases:{}},payload:[{table:'metas'}],proximaTentativa:Number.MAX_SAFE_INTEGER,erro:{fase:'releitura',categoria:'transitoria',codigo:'TRANSPORTE',status:503},original:{}};
test('retomada antiga exige recibo, payload, falha de leitura transitória e uma única verificação',()=>{
 assert.equal(podeRetomarReleitura(esgotada,1000),true);
 for(const mudanca of [{recibo:null},{payload:[]},{estado:'resultado_desconhecido'},{proximaTentativa:2000},{leaseAte:2000},{releituraTemporariaVerificada:true},{erro:{...esgotada.erro,codigo:'LEITURA_DIVERGENTE'}},{erro:{...esgotada.erro,status:403}},{erro:{...esgotada.erro,fase:'envio'}},{erro:{...esgotada.erro,categoria:'validacao'}},{erro:{...esgotada.erro,codigo:'RECIBO_INVALIDO'}}])assert.equal(podeRetomarReleitura({...esgotada,...mudanca},1000),false,JSON.stringify(mudanca));
});
test('espera local distingue sessão, processamento e edição sem registrar seus conteúdos',()=>{
 assert.equal(motivoEsperaLocal({sessaoPronta:false}),'sessao_nao_pronta');
 assert.equal(motivoEsperaLocal({processando:true}),'processamento_local');
 assert.equal(motivoEsperaLocal({editando:true}),'edicao_ativa');
 assert.equal(motivoEsperaLocal({} ),null);
 for(const [contexto,motivo] of [[{abrindo:true},'sessao_nao_pronta'],[{processando:true},'processamento_local'],[{editando:true},'edicao_ativa']]){
  const d=diagnosticoOperacao(esgotada,1000,[esgotada],{...contexto,valor:'dado privado',token:'segredo'});
  assert.equal(d.espera.motivo,motivo);assert.doesNotMatch(JSON.stringify(d),/dado privado|segredo/);
  const r=sanitizarResultadoSuporte({codigo:'EM_ANDAMENTO',itens:[{id:pedido,pedido,estado:esgotada.estado,espera:motivo}]});
  assert.equal(r.itens[0].espera,'nao_verificado','motivo local novo não altera o contrato remoto existente');
 }
 assert.equal(diagnosticoOperacao({...esgotada,estado:'confirmado'},1000,[],{editando:true}).espera.motivo,'encerrado');
});

import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('motivos locais permanecem compatíveis com o validador SQL real sem migration',async()=>{
 const db=new PGlite();
 // Execute the actual immutable contract helpers in a disposable database.
 // No business tables, production connection or migration history are involved.
 const sql=readFileSync(new URL('../supabase/migrations/20261112202826_suporte_remoto_exclusivo.sql',import.meta.url),'utf8');
 const helpers=sql.slice(sql.indexOf('create function integracao_suporte_privado.args_validos'),sql.indexOf('-- Installation IDs'));
 const validator=sql.slice(sql.indexOf('create function integracao_suporte_privado.resultado_valido'),sql.indexOf('create function integracao_suporte_privado.registrar'));
 try{
  await db.exec('create schema integracao_suporte_privado;'+helpers+validator);
  for(const motivo of ['sessao_nao_pronta','processamento_local','edicao_ativa']){
   const local={codigo:'EM_ANDAMENTO',itens:[{id:pedido,pedido,estado:esgotada.estado,codigo:'TRANSPORTE',fase:'releitura',tentativas:5,temRecibo:true,dependencias:[],restricao:null,espera:motivo}]};
   await assert.rejects(db.query('select integracao_suporte_privado.resultado_valido($1::jsonb)',[JSON.stringify(local)]),{code:'22023'},'servidor existente não aceita motivos novos');
   const remoto=sanitizarResultadoSuporte(local);
   assert.equal(remoto.itens[0].espera,'nao_verificado');
   await db.query('select integracao_suporte_privado.resultado_valido($1::jsonb)',[JSON.stringify(remoto)]);
   assert.equal(local.itens[0].espera,motivo,'sanitização não apaga diagnóstico local preciso');
  }
 }finally{await db.close();}
});

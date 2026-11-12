import test from 'node:test';
import assert from 'node:assert/strict';
import {classificarFalha,orientacaoPendencia} from '../src/estado-sincronizacao.js';
import {diagnosticoOperacao,resumoDiagnostico} from '../src/diagnostico-sincronizacao.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const item=(n,extra={})=>({id:id(n),pedido:id(n),estado:'pendente_local',ordem:n,dependencias:[],tentativas:0,original:{unidade:'unidade-'+n,preparar:true,operacoes:[],dependencias:[],intencao:{edicoes:[],arquivos:{}}},...extra});
test('23514 guarda somente restrição conhecida, sem mensagem, detalhes, valores ou causas privadas',()=>{
 const e=Object.assign(Error('new row for relation "fin_receb_clientes" violates check constraint "fin_receb_clientes_numero_parcelas_check"'),{status:400,code:'23514',details:'Failing row contains (CPF, renda, senha)'});
 const falha=classificarFalha(new Error('conteúdo privado',{cause:e}));
 assert.equal(falha.restricao,'fin_receb_clientes_numero_parcelas_check');
 assert.doesNotMatch(JSON.stringify(falha),/CPF|renda|senha|message|details|relation/);
 const i=item(1,{estado:'bloqueado_validacao',erro:falha});
 assert.match(orientacaoPendencia(i),/parcelas deve ser positivo/);
 assert.equal(diagnosticoOperacao(i).restricao,falha.restricao);
 assert.equal(Object.hasOwn(resumoDiagnostico([i])[0],'restricao'),false,'telemetria remota continua somente contagens');
 for(const erro of [{code:'23514',message:'check constraint "nome_privado"'},{code:'23503',constraint:e.message},{code:'23514',constraint:'__proto__'},{code:'23514',details:e.message}])assert.equal(Object.hasOwn(classificarFalha(erro),'restricao'),false);
 assert.equal(diagnosticoOperacao(item(1,{erro:{restricao:'nome privado'}})).restricao,null);
});
test('diagnóstico distingue dependência pendente, ausente, substituída e encerrada sem liberar a fila',()=>{
 const a=item(1,{estado:'bloqueado_validacao'}),b=item(2,{dependencias:[a.id]});
 const snapshot=JSON.stringify([a,b]);
 assert.deepEqual(diagnosticoOperacao(b,100,[a,b]).espera,{motivo:'dependencia',pedidos:[{id:a.id,estado:'bloqueado_validacao'}]});
 assert.equal(JSON.stringify([a,b]),snapshot);
 assert.equal(diagnosticoOperacao(b,100,[b]).espera.pedidos[0].estado,'ausente');
 const c=item(3,{estado:'confirmado'}),sub={...a,estado:'substituido',substituidaPor:c.id};
 assert.equal(diagnosticoOperacao(b,100,[sub,b,c]).espera.motivo,'pronto_para_verificacao');
 assert.equal(diagnosticoOperacao({...b,dependencias:['identificador privado']},100,[b]).espera.pedidos[0].id,null);
 assert.equal(diagnosticoOperacao(b).espera.motivo,'nao_verificado');
 const ciclo={...sub,substituidaPor:sub.id};assert.equal(diagnosticoOperacao(b,100,[ciclo,b]).espera.motivo,'dependencia');
});
test('diagnóstico mostra ordem da unidade, reserva, intervalo e retomada manual sem inferir gravação',()=>{
 const a=item(1),b=item(2);b.original.unidade=a.original.unidade;
 assert.deepEqual(diagnosticoOperacao(b,100,[a,b]).espera,{motivo:'pedido_anterior',pedido:a.id});
 for(const [extra,motivo] of [[{leaseAte:200},'reserva_ativa'],[{proximaTentativa:200},'intervalo_de_tentativa'],[{proximaTentativa:Number.MAX_SAFE_INTEGER},'retomada_manual'],[{estado:'confirmado'},'encerrado'],[{estado:'bloqueado_validacao'},'revisao']])assert.equal(diagnosticoOperacao({...b,...extra},100,[a,b]).espera.motivo,motivo);
 assert.equal(diagnosticoOperacao(b,100,[{...a,estado:'dispensado'},b]).espera.motivo,'pronto_para_verificacao');
 assert.equal(diagnosticoOperacao(b,100,[a,b]).outrosAparelhos,'nao_verificado');
});

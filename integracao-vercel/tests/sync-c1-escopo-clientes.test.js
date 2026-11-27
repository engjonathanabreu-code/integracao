// SYNC-C1: salvar uma ficha existente lê só a ficha (e as tabelas de apoio do
// escopo) sobre a base completa anterior, com a mesma projeção da leitura completa.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {escopoDaIntencao,tabelasCompletasDoEscopo,gruposDeLeituraDaIntencao} from '../src/leitura-intencoes.js';
import {definirSessao,lerBase,lerFichaCliente,projetar,baseCompleta,prepararEdicao} from '../src/dados-compartilhados.js';
import {recortarIntencao,aplicarIntencao} from '../src/intencoes-edicao.js';
import {atualizarFichas,clientesDasIntencoes} from '../src/sincronizacao-clientes.js';
import {tabelasProprias} from '../src/persistencia-modulos.js';
import {uuid} from './apoio-sync-fila.js';

const fonte=readFileSync(new URL('../src/dados-compartilhados.js',import.meta.url),'utf8');
const TABLES=JSON.parse(fonte.match(/const TABLES = (\[[^\]]+\])/)[1].replace(/'/g,'"'));
const TODAS=[...new Set([...TABLES,...tabelasProprias,'integracao_arquivos','meta_arquivos','erp_exclusoes_chat','documentos','fin_receb_clientes','integracao_moradores'])];
const EU=uuid(900),U1=uuid(11),MUN=uuid(100),REM=uuid(101),F1=uuid(201),F2=uuid(202),P1=uuid(301),AUD=uuid(91);
const cliente=(id,nome,extra={})=>({id,nome,codigo:'JV-01-'+id.slice(-3),municipio_id:MUN,remessa_id:REM,cpf_cnpj:'000',ativo:true,valor_global:1000,valor_entrada:0,numero_parcelas:10,valor_parcela:100,primeiro_vencimento:'2026-12-10',dia_vencimento:10,...extra});
const complemento=(registro,ref,dados)=>({colecao:'processos',registro_id:registro,referencia_tabela:'fin_receb_clientes',referencia_id:ref,dados:{municipioId:MUN,...dados}});
const servidorInicial=()=>({...Object.fromEntries(TODAS.map(t=>[t,[]])),
 profiles:[{id:U1,nome:'Ana',email:'a@x',tipo:'Analista',setor:'Projetos',ativo:true}],
 fin_receb_municipios:[{id:MUN,nome:'Cidade Fictícia',uf:'SC',prefixo:'JV'}],
 fin_receb_remessas:[{id:REM,municipio_id:MUN,codigo:'JV01',nome:'Remessa 1'}],
 fin_receb_clientes:[cliente(F1,'Pessoa Um'),cliente(F2,'Pessoa Dois')],
 integracao_moradores:[complemento(P1,F1,{etapa:1,endereco:{bairro:'Centro'}}),complemento(F2,F2,{etapa:0})],
});
function servidorFalso(db,chamadas){
 return async(url,options={})=>{
  const [caminho,busca='']=String(url).split('/rest/v1/')[1].split('?');chamadas.push(caminho);
  if(caminho==='rpc/integracao_atribuicoes_contrato_ler')return Response.json({regras:{}});
  if(caminho==='rpc/erp_collab_directory')return Response.json(db.profiles.map(({id,nome,tipo,setor})=>({id,nome,tipo,setor})));
  if(caminho==='rpc/integracao_contagens_clientes')return Response.json({});
  if(caminho==='rpc/integracao_moradores_carga'){
   const {municipio}=JSON.parse(options.body),clientes=db.fin_receb_clientes.filter(c=>c.municipio_id===municipio),ids=new Set(clientes.map(c=>c.id));
   return Response.json(structuredClone({clientes,complementos:db.integracao_moradores.filter(e=>ids.has(e.referencia_id)),total:clientes.length}));
  }
  let linhas=[...(db[caminho==='rpc/integracao_eventos'?'erp_eventos':caminho]||[])];
  for(const par of busca.split('&')){
   const i=par.indexOf('='),k=par.slice(0,i),v=decodeURIComponent(par.slice(i+1));
   if(v.startsWith('eq.'))linhas=linhas.filter(r=>String(r[k])===v.slice(3));
   if(v.startsWith('in.(')){const vs=v.slice(4,-1).split(',').map(x=>x.replace(/^"(.*)"$/,'$1'));linhas=linhas.filter(r=>vs.includes(String(r[k])));}
  }
  return Response.json(structuredClone(linhas));
 };
}
async function comServidor(db,corpo){
 const original=globalThis.fetch,chamadas=[];globalThis.fetch=servidorFalso(db,chamadas);
 definirSessao({user:{id:EU},access_token:'t',refresh_token:'r',expires_in:3600});
 try{return {r:await corpo(),chamadas};}finally{globalThis.fetch=original;definirSessao(null);}
}
const ed=(colecao,id,antes,depois)=>({colecao,id,antes:antes===undefined?{existe:false}:{existe:true,valor:antes},depois:depois===undefined?{existe:false}:{existe:true,valor:depois}});
const limpar=x=>JSON.parse(JSON.stringify(x));
// Mesma sequência de `carregar` do diário: base (completa ou por escopo) e depois as fichas da intenção.
const lerComo=(servidor,edicoes,{escopo=null,anterior=null}={})=>comServidor(servidor,async()=>{
 const base=await lerBase({municipios:[MUN],tabelas:escopo?tabelasCompletasDoEscopo(escopo):null,anterior,semCache:true,escopo});
 return atualizarFichas(base,clientesDasIntencoes(edicoes),lerFichaCliente,{anterior});
});

test('SYNC-C1: edição de ficha existente tem escopo; criação, remoção e mistura não mapeada mantêm leitura completa',()=>{
 const ficha={id:P1,financeiroRef:F1,municipioId:MUN};
 const escopo=escopoDaIntencao({edicoes:[ed('processos',P1,ficha,{...ficha,etapa:2}),ed('auditoria',AUD,undefined,{id:AUD,acao:'Cadastro alterado'})]},{});
 assert.deepEqual(escopo.integracao_complementos,{coluna:'registro_id',ids:[P1,AUD]});
 assert.ok(escopo.integracao_auditoria);
 // As tabelas da ficha não entram na leitura geral: são relidas por registro.
 assert.equal(escopo.fin_receb_clientes,undefined);assert.equal(escopo.integracao_moradores,undefined);
 assert.deepEqual(tabelasCompletasDoEscopo(escopo),['profiles','integracao_usuarios','integracao_arquivos']);
 assert.equal(escopoDaIntencao({edicoes:[ed('processos',P1,undefined,ficha)]},{}),null,'criação');
 assert.equal(escopoDaIntencao({edicoes:[ed('processos',P1,ficha,undefined)]},{}),null,'remoção');
 assert.equal(escopoDaIntencao({edicoes:[ed('processos',P1,ficha,{...ficha,etapa:2}),ed('nucleos',uuid(7),{id:uuid(7)},{id:uuid(7),nome:'n'})]},{}),null,'mistura');
 assert.equal(gruposDeLeituraDaIntencao([ed('processos',P1,ficha,{...ficha,etapa:2})]),null);
});

test('SYNC-C1: projeção por escopo == projeção completa para a ficha da intenção; o resto da base não é relido',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo);
 // Outra pessoa alterou a mesma ficha (colunas do financeiro e complemento) e uma ficha vizinha.
 novo.fin_receb_clientes[0]=cliente(F1,'Pessoa Um Atualizada',{valor_global:2000});
 novo.integracao_moradores[0]=complemento(P1,F1,{etapa:3,endereco:{bairro:'Norte'}});
 novo.fin_receb_clientes[1]=cliente(F2,'Vizinha alterada');
 const anterior=projetar((await comServidor(antigo,()=>lerBase({municipios:[MUN]}))).r,{}).base;
 assert.ok(baseCompleta(anterior));
 const fichaAntes=projetar(anterior,{}).db.processos.find(p=>p.id===P1);
 assert.equal(fichaAntes.financeiroRef,F1);
 const edicoes=[ed('processos',P1,fichaAntes,{...fichaAntes,etapa:2}),ed('auditoria',AUD,undefined,{id:AUD,acao:'Cadastro alterado'})];
 const escopo=escopoDaIntencao({edicoes},{});
 const porEscopo=await lerComo(novo,edicoes,{escopo,anterior:structuredClone(anterior)});
 const completa=await lerComo(novo,edicoes);
 const a=projetar(porEscopo.r,{}),b=projetar(completa.r,{});
 const so=[edicoes[0]];
 assert.deepEqual(limpar(recortarIntencao(a.db,so)),limpar(recortarIntencao(b.db,so)));
 assert.equal(a.db.processos.find(p=>p.id===P1).requerente.nome,'Pessoa Um Atualizada');
 assert.equal(a.db.processos.find(p=>p.id===P1).endereco.bairro,'Norte');
 const vinc=s=>limpar(s.bindings.filter(x=>x.id===P1).map(({collection,id,table,key,row})=>({collection,id,table,key,row})));
 assert.deepEqual(vinc(a),vinc(b),'vínculos de gravação da ficha');
 const comp=s=>limpar(s.base.integracao_complementos.filter(e=>e.registro_id===P1));
 assert.deepEqual(comp(a),comp(b),'complemento esperado pela gravação');
 // A ficha vizinha fica como na base anterior (igual às outras metas na leitura por escopo de Metas).
 assert.equal(a.db.processos.find(p=>p.financeiroRef===F2).requerente.nome,'Pessoa Dois');
 // Só RPCs de contrato/diretório, tabelas de apoio, complementos filtrados e a ficha.
 assert.ok(!porEscopo.chamadas.includes('rpc/integracao_moradores_carga'),'o município inteiro não é relido');
 assert.ok(!porEscopo.chamadas.includes('rpc/integracao_contagens_clientes'));
 const permitidas=new Set(['rpc/integracao_atribuicoes_contrato_ler','rpc/erp_collab_directory','profiles','integracao_usuarios','integracao_arquivos','integracao_complementos','integracao_auditoria','fin_receb_clientes','integracao_moradores']);
 assert.deepEqual(porEscopo.chamadas.filter(c=>!permitidas.has(c)),[]);
 // Medição: um salvamento faz duas leituras (antes de enviar e depois de confirmar).
 const antes=2*completa.chamadas.length,depois=2*porEscopo.chamadas.length;
 console.log(`SYNC-C1 medição: requisições de leitura por salvamento de ficha = ${antes} antes, ${depois} depois (${completa.chamadas.length} → ${porEscopo.chamadas.length} por leitura)`);
 assert.ok(porEscopo.chamadas.length<=10&&completa.chamadas.length>=40,`${porEscopo.chamadas.length} vs ${completa.chamadas.length}`);
});

test('SYNC-C1: ficha apagada ou oculta no servidor some também na leitura por escopo',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo);
 novo.fin_receb_clientes=novo.fin_receb_clientes.filter(c=>c.id!==F1);novo.integracao_moradores=novo.integracao_moradores.filter(e=>e.referencia_id!==F1);
 const anterior=projetar((await comServidor(antigo,()=>lerBase({municipios:[MUN]}))).r,{}).base;
 const fichaAntes=projetar(anterior,{}).db.processos.find(p=>p.id===P1);
 const edicoes=[ed('processos',P1,fichaAntes,{...fichaAntes,etapa:2})];
 const porEscopo=await lerComo(novo,edicoes,{escopo:escopoDaIntencao({edicoes},{}),anterior:structuredClone(anterior)});
 assert.equal(porEscopo.r.fin_receb_clientes.some(c=>c.id===F1),false);
 assert.equal(porEscopo.r.integracao_moradores.some(e=>e.registro_id===P1),false);
});

test('a fila recupera o vínculo atual por identidade e prepara uma edição sem criar nem trocar a ficha',async()=>{
 const antigo=servidorInicial(),novo=structuredClone(antigo),vinculoAtual=uuid(203);
 novo.fin_receb_clientes[0]={...novo.fin_receb_clientes[0],id:vinculoAtual};
 novo.integracao_moradores[0].referencia_id=vinculoAtual;
 const anterior=projetar((await comServidor(antigo,()=>lerBase({municipios:[MUN]}))).r,{}).base;
 const fichaAntes=projetar(anterior,{}).db.processos.find(p=>p.id===P1);
 const edicoes=[ed('processos',P1,fichaAntes,{...fichaAntes,etapa:2})];
 const {r}=await lerComo(novo,edicoes,{escopo:escopoDaIntencao({edicoes}),anterior:structuredClone(anterior)});
 const state=projetar(r,{}),merge=aplicarIntencao(state.db,edicoes);
 assert.equal(state.db.processos.find(p=>p.id===P1).financeiroRef,vinculoAtual);
 assert.equal(state.db.processos.filter(p=>p.id===P1).length,1);
 assert.deepEqual(merge.conflitos,[]);
 const ops=prepararEdicao(state.db,merge.dados,state,state.db.usuarios[0]);
 assert.equal(ops.length,1);
 assert.equal(ops[0].table,'integracao_moradores');
 assert.equal(ops[0].key.registro_id,P1);
 assert.equal(ops[0].changes.dados.etapa,2);
 assert.equal(ops[0].insert,undefined);
 assert.equal(ops[0].changes.referencia_id,undefined);
});

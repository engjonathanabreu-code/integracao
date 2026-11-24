import {igualSemantico} from './igualdade-semantica.js';
import {terminal} from './estado-sincronizacao.js';
import {ETAPAS_PROCESSO} from './processo-etapas.js';

const padraoUUID='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const rexUUID=new RegExp('^'+padraoUUID+'$','i');
const uuid=x=>typeof x==='string'&&rexUUID.test(x);
const pessoa=x=>typeof x==='string'&&uuid(x.replace(/^erp_/,''));
const data=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x));
const instante=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const escolha=(...valores)=>x=>valores.includes(x);
const booleano=x=>typeof x==='boolean';
const posicao=x=>Number.isSafeInteger(x)&&x>=0&&x<100000;
const opcional=t=>x=>x===null||x===''||t(x);
const prioridade=escolha('Normal','Baixa','Alta','Urgente');
const listaEscalares=t=>({listaEscalar:t});
const escalaresValidos=(x,t)=>Array.isArray(x)&&x.every(t)&&new Set(x).size===x.length;
const comId=campos=>({id:uuid,...campos});
const lista=t=>({lista:t});
const tipos={
 metas:comId({status:escolha('Em andamento','Aguardando aprovação','Concluído','Cancelado'),
  semana_inicio:opcional(data),prazo:opcional(data),erpId:opcional(uuid),responsaveis:listaEscalares(pessoa),
  associacao_tipo:escolha('avulsa','nucleo','ordem_servico','projeto','plano'),associacao_id:opcional(uuid),
  checklist:lista(comId({concluido:booleano,concluido_em:opcional(instante)})),
  solicitacaoConclusao:{id:uuid,solicitanteId:pessoa,data:instante},
  historico:lista(comId({acao:escolha('Criada','Editada','Conclusão solicitada','Conclusão aprovada','Conclusão recusada','Checklist adicionado','Checklist removido','Arquivo enviado','Arquivo removido'),
   autorId:pessoa,data:instante}))}),
 nucleos:comId({prioridade,prazoSLA:opcional(data),etapaProcesso:escolha(...ETAPAS_PROCESSO),etapaIniciadaEm:opcional(instante),municipioId:uuid}),
 processos:comId({municipioId:uuid,remessaId:opcional(uuid),nucleoId:opcional(uuid),situacao:escolha('Ativo','Inativo','Pendente')}),
 remessas:comId({municipioId:uuid,numero:posicao,criada:opcional(data)}),
 municipios:comId({uf:escolha('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')}),
 eventos:comId({status:escolha('ativo','cancelado'),inicio:instante,fim:instante,agendaId:opcional(uuid),
  participantes:listaEscalares(pessoa),publico:booleano,recorrencia:escolha('nenhuma','diaria','semanal','mensal'),recorrenciaAte:opcional(data)}),
 planos:comId({status:escolha('Planejamento','Em andamento','Concluído','Cancelado'),projetoId:opcional(uuid),
  etapas:lista(comId({status:escolha('Pendente','Em andamento','Concluída'),prioridade,ordem:posicao,inicio:opcional(data),prazo:opcional(data),responsaveis:listaEscalares(pessoa)}))}),
};
const objeto=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const listaComId=x=>Array.isArray(x)&&x.every(y=>objeto(y)&&uuid(y.id))&&new Set(x.map(y=>y.id)).size===x.length;
const possui=(obj,k)=>Object.hasOwn(obj,k);
const nenhum=Symbol('omitido');
const refArquivo=new RegExp('^(?:'+padraoUUID+'\\|integracao-(?:campo-offline-v1|comercial-offline-v1|doc-offline-v1-'+padraoUUID+')|integracao-(?:prf-modelo-v4|(?:prf-modelo-mun-v1|foto-v4|timbrado-v1|kml-v1|devolutiva-v1|meta-arq-v1)-'+padraoUUID+'))$','i');
const estadoAtivo=new Set(['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura','bloqueado_conflito','bloqueado_validacao','persistencia_falhou','legado_revisao']);

function limpar(x,t,contagem){
 if(typeof t==='function'){
  if(t(x))return x;
  contagem.camposOmitidos++;return nenhum;
 }
 if(possui(t,'listaEscalar')){
  if(escalaresValidos(x,t.listaEscalar))return x;
  contagem.camposOmitidos++;return nenhum;
 }
 if(possui(t,'lista')){
  if(!listaComId(x)){contagem.camposOmitidos++;return nenhum;}
  return x.map(v=>limpar(v,t.lista,contagem));
 }
 if(x===null)return null;
 if(!objeto(x)){contagem.camposOmitidos++;return nenhum;}
 const saida={};
 for(const [k,v] of Object.entries(x)){
  if(!possui(t,k)){contagem.camposOmitidos++;continue;}
  const limpo=limpar(v,t[k],contagem);
  if(limpo!==nenhum)saida[k]=limpo;
 }
 return saida;
}
function mudar(a,b,caminho,t,mudancas,contagem){
 if(igualSemantico(a,b))return;
 if(objeto(a)&&objeto(b)&&typeof t!=='function'&&!possui(t,'lista')&&!possui(t,'listaEscalar')){
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
   if(possui(t,k))mudar(a[k],b[k],[...caminho,k],t[k],mudancas,contagem);
   else if(!igualSemantico(a[k],b[k]))contagem.camposOmitidos++;
  }
  return;
 }
 if(typeof t!=='function'&&possui(t,'listaEscalar')&&Array.isArray(a)&&Array.isArray(b)){
  if(!escalaresValidos(a,t.listaEscalar)||!escalaresValidos(b,t.listaEscalar)){contagem.camposOmitidos++;return;}
  const antes=new Set(a),depois=new Set(b);
  for(const id of a)if(!depois.has(id))mudancas.push({caminho:[...caminho,{id}],acao:'remover'});
  for(const [posicao,id] of b.entries())if(!antes.has(id))mudancas.push({caminho:[...caminho,{id}],acao:'incluir',valor:id,posicao});
  const antigas=a.filter(x=>depois.has(x)),novas=b.filter(x=>antes.has(x));
  if(!igualSemantico(antigas,novas))mudancas.push({caminho,acao:'ordenar',valor:novas.flatMap((id,posicao)=>id===antigas[posicao]?[]:[{id,posicao}])});
  return;
 }
 if(typeof t!=='function'&&possui(t,'lista')&&Array.isArray(a)&&Array.isArray(b)){
  if(!listaComId(a)||!listaComId(b)){contagem.camposOmitidos++;return;}
  const indA=new Map(a.map(x=>[x.id,x])),indB=new Map(b.map(x=>[x.id,x])),posB=new Map(b.map((x,i)=>[x.id,i]));
  for(const id of new Set([...indA.keys(),...indB.keys()])){
   const p=[...caminho,{id}];
   const inicio=mudancas.length;
   mudar(indA.get(id),indB.get(id),p,t.lista,mudancas,contagem);
   if(!indA.has(id)&&mudancas.length===inicio+1)mudancas[inicio].posicao=posB.get(id);
  }
  const antigas=[...indA.keys()].filter(id=>indB.has(id)),novas=[...indB.keys()].filter(id=>indA.has(id));
  if(!igualSemantico(antigas,novas))mudancas.push({caminho,acao:'ordenar',valor:novas.flatMap((id,posicao)=>id===antigas[posicao]?[]:[{id,posicao}])});
  return;
 }
 if(b===undefined){mudancas.push({caminho,acao:'remover'});return;}
 const limpo=limpar(b,t,contagem);
 if(limpo===nenhum)return;
 // When opaque fields alone changed, their sanitised representation may stay
 // equal. Do not mislabel them as an exported change.
 if(a!==undefined&&typeof t!=='function'&&igualSemantico(limpar(a,t,{camposOmitidos:0}),limpo))return;
 mudancas.push({caminho,acao:a===undefined?'incluir':'substituir',valor:limpo});
}

export function somentePendencias({intencoes=[],naoPersistidas=[]}={}){
 const pendencias=[],contagem={camposOmitidos:0,edicoesOmitidas:0,originaisOpacos:0,arquivosOmitidos:0};
 for(const i of [...intencoes,...naoPersistidas.map(o=>({id:o.id,estado:'persistencia_falhou',original:o}))]){
  if(!i?.original||terminal(i))continue;
  const o=i.original,edicoes=o.intencao?.edicoes;
  if(o.legado||!Array.isArray(edicoes)){contagem.originaisOpacos++;continue;}
  const mudancas=[];
  for(const e of edicoes){
   if(!e||!possui(tipos,e.colecao)||!uuid(e.id)||typeof e.antes?.existe!=='boolean'||typeof e.depois?.existe!=='boolean'||
      e.antes.existe&&(!objeto(e.antes.valor)||e.antes.valor.id!==e.id)||e.depois.existe&&(!objeto(e.depois.valor)||e.depois.valor.id!==e.id)){
    contagem.edicoesOmitidas++;continue;
   }
   mudar(e.antes.existe?e.antes.valor:undefined,e.depois.existe?e.depois.valor:undefined,[e.colecao,{id:e.id}],tipos[e.colecao],mudancas,contagem);
  }
  const arquivos=[];
  for(const [id,f] of Object.entries(o.intencao?.arquivos||{})){
   if(!refArquivo.test(id)||!uuid(f?.version)){contagem.arquivosOmitidos++;continue;}
   arquivos.push({id,versao:f.version});
  }
  pendencias.push({pedido:uuid(i.pedido||i.id)?i.pedido||i.id:null,estado:estadoAtivo.has(i.estado)?i.estado:'desconhecido',
   modulo:possui(tipos,o.modulo)?o.modulo:arquivos.length?'arquivos':'outros',
   versao:typeof i.checksum==='string'&&/^[0-9a-f]{64}$/i.test(i.checksum)?i.checksum:null,mudancas,arquivos});
 }
 return {versao:1,tipo:'somente_pendencias',incluiArquivos:false,...contagem,pendencias};
}

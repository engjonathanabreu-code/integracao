import {terminal} from './estado-sincronizacao.js';
import {restricaoPermitida} from './diagnostico-validacao.js';
import {escopoArquivosDaIntencao} from './arquivos-intencoes.js';
const estados=new Set(['persistencia_falhou','legado_revisao','pendente_local','resultado_desconhecido','confirmado_aguardando_leitura','bloqueado_conflito','bloqueado_validacao','falha_transitoria']);
const modulos=new Set(['processos','municipios','remessas','nucleos','metas','planos','ordensServico','eventos','usuarios','arquivos','auditoria','config','crmCards','crmAtendimentos','crmTarefas','conversas','mensagens','pontoBatidas','pontoSolicitacoes','marketingGrupos']);
const codigos=new Set(['SESSAO_EXPIRADA','SESSAO_AUSENTE','TRANSPORTE','LEITURA_DIVERGENTE','ARQUIVO_LOCAL_AUSENTE','RESPONSAVEL_INDISPONIVEL','IDENTIDADE_OUTRA_META','PERSISTENCIA_INDISPONIVEL','PERSISTENCIA_ABORTADA','FILA_BLOQUEADA']);
export function resumoDiagnostico(itens){
 const grupos=new Map();
 for(const i of itens.filter(i=>!terminal(i))){
  const estado=estados.has(i.estado)?i.estado:'legado_revisao',modulo=modulos.has(i.original?.modulo)?i.original.modulo:'outros';
  const bruto=String(i.erro?.codigo||'SEM_ERRO'),codigo=bruto==='SEM_ERRO'||codigos.has(bruto)||/^[0-9A-Z]{5}$/.test(bruto)?bruto:'OUTRO';
  const chave=JSON.stringify([estado,modulo,codigo]),grupo=grupos.get(chave)||{estado,modulo,codigo,quantidade:0};grupo.quantidade++;grupos.set(chave,grupo);
 }
 return [...grupos.values()];
}
export function instalacaoDiagnostico(storage=globalThis.localStorage){
 const chave='integracao-diagnostico-instalacao';let id=storage.getItem(chave);
 if(!/^[0-9a-f-]{36}$/i.test(id||'')){id=crypto.randomUUID();storage.setItem(chave,id);}
 return id;
}
export function coberturaDispositivos(usuarios,relatos,agora=Date.now()){
 return usuarios.filter(u=>u.ativo&&u.erpRef).flatMap(u=>{
  const rows=relatos.filter(r=>r.usuario_id===u.erpRef);
  return rows.length?rows.map(r=>({...r,nome:u.nome,estado:agora-Date.parse(r.ultimo_contato)<300000?'relato_recente':'desconhecido'})):[{usuario_id:u.erpRef,nome:u.nome,estado:'desconhecido'}];
 });
}

// USO-C4 — aparelhos cujo último relato tinha pendências e que estão sem
// contato há mais de dois dias: o que ficou neles só sai quando alguém abrir o
// sistema ali. Só leitura, sobre os mesmos relatos já consultados acima.
// O relato não traz a idade de cada pendência; por isso a regra é o tempo sem
// contato, e aparelho com contato recente nunca entra na lista.
export const LIMITE_PENDENCIA_PARADA_MS=48*60*60*1000;
const quantidade=g=>Number.isSafeInteger(g?.quantidade)&&g.quantidade>0?g.quantidade:0;
export function aparelhosComPendenciaParada(usuarios,relatos,agora=Date.now(),limite=LIMITE_PENDENCIA_PARADA_MS){
 const nomes=new Map((usuarios||[]).filter(u=>u?.erpRef).map(u=>[u.erpRef,u.nome]));
 return (relatos||[]).map(r=>{
  const resumo=Array.isArray(r?.resumo)?r.resumo:[],contato=Date.parse(r?.ultimo_contato);
  return {usuario_id:r?.usuario_id,instalacao_id:r?.instalacao_id,nome:nomes.get(r?.usuario_id)||'Conta fora da lista de usuários',versao:r?.versao||'',
   ultimo_contato:r?.ultimo_contato,semContatoMs:Number.isFinite(contato)?agora-contato:NaN,
   pendencias:resumo.reduce((n,g)=>n+quantidade(g),0),arquivos:resumo.filter(g=>g?.modulo==='arquivos').reduce((n,g)=>n+quantidade(g),0)};
 }).filter(r=>r.pendencias>0&&r.semContatoMs>limite)
  .map(r=>({...r,dias:Math.floor(r.semContatoMs/86400000)}))
  .sort((a,b)=>b.semContatoMs-a.semContatoMs||b.pendencias-a.pendencias||String(a.instalacao_id).localeCompare(String(b.instalacao_id)));
}

// Local per-operation diagnostics deliberately omit originals, values, paths,
// record/resource identifiers, server messages and payload/receipt contents.
export const VERSAO_CLIENTE=import.meta.env?.VITE_BUILD_ID||'sync-evolution-1';
const fases=new Set(['preparacao','envio','recibo','releitura']);
const identificador=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v:null;
const numero=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function esperaOperacao(i,itens,agora){
 if(!Array.isArray(itens))return {motivo:'nao_verificado'};
 if(terminal(i))return {motivo:'encerrado'};
 if(!['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura'].includes(i.estado))return {motivo:'revisao'};
 if(i.proximaTentativa===Number.MAX_SAFE_INTEGER)return {motivo:'retomada_manual'};
 if(i.proximaTentativa>agora)return {motivo:'intervalo_de_tentativa'};
 if(i.leaseAte>agora)return {motivo:'reserva_ativa'};
 const anterior=itens.find(a=>a.ordem<i.ordem&&a.original?.unidade===i.original?.unidade&&!terminal(a));
 if(anterior)return {motivo:'pedido_anterior',pedido:identificador(anterior.id)};
 const resolver=id=>{let d=itens.find(x=>x.id===id);const vistos=new Set();while(d?.substituidaPor&&!vistos.has(d.id)){vistos.add(d.id);d=itens.find(x=>x.id===d.substituidaPor);}return d;};
 const dependencias=escopoArquivosDaIntencao(i,itens)?.dependencias||i.dependencias||i.original?.dependencias||[];
 const bloqueios=dependencias.map(id=>({id:identificador(id),item:resolver(id)})).filter(d=>!d.item||!['confirmado','dispensado'].includes(d.item.estado));
 return bloqueios.length?{motivo:'dependencia',pedidos:bloqueios.map(d=>({id:d.id,estado:d.item?(estados.has(d.item.estado)||terminal(d.item)?d.item.estado:'desconhecido'):'ausente'}))}:{motivo:'pronto_para_verificacao'};
}
// Only enumerated local guards are reported. No DOM values, tokens, account
// names, server messages or edit contents enter this diagnostic.
export function motivoEsperaLocal({diarioPronto=true,abrindo=false,basePronta=true,sessaoPronta=true,processando=false,editando=false}={}){
 if(!diarioPronto||abrindo||!basePronta||!sessaoPronta)return 'sessao_nao_pronta';
 if(processando)return 'processamento_local';
 if(editando)return 'edicao_ativa';
 return null;
}
export function diagnosticoOperacao(i,agora=Date.now(),itens=null,contexto=null){
 const fase=fases.has(i.fase)?i.fase:fases.has(i.erro?.fase)?i.erro.fase:null;
 const bruto=String(i.erro?.codigo||'SEM_ERRO');
 const codigo=bruto==='SEM_ERRO'||codigos.has(bruto)||/^[0-9A-Z]{5}$/.test(bruto)?bruto:'OUTRO';
 const situacao=i.recibo?(i.lidoEm?'leitura_confirmada':i.erro?.codigo==='LEITURA_DIVERGENTE'?'gravado_leitura_divergente':'gravado_leitura_pendente')
  :i.enviadoEm?(i.erro?.rejeicaoConfirmada?'recusado':'resultado_incerto'):i.estado?.startsWith('bloqueado')?'recusado':'nao_enviado';
 const versao=typeof i.clienteVersao==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(i.clienteVersao)?i.clienteVersao:'anterior';
 return {id:identificador(i.id),pedido:identificador(i.pedido),cliente:versao,estado:estados.has(i.estado)||terminal(i)?i.estado:'legado_revisao',fase,situacao,codigo,
  criadoEm:numero(i.criadoEm),atualizadoEm:numero(i.atualizadoEm),enviadoEm:numero(i.enviadoEm),confirmadoEm:numero(i.confirmadoEm),lidoEm:numero(i.lidoEm),
  tempoMs:numero(i.criadoEm)!==null?Math.max(0,(numero(i.lidoEm)||agora)-i.criadoEm):null,tentativas:numero(i.tentativas)||0,tentativasTotais:numero(i.tentativasTotais),
  dependencias:(i.escopoArquivos?.dependencias||i.dependencias||[]).map(identificador).filter(Boolean),
  propagacao:i.lidoEm?'confirmada_neste_aparelho':'nao_verificada',outrosAparelhos:'nao_verificado',restricao:restricaoPermitida(i.erro?.restricao),espera:!terminal(i)&&contexto&&motivoEsperaLocal(contexto)?{motivo:motivoEsperaLocal(contexto)}:esperaOperacao(i,itens,agora)};
}

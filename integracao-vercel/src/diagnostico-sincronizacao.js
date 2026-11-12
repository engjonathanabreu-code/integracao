import {terminal} from './estado-sincronizacao.js';
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

// Local per-operation diagnostics deliberately omit originals, values, paths,
// record/resource identifiers, server messages and payload/receipt contents.
export const VERSAO_CLIENTE=import.meta.env?.VITE_BUILD_ID||'sync-evolution-1';
const fases=new Set(['preparacao','envio','recibo','releitura']);
const identificador=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v:null;
const numero=v=>Number.isSafeInteger(v)&&v>=0?v:null;
export function diagnosticoOperacao(i,agora=Date.now()){
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
  propagacao:i.lidoEm?'confirmada_neste_aparelho':'nao_verificada',outrosAparelhos:'nao_verificado'};
}

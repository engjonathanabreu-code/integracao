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

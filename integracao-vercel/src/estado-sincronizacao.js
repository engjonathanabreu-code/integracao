import {restricaoDaFalha,orientacaoRestricao} from './diagnostico-validacao.js';
export const terminal=i=>['confirmado','substituido','dispensado'].includes(i.estado);
export function classificarFalha(e){
 const restricao=restricaoDaFalha(e);
 const vistos=new Set(),nomes=new Set();let status,codigo;
 while(e&&!vistos.has(e)){vistos.add(e);status??=e.status;codigo??=e.code;nomes.add(e.name);e=e.cause;}
 status=Number(status);codigo=String(codigo||'TRANSPORTE').slice(0,60);
 const categoria=status===401||['SESSAO_EXPIRADA','SESSAO_AUSENTE','PGRST301','PGRST302','PGRST303'].includes(codigo)?'sessao'
  :status===403||codigo==='42501'?'permissao'
  :codigo.startsWith('PERSISTENCIA')||['QuotaExceededError','InvalidStateError'].some(n=>nomes.has(n))?'armazenamento'
  :codigo==='LEITURA_DIVERGENTE'?'leitura'
  :status===409||codigo==='PT409'?'conflito'
  :[400,404,422].includes(status)||/^(22|23)/.test(codigo)?'validacao':'transitoria';
 return {status:Number.isFinite(status)?status:null,codigo,categoria,...(restricao?{restricao}:{})};
}
// Before phase tracking, a receipt failure could be mistaken for rejection.
// A previously sent entry without proof remains uncertain, including old queues.
export const revisaoDeRecusa=i=>['bloqueado_conflito','bloqueado_validacao'].includes(i.estado)&&i.erro?.rejeicaoConfirmada!==false&&i.erro?.categoria!=='sessao'&&!(i.enviadoEm&&i.erro&&!Object.hasOwn(i.erro,'rejeicaoConfirmada'));
// An explicit confirmation click may reopen only the same exhausted client
// request after a transport failure. Existing leases, cooldowns, receipts,
// definitive failures and all other intents retain their original behavior.
export function podeRearmarCadastro(i, auditoriaId, agora){
 const e=i?.erro;
 return typeof auditoriaId==='string'&&!!auditoriaId&&i?.original?.modulo==='processos'&&
  i.estado==='resultado_desconhecido'&&!i.recibo&&!(i.leaseAte>agora)&&
  i.proximaTentativa===Number.MAX_SAFE_INTEGER&&e?.categoria==='transitoria'&&
  e.codigo==='TRANSPORTE'&&e.rejeicaoConfirmada===false&&
  (e.status===null||[408,500,502,503,504].includes(e.status))&&
  i.original.intencao?.edicoes?.some(a=>a.colecao==='auditoria'&&a.id===auditoriaId&&
   a.antes?.existe===false&&a.depois?.existe===true&&a.depois.valor?.id===auditoriaId&&
   a.depois.valor?.acao==='Cadastro alterado')===true;
}
// Distinguish a failed preparation from a save with no confirmed outcome.
export function falhaPreparacaoSemEnvio(i){
 const e=i?.erro,o=i?.original;
 return !!(i?.estado==='resultado_desconhecido'&&(!i.fase||i.fase==='preparacao')&&
  e?.fase==='preparacao'&&e.codigo==='TRANSPORTE'&&e.categoria==='transitoria'&&
  e.rejeicaoConfirmada===false&&(e.status===null||[408,500,502,503,504].includes(e.status))&&
  o?.preparar===true&&!o.legado&&Array.isArray(o.operacoes)&&o.operacoes.length===0&&
  i.tentativas===0&&i.tentativasTotais===0&&i.payload==null&&i.preparado==null&&
  i.enviadoEm==null&&i.recibo==null&&i.confirmadoEm==null&&i.lidoEm==null);
}
export const podeVerificarPreparacaoAoReconectar=(i,agora)=>
 falhaPreparacaoSemEnvio(i)&&!i.verificadaAoReconectar&&
 i.original?.intencao?.edicoes?.some(e=>podeRearmarCadastro(i,e.id,agora))===true;
export function orientacaoPendencia(i){
 if(falhaPreparacaoSemEnvio(i))return 'O sistema falhou antes de enviar esta alteração. O rascunho continua preservado neste aparelho.';
 if(i.estado==='legado_revisao')return 'O rascunho antigo precisa de análise. Baixe o original preservado; ele não será reenviado automaticamente.';
 const categoria=i.erro?.categoria||classificarFalha({status:i.erro?.status,code:i.erro?.codigo}).categoria;
 if(categoria==='sessao')return 'Entre novamente na mesma conta e retome este pedido. As alterações continuam preservadas.';
 if(categoria==='permissao')return 'Esta conta não tem permissão. Solicite revisão a um perfil autorizado; a regra de acesso continua válida.';
 if(i.estado.startsWith('bloqueado')&&!revisaoDeRecusa(i))return 'A recusa da gravação não foi comprovada. Retome o pedido original para consultar seu recibo.';
 if(categoria==='armazenamento'||i.estado==='persistencia_falhou')return 'O navegador não guardou a alteração. Baixe uma cópia antes de sair e verifique o armazenamento.';
 if(i.recibo)return 'A gravação tem recibo. A retomada fará somente a leitura de confirmação. Se os valores atuais divergirem, confira a prévia antes de reconhecê-los; o original será preservado.';
 if(i.estado==='resultado_desconhecido')return 'O resultado ainda é desconhecido. A retomada consultará o recibo antes de repetir o mesmo pedido.';
 if(categoria==='conflito')return 'Compare a base original, sua alteração e o valor compartilhado antes de escolher.';
 if(categoria==='validacao')return [orientacaoRestricao(i.erro?.restricao),'Revise os campos e vínculos do cadastro. Confirme a correção somente nesta alteração.'].filter(Boolean).join(' ');
 return 'As alterações continuam preservadas; falhas temporárias têm tentativas limitadas.';
}

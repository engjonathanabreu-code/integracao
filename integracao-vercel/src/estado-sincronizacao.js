export const terminal=i=>['confirmado','substituido','dispensado'].includes(i.estado);
export function classificarFalha(e){
 const vistos=new Set(),nomes=new Set();let status,codigo;
 while(e&&!vistos.has(e)){vistos.add(e);status??=e.status;codigo??=e.code;nomes.add(e.name);e=e.cause;}
 status=Number(status);codigo=String(codigo||'TRANSPORTE').slice(0,60);
 const categoria=status===401||['SESSAO_EXPIRADA','SESSAO_AUSENTE','PGRST301','PGRST302','PGRST303'].includes(codigo)?'sessao'
  :status===403||codigo==='42501'?'permissao'
  :codigo.startsWith('PERSISTENCIA')||['QuotaExceededError','InvalidStateError'].some(n=>nomes.has(n))?'armazenamento'
  :codigo==='LEITURA_DIVERGENTE'?'leitura'
  :status===409||codigo==='PT409'?'conflito'
  :[400,404,422].includes(status)||/^(22|23)/.test(codigo)?'validacao':'transitoria';
 return {status:Number.isFinite(status)?status:null,codigo,categoria};
}
// Before phase tracking, a receipt failure could be mistaken for rejection.
// A previously sent entry without proof remains uncertain, including old queues.
export const revisaoDeRecusa=i=>['bloqueado_conflito','bloqueado_validacao'].includes(i.estado)&&i.erro?.rejeicaoConfirmada!==false&&i.erro?.categoria!=='sessao'&&!(i.enviadoEm&&i.erro&&!Object.hasOwn(i.erro,'rejeicaoConfirmada'));
export function orientacaoPendencia(i){
 if(i.estado==='legado_revisao')return 'O rascunho antigo precisa de análise. Baixe o original preservado; ele não será reenviado automaticamente.';
 const categoria=i.erro?.categoria||classificarFalha({status:i.erro?.status,code:i.erro?.codigo}).categoria;
 if(categoria==='sessao')return 'Entre novamente na mesma conta e retome este pedido. As alterações continuam preservadas.';
 if(categoria==='permissao')return 'Esta conta não tem permissão. Solicite revisão a um perfil autorizado; a regra de acesso continua válida.';
 if(i.estado.startsWith('bloqueado')&&!revisaoDeRecusa(i))return 'A recusa da gravação não foi comprovada. Retome o pedido original para consultar seu recibo.';
 if(categoria==='armazenamento'||i.estado==='persistencia_falhou')return 'O navegador não guardou a alteração. Baixe uma cópia antes de sair e verifique o armazenamento.';
 if(i.recibo)return 'A gravação tem recibo. A retomada fará somente a leitura de confirmação. Se os valores atuais divergirem, confira a prévia antes de reconhecê-los; o original será preservado.';
 if(i.estado==='resultado_desconhecido')return 'O resultado ainda é desconhecido. A retomada consultará o recibo antes de repetir o mesmo pedido.';
 if(categoria==='conflito')return 'Compare a base original, sua alteração e o valor compartilhado antes de escolher.';
 if(categoria==='validacao')return 'Revise os campos e vínculos do cadastro. Confirme a correção somente nesta alteração.';
 return 'As alterações continuam preservadas; falhas temporárias têm tentativas limitadas.';
}

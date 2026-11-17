// Keep one captured creation. Retrying confirmation never creates another goal.
export function criarConfirmacaoMeta(criar) {
 let iniciada=false,emCurso=null,retentar=null,confirmada=false,ultimoErro=null;
 return {
  naoEnviada:()=>!iniciada,
  podeRetentar:()=>!confirmada&&(!iniciada||!!retentar),
  executar(){
   if(emCurso)return emCurso;
   if(confirmada)return Promise.resolve();
   if(iniciada&&!retentar)return Promise.reject(ultimoErro);
   const acao=iniciada?retentar:criar;iniciada=true;
   emCurso=Promise.resolve().then(acao).then(()=>{confirmada=true;},e=>{
    ultimoErro=e;retentar=typeof e?.retentarConfirmacao==='function'?e.retentarConfirmacao:null;
    // These three guards in mutateConfirmed run before mutate/enqueue.
    // Never reset an uncertain request or a failure carrying its retry callback.
    if(!retentar&&['SEM_CONEXAO','SESSAO_ENCERRADA','CONFLITO_EDICAO'].includes(e?.code))iniciada=false;
    throw e;
   }).finally(()=>{emCurso=null;});
   return emCurso;
  }
 };
}

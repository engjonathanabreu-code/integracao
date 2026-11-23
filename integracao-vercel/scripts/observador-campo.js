// Test-only observation. No application callback, queue entry or receipt is changed.
// Kept self-contained so the same function can be injected into both checkouts.
export function observarConfirmacaoCampo({conta,valor,timeoutMs=15000,pollMs=10}){
 const putOriginal=IDBObjectStore.prototype.put;
 let inicio,antes,confirmacao,duravel,interfaceEm,timer,intervalo,encerrado=false,resolve,reject;
 let polling=pollMs===null?null:undefined,ultimoCommit;const pendentesVistos=new Set();
 const conclusao=new Promise((ok,erro)=>{resolve=ok;reject=erro;});
 const limpar=()=>{
  clearTimeout(timer);clearInterval(intervalo);window.removeEventListener('medicao:campo-commit',conferirCommit);
  if(IDBObjectStore.prototype.put===putObservado)IDBObjectStore.prototype.put=putOriginal;
 };
 const falhar=codigo=>{if(encerrado)return;encerrado=true;limpar();reject(Object.assign(Error(codigo),{code:codigo}));};
 const estadoAtual=()=>window.syncHarness?.stats.writes>antes&&window.syncHarness.sync.pendencias.length===0;
 const concluir=()=>{
  if(encerrado||duravel===undefined||interfaceEm===undefined||polling===undefined)return;
  encerrado=true;limpar();resolve({durableMs:duravel-inicio,uiMs:interfaceEm-inicio,legacyPollingMs:polling===null?null:polling-inicio,
   uiAfterDurableMs:interfaceEm-duravel,pollAfterUiMs:polling===null?null:polling-interfaceEm,confirmacao});
 };
 const conferirCommit=e=>{
  const d=e.detail;if(!Array.isArray(d?.pendencias))return;
  d.pendencias.forEach(id=>pendentesVistos.add(id));
  ultimoCommit={pendencias:[...d.pendencias],gravacoes:d.gravacoes,quando:performance.now()};avaliarCommit();
 };
 const avaliarCommit=()=>{
  const d=ultimoCommit;
  // Require an actual React layout commit that removes this same pending ID.
  // Equal status text from an earlier commit is not proof of the target update.
  if(!d||duravel===undefined||d.quando<duravel||interfaceEm!==undefined||!pendentesVistos.has(confirmacao.id)||
   d.pendencias.length!==0||d.gravacoes!==antes+1||!estadoAtual())return;
  interfaceEm=d.quando;concluir();
 };
 window.addEventListener('medicao:campo-commit',conferirCommit);
 function putObservado(item,...args){
  const alvo=this.name==='intencoes'&&item?.conta===conta&&item.estado==='confirmado'&&
   Object.values(item.original?.intencao?.arquivos||{}).some(a=>a.value===valor);
  if(alvo){
   const candidato={id:item.id,pedido:item.pedido,checksum:item.checksum,criadoEm:item.criadoEm,lidoEm:item.lidoEm};
   const prova=!!item.pedido&&item.recibo?.pedido===item.pedido&&Array.isArray(item.payload)&&item.payload.length>0;
   this.transaction.addEventListener('complete',e=>{
    if(encerrado)return;
    if(!prova||confirmacao)return falhar('CONFIRMACAO_INCORRETA');
    // Use dispatch time: an earlier oncomplete listener may resolve application
    // promises before this listener runs, without changing when commit occurred.
    confirmacao=candidato;duravel=e.timeStamp;avaliarCommit();concluir();
   },{once:true});
  }
  return putOriginal.call(this,item,...args);
 }
 IDBObjectStore.prototype.put=putObservado;
 return {conclusao,iniciar(){
  antes=window.syncHarness.stats.writes;inicio=performance.now();timer=setTimeout(()=>falhar('CONFIRMACAO_TIMEOUT'),timeoutMs);return inicio;
 },iniciarPolling(){
  if(pollMs===null)return;
  // Retain the old endpoint only as a paired measurement of observer delay.
  intervalo=setInterval(()=>{if(polling===undefined&&estadoAtual()){polling=performance.now();clearInterval(intervalo);concluir();}},pollMs);
 },cancelar:()=>falhar('MEDICAO_CANCELADA')};
}

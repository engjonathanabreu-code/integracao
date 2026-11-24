// navigator.onLine is a hint, not proof that the server cannot be reached.
// The shared save queue and visible badge consume the same verified state.
// A real transport failure (no HTTP response) is a second signal: the server is
// treated as unreachable for a short, bounded window, cleared by the first
// success. The window expires on its own and republishes, so retries scheduled
// by the queue backoff are delayed at most `janelaFalhaMs`, never parked.
export function criarMonitorConexao({navegador,alvo,buscar,agendar=setInterval,cancelar=clearInterval,agora=()=>Date.now(),temporizar=setTimeout,destemporizar=clearTimeout,janelaFalhaMs=10000}) {
 let online=navegador?.onLine!==false,job=null,intervalo=null,inacessivelAte=0,timerFalha=null;
 const ouvintes=new Set();
 const efetivo=()=>online&&!(inacessivelAte>agora());
 let publicado=efetivo();
 const emitir=()=>{const valor=efetivo();if(publicado===valor)return;publicado=valor;for(const fn of ouvintes)fn(valor);};
 const publicar=valor=>{online=valor;emitir();};
 const limparFalha=()=>{inacessivelAte=0;if(timerFalha!==null){destemporizar(timerFalha);timerFalha=null;}};
 const verificar=()=>{
  if(job)return job;
  job=(async()=>{
   try {
    // /api/ bypasses the service worker. HTTP errors still prove network access;
    // database/auth failures must be handled by the operation, not called offline.
    await buscar('/api/conexao',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(6000)});
    // The probe proves network access only; a failure against the data server
    // is cleared by its own success or by the bounded window, not by this probe.
    publicar(true);
   } catch {publicar(navegador?.onLine!==false);}
   finally {job=null;}
   return efetivo();
  })();
  return job;
 };
 // A request that failed without any HTTP response. Bounded and self-expiring.
 const registrarFalhaTransporte=()=>{
  inacessivelAte=agora()+janelaFalhaMs;
  if(timerFalha!==null)destemporizar(timerFalha);
  timerFalha=temporizar(()=>{timerFalha=null;inacessivelAte=0;emitir();},janelaFalhaMs);
  emitir();
  if(navegador?.onLine!==false)void verificar();
 };
 // Any HTTP response (even an error status) proves the server is reachable.
 const registrarSucessoTransporte=()=>{if(!inacessivelAte&&timerFalha===null)return;limparFalha();emitir();};
 const transporte=e=>{if(e?.detail?.ok===false)registrarFalhaTransporte();else if(e?.detail?.ok===true)registrarSucessoTransporte();};
 const mudou=()=>{if(navegador?.onLine!==false)publicar(true);else void verificar();};
 const foco=()=>{if(navegador?.onLine===false||inacessivelAte>agora())void verificar();};
 return {
  disponivel:()=>efetivo(),
  verificar,
  registrarFalhaTransporte,
  registrarSucessoTransporte,
  observar(fn){
   ouvintes.add(fn);fn(efetivo());
   if(ouvintes.size===1){
    alvo?.addEventListener('online',mudou);alvo?.addEventListener('offline',mudou);alvo?.addEventListener('focus',foco);alvo?.addEventListener('integracao:transporte',transporte);
    intervalo=agendar(foco,30000);foco();
   }
   return ()=>{ouvintes.delete(fn);if(!ouvintes.size){cancelar(intervalo);intervalo=null;alvo?.removeEventListener('online',mudou);alvo?.removeEventListener('offline',mudou);alvo?.removeEventListener('focus',foco);alvo?.removeEventListener('integracao:transporte',transporte);}};
  }
 };
}
const monitor=criarMonitorConexao({navegador:globalThis.navigator,alvo:globalThis.window,buscar:(...args)=>fetch(...args)});
export const temConexao=()=>monitor.disponivel();
// Transport layer hooks (A2: call from buscarREST, or dispatch the window event
// `integracao:transporte` with `detail:{ok:boolean}`).
export const registrarFalhaTransporte=()=>monitor.registrarFalhaTransporte();
export const registrarSucessoTransporte=()=>monitor.registrarSucessoTransporte();
export const observarConexao=fn=>monitor.observar(online=>{
 fn(online);
 globalThis.window?.dispatchEvent(new CustomEvent('integracao:conexao'));
});

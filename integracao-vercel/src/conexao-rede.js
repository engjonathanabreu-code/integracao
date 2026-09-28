// navigator.onLine is a hint, not proof that the server cannot be reached.
export function criarMonitorConexao({navegador,alvo,buscar,agendar=setInterval,cancelar=clearInterval}) {
 let online=navegador?.onLine!==false,job=null,intervalo=null;
 const ouvintes=new Set();
 const publicar=valor=>{if(online===valor)return;online=valor;for(const fn of ouvintes)fn(online);};
 const verificar=()=>{
  if(job)return job;
  job=(async()=>{
   try {
    // /api/ bypasses the service worker. HTTP errors still prove network access;
    // database/auth failures must be handled by the operation, not called offline.
    await buscar('/api/conexao',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(6000)});
    publicar(true);
   } catch {publicar(navegador?.onLine!==false);}
   finally {job=null;}
   return online;
  })();
  return job;
 };
 const mudou=()=>{if(navegador?.onLine!==false)publicar(true);else void verificar();};
 const foco=()=>{if(navegador?.onLine===false)void verificar();};
 return {
  disponivel:()=>online,
  verificar,
  observar(fn){
   ouvintes.add(fn);fn(online);
   if(ouvintes.size===1){
    alvo?.addEventListener('online',mudou);alvo?.addEventListener('offline',mudou);alvo?.addEventListener('focus',foco);
    intervalo=agendar(foco,30000);foco();
   }
   return ()=>{ouvintes.delete(fn);if(!ouvintes.size){cancelar(intervalo);intervalo=null;alvo?.removeEventListener('online',mudou);alvo?.removeEventListener('offline',mudou);alvo?.removeEventListener('focus',foco);}};
  }
 };
}
const monitor=criarMonitorConexao({navegador:globalThis.navigator,alvo:globalThis.window,buscar:(...args)=>fetch(...args)});
export const temConexao=()=>monitor.disponivel();
export const observarConexao=fn=>monitor.observar(online=>{
 fn(online);
 globalThis.window?.dispatchEvent(new CustomEvent('integracao:conexao'));
});

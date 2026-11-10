// Shared under the per-account Web Lock; timestamps never establish write order.
export async function sincronizarPonto({ler,salvar,chamar,conferir,agora=Date.now,visivel=true,manual=false,inicial=false,aleatorio=Math.random}) {
  conferir();
  const r=await ler();conferir();
  const fila=JSON.stringify(r.fila.map(b=>b.pedido));
  const controle=r.sincronizacao||{};
  if(!manual&&controle.fila===fila&&controle.proxima>agora())return false;
  if(!manual&&!inicial&&!r.fila.length&&(!visivel||agora()-(controle.leituraEm||0)<30000))return false;
  const {enviarFilaPonto}=await import('./ponto-local.js');
  try {
    await enviarFilaPonto(r,async b=>{conferir();const resposta=await chamar('bater_offline',b);conferir();return resposta;},async d=>{
      conferir();await salvar(atual=>({...atual,estado:d.estado,fila:atual.fila.filter(b=>!r.fila.some(x=>x.pedido===b.pedido)||d.fila.some(x=>x.pedido===b.pedido))}));
    });
    conferir();const estado=await chamar('estado',{});conferir();
    await salvar(atual=>({...atual,estado,sincronizacao:{leituraEm:agora(),falhas:0}}));
    return true;
  } catch(e) {
    conferir();
    const falhas=(controle.falhas||0)+1;
    const deterministica=[400,403,409,422].includes(e.status);
    await salvar(atual=>({...atual,sincronizacao:{...controle,falhas,fila:JSON.stringify(atual.fila.map(b=>b.pedido)),proxima:deterministica?Number.MAX_SAFE_INTEGER:agora()+Math.max(Number(e.retryAfterMs)||0,Math.min(300000,5000*2**Math.min(falhas-1,6))*(0.8+aleatorio()*0.4))}}));
    throw e;
  }
}

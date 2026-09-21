// Supabase Realtime protocol v1; receives only revision markers, never customer rows.
export function conectarTempoReal({url,chave,token,alterou,estado,WebSocketImpl=globalThis.WebSocket,setTimer=setTimeout,clearTimer=clearTimeout}){
 let socket=null,fechado=false,reconexao=null,pulso=null,limite=null,ref=0,join=null,heartbeat=null,falhas=0,ultimoToken=null,tentativa=0;
 const topic='realtime:integracao-revisoes';
 const enviar=(event,payload={},canal=topic)=>{const n=String(++ref);socket.send(JSON.stringify({topic:canal,event,payload,ref:n,join_ref:canal===topic?join:null}));return n;};
 const limpar=()=>{clearTimer(pulso);clearTimer(limite);pulso=limite=null;heartbeat=null;};
 const repetir=()=>{if(fechado||reconexao)return;estado('reconectando');reconexao=setTimer(()=>{reconexao=null;abrir();},Math.min(30000,1000*2**Math.min(falhas++,5)));};
 const cair=()=>{tentativa++;const s=socket;socket=null;limpar();if(s){s.onclose=s.onerror=s.onmessage=s.onopen=null;s.close();}repetir();};
 const bater=async()=>{if(fechado||!socket)return;if(heartbeat){cair();return;}const s=socket;try{const atual=await token();if(fechado||socket!==s)return;if(!atual){cair();return;}if(atual!==ultimoToken){ultimoToken=atual;enviar('access_token',{access_token:atual});}heartbeat=enviar('heartbeat',{},'phoenix');pulso=setTimer(bater,20000);}catch{cair();}};
 const abrir=async()=>{if(fechado)return;const versao=++tentativa;estado('conectando');try{const jwt=await token();if(fechado||versao!==tentativa)return;if(!jwt){repetir();return;}ultimoToken=jwt;
 const endpoint=new URL(url);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';endpoint.pathname='/realtime/v1/websocket';endpoint.search=new URLSearchParams({apikey:chave,vsn:'1.0.0'}).toString();
 const s=new WebSocketImpl(endpoint.href);socket=s;limite=setTimer(cair,15000);
 s.onopen=()=>{if(socket!==s)return;join=String(ref+1);enviar('phx_join',{access_token:jwt,config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:'UPDATE',schema:'public',table:'integracao_revisoes'}],private:false}});};
 s.onmessage=e=>{if(socket!==s)return;let m;try{m=JSON.parse(e.data);}catch{return;}
 if(m.event==='phx_reply'&&m.ref===heartbeat){heartbeat=null;return;}
 if(m.topic!==topic)return;
 if(m.event==='phx_reply'&&m.ref===join){if(m.payload?.status!=='ok'){cair();return;}clearTimer(limite);limite=setTimer(cair,15000);}
 if(m.event==='system'){if(m.payload?.status!=='ok'){cair();return;}clearTimer(limite);falhas=0;estado('conectado');alterou(null);clearTimer(pulso);pulso=setTimer(bater,20000);}
 if(m.event==='postgres_changes'){const registro=m.payload?.data?.record;if(registro?.modulo)alterou(registro.modulo);}
 if(['phx_error','phx_close'].includes(m.event))cair();
 };s.onerror=s.onclose=()=>{if(socket===s)cair();};
 }catch{repetir();}};
 abrir();return {fechar(){fechado=true;clearTimer(reconexao);reconexao=null;const s=socket;socket=null;limpar();if(s){s.onclose=s.onerror=s.onmessage=s.onopen=null;s.close();}estado('desconectado');},reconectar(){if(!fechado)cair();}};
}

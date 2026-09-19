import crypto from 'node:crypto';
export function segredoCorreto(esperado,recebido) {
 const a=Buffer.from(esperado||''),b=Buffer.from(recebido||'');return a.length>0&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export function autorizado(req,secret) {const h=String(req.headers.authorization||'');return h.startsWith('Bearer ')&&segredoCorreto(secret,h.slice(7));}
export async function bancoCRM(path,body) {
 const url=process.env.CRM_INTEGRACAO_SUPABASE_URL,key=process.env.CRM_INTEGRACAO_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Integração CRM ainda não configurada');
 const r=await fetch(`${url}/rest/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`Consulta CRM indisponível (${r.status})`);return r.json();
}
export const idExterno=v=>/^\d{1,18}$/.test(String(v??''))?String(v):null;

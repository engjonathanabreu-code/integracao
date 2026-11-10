// Operator-only: no dotenv loading and no production defaults. Never sends email.
import {readFile} from 'node:fs/promises';
import {previaPublica,confirmarRecuperacao} from '../server/recuperacao-outbox.js';
const [acao,arquivo]=process.argv.slice(2);
if(!['previa','confirmar-recibo','previa-legado','autorizar-legado'].includes(acao)||!arquivo)throw Error('Uso: node scripts/recuperar-outbox.mjs previa|confirmar-recibo arquivo-de-selecao.json');
const selecao=JSON.parse(await readFile(arquivo,'utf8'));
const url=process.env.RECUPERACAO_SUPABASE_URL,key=process.env.RECUPERACAO_SERVICE_ROLE;
if(!url||!key||!/^https:\/\/[^/]+\.supabase\.co$/.test(url))throw Error('Informe explicitamente ambiente e credencial de operação.');
const rpc=async(nome,body)=>{const r=await fetch(`${url}/rest/v1/rpc/${nome}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Operação recusada (${r.status}).`);return r.json();};
if(acao==='autorizar-legado'){
 if(selecao.confirmado!==true||!Number.isSafeInteger(selecao.id)||!selecao.versao||!selecao.referenciaAprovacao)throw Error('Selecione um item, sua versão e a referência da aprovação explícita.');
 console.log(JSON.stringify(await rpc('integracao_envios_autorizar_legado',{p_id:selecao.id,p_versao:selecao.versao,p_referencia_aprovacao:selecao.referenciaAprovacao})));
}else if(acao==='previa-legado'){
 if(!Array.isArray(selecao.ids)||!selecao.ids.length||selecao.ids.length>20||!selecao.ids.every(Number.isSafeInteger))throw Error('Selecione de 1 a 20 IDs numéricos.');
 const items=await rpc('integracao_envios_previa_legado',{p_ids:selecao.ids});
 console.log(JSON.stringify(items.map(i=>({id:i.id,versao:i.versao,tipo:i.tipo,criadoEm:i.criado_em,destinatario:String(i.email||'').replace(/^[^@]+/,'***')})),null,2));
}else if(acao==='previa'){
 if(!Array.isArray(selecao.ids)||!selecao.ids.length||selecao.ids.length>20)throw Error('Selecione de 1 a 20 IDs explícitos.');
 console.log(JSON.stringify(previaPublica(await rpc('integracao_envios_previa',{p_ids:selecao.ids})),null,2));
}else{
 if(!selecao.id||!selecao.versao||!selecao.reciboId||!process.env.RECUPERACAO_RESEND_KEY)throw Error('Selecione item, versão da prévia e recibo externo.');
 const consultarProvedor=async id=>{const r=await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${process.env.RECUPERACAO_RESEND_KEY}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Consulta de recibo recusada (${r.status}).`);return r.json();};
 console.log(JSON.stringify(await confirmarRecuperacao({...selecao,rpc,consultarProvedor})));
}

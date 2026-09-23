import {bancoCRM} from './_crm.js';
import {acessoCRM} from '../src/crm-regras.js';
export const config={maxDuration:120};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');if(req.method!=='POST')return res.status(405).json({message:'Use POST.'});
 const authorization=req.headers.authorization;
 if(!/^Bearer \S+$/.test(authorization||''))return res.status(401).json({message:'Entre novamente na sua conta.'});
 try{
 const url=process.env.VITE_ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co',apikey=process.env.VITE_ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4',headers={apikey,Authorization:authorization};
 const auth=await fetch(`${url}/auth/v1/user`,{headers,signal:AbortSignal.timeout(10000)});if(!auth.ok)return res.status(401).json({message:'Sua sessão expirou.'});
 const user=await auth.json(),p=await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=ativo,tipo`,{headers,signal:AbortSignal.timeout(10000)});
 if(!p.ok||!(await p.json()).some(x=>acessoCRM(x).admin))return res.status(403).json({message:'Disponível somente à Diretoria.'});
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body,cursor=body?.cursor;
 if(cursor!=null&&(!UUID.test(cursor.id)||cursor.before!=null&&!/^\d{1,18}$/.test(String(cursor.before))))return res.status(400).json({message:'Cursor inválido.'});
 const host='chatwoot-cxbqw-u77386.vm.elestio.app',account='1',token=process.env.CHATWOOT_INTEGRACAO_API_TOKEN;
 if(!token)return res.status(503).json({message:'A consulta ao Chatwoot ainda não está configurada. O dashboard continua mostrando o histórico já registrado.'});
 const filtro=`instalacao=eq.${host}&conta_id=eq.${account}`;
 const buscar=async extra=>(await bancoCRM(`integracao_crm_conversas?${filtro}&select=id,conversa_id,contato_id&order=id.asc&limit=1${extra}`))[0];
 const v=await buscar(cursor?`&id=eq.${cursor.id}`:'');if(!v)return res.status(200).json({mensagens:0,cursor:null});
 const cw=async path=>{const r=await fetch(`https://${host}/api/v1/accounts/${account}${path}`,{headers:{api_access_token:token},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Chatwoot indisponível');return r.json();};
 const conversation=await cw(`/conversations/${v.conversa_id}`);
 if(String(conversation.meta?.sender?.id||conversation.contact_inbox?.contact_id)!==String(v.contato_id))throw Error('Identidade da conversa alterada');
 const response=await cw(`/conversations/${v.conversa_id}/messages${cursor?.before?`?before=${cursor.before}`:''}`),messages=response.payload;
 if(!Array.isArray(messages))throw Error('Resposta inválida do Chatwoot');
 let menor=null;
 for(const message of messages){
  if(!/^\d{1,18}$/.test(String(message.id)))throw Error('Mensagem sem identificador');
  if(cursor?.before&&BigInt(message.id)>=BigInt(cursor.before))throw Error('Paginação não avançou');
  if(menor===null||BigInt(message.id)<BigInt(menor))menor=String(message.id);
  const sender=message.sender||{},tipo=String(message.sender_type||sender.type||'').toLowerCase().replace('agentbot','agent_bot');
  const data=new Date(typeof message.created_at==='number'?message.created_at*1000:message.created_at);if(Number.isNaN(data.getTime()))throw Error('Data inválida');
  await bancoCRM('rpc/integracao_crm_receber',{evento:{instalacao:host,conta_id:account,conversa_id:String(v.conversa_id),contato_id:String(v.contato_id),mensagem_id:String(message.id),
   nome:conversation.meta?.sender?.name||'Contato Chatwoot',telefone:conversation.meta?.sender?.phone_number||'',
   agente_id:conversation.meta?.assignee?.id?String(conversation.meta.assignee.id):null,
   autor:sender.name||'',autor_tipo:['user','contact','agent_bot'].includes(tipo)?tipo:null,autor_chatwoot_id:(message.sender_id||sender.id)?String(message.sender_id||sender.id):null,
   direcao:String(message.message_type??''),privada:message.private===true,conteudo:typeof message.content==='string'?message.content:'',anexos:(message.attachments||[]).map(a=>({id:a.id,nome:a.file_name||a.file_type,url:a.data_url,file_type:a.file_type})),data:data.toISOString()}});
 }
 const proxima=menor?{id:v.id,before:menor}:await buscar(`&id=gt.${v.id}`);
 return res.status(200).json({mensagens:messages.length,cursor:proxima?{id:proxima.id,before:proxima.before||null}:null});
 }catch(e){return res.status(e instanceof SyntaxError?400:503).json({message:'Não foi possível conferir esta página do Chatwoot. Os dados registrados foram preservados; tente novamente.'});}
}

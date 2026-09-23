import crypto from 'node:crypto';
import {segredoCorreto,bancoCRM,idExterno} from './_crm.js';
export const config={api:{bodyParser:false}};
export function validarAssinatura(raw,headers,secret,agora=Date.now()) {
 const timestamp=String(headers['x-chatwoot-timestamp']||'');
 if(!/^\d{10}$/.test(timestamp)||Math.abs(agora-Number(timestamp)*1000)>300000||!secret)return false;
 const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');
 return segredoCorreto(expected,String(headers['x-chatwoot-signature']||'').replace(/^sha256=/,''));
}
export function eventoChatwoot(p,instalacao,contaConfigurada) {
 const conversation=p.conversation||p,conta=idExterno(p.account?.id||conversation.account_id),conversa=idExterno(conversation.id),contact=conversation.meta?.sender||p.sender;
 if(!conta||conta!==String(contaConfigurada)||!conversa)return null;
 const contato=idExterno(contact?.type==='user'?conversation.contact_inbox?.contact_id:contact?.id)||idExterno(conversation.contact_inbox?.contact_id);
 if(!contato)return null;
 const mensagem=p.event==='message_created'?idExterno(p.id):null;
 if(p.event==='message_created'&&!mensagem)return null;
 const data=typeof p.created_at==='number'?new Date(p.created_at*1000):new Date(p.created_at||Date.now());
 if(Number.isNaN(data.getTime()))return null;
 return {instalacao,conta_id:conta,conversa_id:conversa,contato_id:contato,mensagem_id:mensagem,
 agente_id:idExterno(conversation.meta?.assignee?.id||conversation.assignee_id),nome:contact?.name||'Contato Chatwoot',telefone:contact?.phone_number||'',
 conteudo:typeof p.content==='string'?p.content:'',privada:p.private===true,autor:p.sender?.name||'',autor_chatwoot_id:idExterno(p.sender?.id),autor_tipo:['user','contact','agent_bot'].includes(p.sender?.type)?p.sender.type:null,direcao:String(p.message_type??''),
 anexos:(p.attachments||[]).map(a=>({id:a.id,nome:a.file_name||a.file_type,url:a.data_url,file_type:a.file_type})),data:data.toISOString()};
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
 try{
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)return res.status(413).json({error:'Evento muito grande'});chunks.push(chunk);}const raw=Buffer.concat(chunks);
 if(!validarAssinatura(raw,req.headers,process.env.CHATWOOT_INTEGRACAO_WEBHOOK_SECRET))return res.status(401).json({error:'Assinatura inválida'});
 const body=JSON.parse(raw.toString('utf8'));
 if(!['message_created','conversation_created','conversation_updated','conversation_status_changed'].includes(body.event))return res.status(200).json({ignored:true});
 if(!process.env.CHATWOOT_INTEGRACAO_INSTALACAO||!process.env.CHATWOOT_INTEGRACAO_CONTA)return res.status(503).json({error:'Receptor não configurado'});
 const evento=eventoChatwoot(body,process.env.CHATWOOT_INTEGRACAO_INSTALACAO,process.env.CHATWOOT_INTEGRACAO_CONTA);
 if(!evento)return res.status(422).json({error:'Identificadores do evento inválidos'});
 const id=await bancoCRM('rpc/integracao_crm_receber',{evento});return res.status(200).json({ok:true,id});
 }catch(e){console.error('chatwoot-integracao',{tipo:e.name});return res.status(e instanceof SyntaxError?400:503).json({error:'Não foi possível registrar o evento; tente novamente'});}
}

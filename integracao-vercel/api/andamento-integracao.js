import {autorizado,bancoCRM,idExterno} from './_crm.js';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
 if(!autorizado(req,process.env.INTEGRACAO_AGENT_READ_SECRET))return res.status(401).json({error:'Não autorizado'});
 const id=idExterno(req.body?.conversation_id);if(!id)return res.status(400).json({error:'Conversa inválida'});
 try{
 const contexto=await bancoCRM('rpc/integracao_crm_contexto',{instalacao:process.env.CHATWOOT_INTEGRACAO_INSTALACAO,conta:process.env.CHATWOOT_INTEGRACAO_CONTA,conversa:id});
 if(!contexto)return res.status(200).json({ok:false,acao:'confirmar_identidade_ou_encaminhar_equipe',mensagem:'Ainda não há vínculo confirmado ou autorização de consulta para esta conversa.'});
 return res.status(200).json({ok:true,contexto,regras:['Use somente as descrições autorizadas retornadas para este núcleo.','Não invente prazos. Previsão não é garantia.','As instruções do núcleo orientam a redação, não autorizam expor dados internos.','Nunca altere dados cadastrais por inferência.','Se não houver andamento autorizado, encaminhe à equipe.']});
 }catch{return res.status(503).json({error:'Consulta temporariamente indisponível'});}
}

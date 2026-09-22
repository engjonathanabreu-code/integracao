import {autorizado,bancoCRM} from './_crm.js';
import {validarLinhaBoleto,dinheiro,dataFinanceira,valorReal} from '../src/financeiro-regras.js';
export const config={maxDuration:300};
export const NUMERO_FINANCEIRO='554733100137';
export function montarLembrete(cliente,parcela){const vars={'1':cliente.nome,'2':dataFinanceira(parcela.vencimento),'3':dinheiro(valorReal(parcela)),'4':parcela.linha_digitavel};return {content:`Olá, ${vars['1']}. A Integral lembra que sua parcela vence em ${vars['2']}, no valor de ${vars['3']}.\nCódigo para pagamento: ${vars['4']}\nSe já realizou o pagamento, desconsidere esta mensagem. Para dúvidas, responda por aqui.`,message_type:'outgoing',private:false,template_params:{name:'integral_lembrete_vencimento',category:'UTILITY',language:'pt_BR',processed_params:{body:vars}}};}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');if(req.method!=='GET')return res.status(405).json({message:'Use GET.'});
 if(!autorizado(req,process.env.CRON_SECRET))return res.status(401).json({message:'Não autorizado.'});
 const env=process.env,inbox=env.FINANCEIRO_CHATWOOT_INBOX_ID,token=env.CHATWOOT_INTEGRACAO_API_TOKEN;
 if(env.FINANCEIRO_LEMBRETES_ATIVOS!=='true'||env.FINANCEIRO_TEMPLATE_APROVADO!=='true'||!/^\d+$/.test(inbox||'')||!token)return res.status(200).json({status:'aguardando_configuracao_e_template',numero:NUMERO_FINANCEIRO});
 const host='chatwoot-cxbqw-u77386.vm.elestio.app',account=1,root=`https://${host}/api/v1/accounts/${account}`;
 const cw=async(path,body)=>{const r=await fetch(root+path,{method:body?'POST':'GET',headers:{api_access_token:token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Chatwoot indisponível');return r.json();};
 try{const caixa=await cw(`/inboxes/${inbox}`);if(String(caixa.phone_number||'').replace(/\D/g,'')!==NUMERO_FINANCEIRO||caixa.channel_type!=='Channel::Whatsapp')throw Error('Caixa de WhatsApp diferente do número autorizado');
 await bancoCRM('rpc/integracao_financeiro_lembretes_preparar',{});let enviados=0,pendencias=0;const inicio=Date.now();
 while(Date.now()-inicio<235000){const [job]=await bancoCRM('rpc/integracao_financeiro_lembrete_reservar',{});if(!job)break;let postIniciado=false;const finalizar=(status,mensagem,observacao)=>bancoCRM('rpc/integracao_financeiro_lembrete_finalizar',{p_id:job.id,p_tentativa:job.tentativa,p_status:status,p_mensagem:mensagem||null,p_observacao:observacao||null});
 try{const [p]=await bancoCRM(`fin_receb_parcelas?id=eq.${job.parcela_id}&select=*`);if(!p?.ativo||!['Pendente','Inadimplente'].includes(p.status)||p.vencimento!==job.vencimento){await finalizar('cancelado',null,'Parcela alterada ou paga.');continue;}if(!validarLinhaBoleto(p.linha_digitavel))throw Error('Linha digitável ausente ou inválida.');
 const [cliente]=await bancoCRM(`fin_receb_clientes?id=eq.${p.cliente_id}&select=id,nome,ativo`);if(!cliente?.ativo)throw Error('Cliente inativo.');
 const cards=await bancoCRM(`integracao_crm_cards?cliente_id=eq.${p.cliente_id}&select=id`);if(!cards.length)throw Error('Cliente sem vínculo confirmado no CRM.');
 const vinculos=await bancoCRM(`integracao_crm_conversas?card_id=in.(${cards.map(c=>c.id).join(',')})&identidade_confirmada=eq.true&select=instalacao,conta_id,conversa_id,contato_id`);
 const validos=[];for(const v of vinculos){if(v.instalacao!==host||Number(v.conta_id)!==account)continue;const conversa=await cw(`/conversations/${v.conversa_id}`);if(String(conversa.inbox_id)===inbox&&String(conversa.meta?.sender?.id)===String(v.contato_id))validos.push(v);}
 const contatos=new Set(validos.map(v=>String(v.contato_id)));if(contatos.size!==1)throw Error('Sem conversa única com identidade confirmada na caixa informada.');const v=validos.sort((a,b)=>Number(b.conversa_id)-Number(a.conversa_id))[0];
 const [atual]=await bancoCRM(`fin_receb_parcelas?id=eq.${p.id}&select=versao,status`);if(atual?.versao!==p.versao)throw Error('Parcela mudou durante a preparação. Confira antes de reenviar.');
 postIniciado=true;const msg=await cw(`/conversations/${v.conversa_id}/messages`,montarLembrete(cliente,p));if(!msg.id)throw Error('Resposta de envio sem confirmação.');await finalizar('enviado',String(msg.id));enviados++;
 }catch(e){await finalizar(postIniciado?'incerto':'erro',null,postIniciado?'Conferir no Chatwoot antes de reenviar: resultado do envio incerto.':e.message);pendencias++;}
 }
 return res.status(200).json({enviados,pendencias});
 }catch{return res.status(503).json({message:'Lembretes não executados. Verifique a caixa de WhatsApp e a configuração.'});}
}

import {autorizado,bancoCRM,idExterno} from './_crm.js';
import {candidatosIdentidade} from '../src/crm-regras.js';
// Ferramenta de identificação para o agente. Nome aproximado é sugestão, nunca autorização.
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
 if(!autorizado(req,process.env.INTEGRACAO_AGENT_READ_SECRET))return res.status(401).json({error:'Não autorizado'});
 const id=idExterno(req.body?.conversation_id);if(!id)return res.status(400).json({error:'Conversa inválida'});
 try{
  const conversa=await bancoCRM(`integracao_crm_conversas?instalacao=eq.${encodeURIComponent(process.env.CHATWOOT_INTEGRACAO_INSTALACAO||'')}&conta_id=eq.${encodeURIComponent(process.env.CHATWOOT_INTEGRACAO_CONTA||'')}&conversa_id=eq.${id}&select=id,identidade_confirmada`);
  if(conversa.length!==1)return res.status(200).json({acao:'aguardar_registro_da_conversa'});
  if(conversa[0].identidade_confirmada)return res.status(200).json({acao:'consultar_andamento',conversation_id:id});
  const nome=String(req.body.nome||'').slice(0,150),cidade=String(req.body.cidade||'').slice(0,100),documento=String(req.body.documento||'').replace(/\D/g,'');
  if(!documento&&nome.trim().length<5)return res.status(200).json({acao:'solicitar_dados',pergunta:'Qual é seu nome completo e em qual município está o imóvel?'});
  // Paginação obrigatória: a base possui mais de 10 mil moradores. Somente campos de identidade.
  const clientes=[];for(let offset=0;;offset+=500){const page=await bancoCRM(`fin_receb_clientes?select=id,nome,codigo,cpf_cnpj,municipio_id&order=id&limit=500&offset=${offset}`);clientes.push(...page);if(page.length<500)break;}
  const municipios=await bancoCRM('fin_receb_municipios?select=id,nome&limit=1000');
  const nomes=new Map(municipios.map(m=>[m.id,m.nome]));
  const candidatos=candidatosIdentidade(clientes.map(c=>({...c,municipio:nomes.get(c.municipio_id)})),{nome,cidade,documento});
  return res.status(200).json({acao:candidatos.length?'confirmar_com_cliente_e_revisar_vinculo':'solicitar_correcao',
   candidatos:candidatos.map(c=>({referencia:c.id,municipio:nomes.get(clientes.find(x=>x.id===c.id)?.municipio_id),cidade_confere:c.cidadeConfere||false})),
   pergunta:candidatos.length?'Pode confirmar seu nome completo, CPF e o município do imóvel para a equipe conferir seu cadastro?':'Não consegui identificar seu cadastro com segurança. Pode conferir o nome e o município do imóvel?',
   regras:['Nome e cidade podem ser fornecidos em qualquer ordem. Separe o que foi informado e pergunte apenas o que falta.','Não revelar nomes, documentos ou andamentos de outros candidatos.','Um candidato aproximado não confirma a identidade. A equipe confirma o vínculo no CRM.','Não atualizar o cadastro com as informações desta busca.']});
 }catch{return res.status(503).json({error:'Identificação temporariamente indisponível'});}
}

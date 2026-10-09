import {chamarOpenAI,ErroIA,configuracaoDocumentosIA} from '../server/openai.js';
import {exigirUsuarioIA} from '../server/ia-auth.js';
export const config={maxDuration:150};
export default async function handler(req,res){
 let documental=false;
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({erro:'Use POST.'});}
 try{
  const origem=req.headers.origin;
  if(origem&&req.headers.host&&new URL(origem).host!==req.headers.host)return res.status(403).json({erro:'Pedido de outro endereço recusado.'});
  let corpo;
  try{corpo=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({erro:'Pedido inválido.'});}
  if(Buffer.byteLength(JSON.stringify(corpo)||'')>4250000)return res.status(413).json({erro:'O conjunto de arquivos é muito grande. Envie menos arquivos ou PDFs menores por vez.'});
  await exigirUsuarioIA(req);
  documental=corpo?.purpose==='documentos_cliente';
  const configuracao=documental?configuracaoDocumentosIA():null;
  if(documental&&corpo.action==='documentos_config')return res.status(200).json(configuracao);
  if(documental&&!['analise','ocr'].includes(corpo.stage))throw new ErroIA('Etapa documental inválida.',400);
  if(documental&&['model','ocr_model','version'].some(k=>corpo.document_config?.[k]!==configuracao[k]))throw new ErroIA('A configuração da IA mudou. Tente novamente para usar a configuração atual.',409);
  const resultado=await chamarOpenAI({messages:corpo?.messages,max_tokens:Math.min(8000,Math.max(16,Number(corpo?.max_tokens)||1000))},documental?{purpose:'documentos_cliente',stage:corpo.stage}:undefined);
  return res.status(200).json(resultado);
 }catch(e){return res.status(e instanceof ErroIA?e.status:503).json({erro:e instanceof ErroIA?e.message:'Não foi possível concluir a análise. Seus arquivos foram preservados; tente novamente.',...(documental&&e instanceof ErroIA&&e.usage_attempts?{model:e.model,usage_total:e.usage_total,usage_attempts:e.usage_attempts}:{})});}
}


import {createHash} from 'node:crypto';
import {exigirUsuarioIA} from '../server/ia-auth.js';
import {chamarOpenAI,ErroIA} from '../server/openai.js';
import {validarLeituraMatricula,INSTRUCAO_MATRICULA} from '../server/matricula-ia.js';
export const config={maxDuration:300};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({message:'Use POST.'});
 try{
  const perfil=await exigirUsuarioIA(req);
  if(!['Administrador','Diretor de Projetos','Projetos'].includes(perfil.tipo))throw new ErroIA('Leitura disponível para Projetos e administradores.',403);
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  if(!raw||Buffer.byteLength(raw)>4250000)throw new ErroIA('Envie um arquivo de até 3 MB.',413);
  let body;try{body=JSON.parse(raw);}catch{throw new ErroIA('Pedido inválido.',400);}
  const {arquivo,mime,base64}=body||{};
  if(typeof arquivo!=='string'||!arquivo.trim()||arquivo.length>255||!['application/pdf','image/png','image/jpeg'].includes(mime)||typeof base64!=='string'||!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new ErroIA('Envie uma matrícula em PDF, PNG ou JPG.',400);
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length>3*1024*1024)throw new ErroIA('Envie um arquivo de até 3 MB.',413);
  const valido=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!valido)throw new ErroIA('O conteúdo não corresponde ao formato informado. Anexe novamente o arquivo.',400);
  if(!process.env.OPENAI_API_KEY?.trim())throw new ErroIA('A administração precisa cadastrar OPENAI_API_KEY no servidor. Seus dados foram preservados.');
  const url=process.env.VITE_ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co',apikey=process.env.VITE_ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4';
  const quota=await fetch(`${url}/rest/v1/rpc/integracao_reservar_leitura`,{method:'POST',headers:{apikey,Authorization:req.headers.authorization,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
  if(!quota.ok){const erro=await quota.json().catch(()=>({}));throw new ErroIA(erro.code==='P0001'?'Limite de 20 análises por hora atingido. Aguarde e tente novamente.':'Não foi possível autorizar a leitura da matrícula.',erro.code==='P0001'?429:quota.status===403?403:503);}
  const resposta=await chamarOpenAI({system:INSTRUCAO_MATRICULA,max_tokens:10000,messages:[{role:'user',content:[{type:mime==='application/pdf'?'document':'image',source:{type:'base64',media_type:mime,data:base64}},{type:'text',text:'Extraia os dados da matrícula para conferência humana.'}]}]},{timeoutMs:270000});
  const dados=validarLeituraMatricula(resposta.content[0].text);
  return res.status(200).json({arquivo,hash:createHash('sha256').update(bytes).digest('hex'),modelo:resposta.model,analisadoEm:new Date().toISOString(),dados});
 }catch(e){return res.status(e instanceof ErroIA?e.status:503).json({message:e instanceof ErroIA?e.message:'Não foi possível analisar a matrícula. Tente novamente; os dados existentes foram preservados.'});}
}

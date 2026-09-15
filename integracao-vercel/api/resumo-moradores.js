import {compactarResumo} from '../src/resumo-transporte.js';
import {resumirMoradores} from '../src/resumo-moradores.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido.'});
  const authorization=req.headers.authorization;
  if(!/^Bearer \S+$/.test(authorization||''))return res.status(401).json({message:'Entre novamente para carregar as pendências.'});
  const url=process.env.VITE_ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co';
  const apikey=process.env.VITE_ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4';
  const started=Date.now();
  try {
    // Forward the caller's token; never use service_role or shared session state.
    const pagina=async(inicio)=>{
      const response=await fetch(`${url}/rest/v1/rpc/integracao_moradores_carga`,{method:'POST',headers:{apikey,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({resumo:true,inicio}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Falha ao consultar pendências');
      return response.json();
    };
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const context=body?.contexto;
    if(!context||!Array.isArray(context.nucleos))return res.status(400).json({message:'Contexto das pendências ausente.'});
    const carga=await pagina(0);
    // Four bounded readers replace the browser's long serial full-record download.
    let offset=500;
    await Promise.all(Array.from({length:4},async()=>{while(offset<carga.total){const inicio=offset;offset+=500;const next=await pagina(inicio);carga.complementos.push(...next.complementos);}}));
    const moradores=resumirMoradores(carga,context);
    console.info('resumo-moradores',{registros:moradores.length,duracaoMs:Date.now()-started});
    return res.status(200).json({resumo:compactarResumo(moradores)});
  } catch(error) {
    console.error('resumo-moradores',{tipo:error.name,duracaoMs:Date.now()-started});
    return res.status(503).json({message:'As pendências demoraram para responder. Tente novamente.'});
  }
}

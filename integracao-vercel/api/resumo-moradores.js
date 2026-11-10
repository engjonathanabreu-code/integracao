import {compactarResumo} from '../src/resumo-transporte.js';
import {resumirMoradores} from '../src/resumo-moradores.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({message:'Método não permitido.'});
  const authorization=req.headers.authorization;
  if(!/^Bearer \S+$/.test(authorization||''))return res.status(401).json({message:'Entre novamente para carregar as pendências.'});
  const url=process.env.VITE_ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co';
  const apikey=process.env.VITE_ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4';
  const started=Date.now(),deadline=started+80000;
  const falha=(message,status=502,code='PAGINACAO_INCOMPLETA')=>Object.assign(new Error(message),{status,code});
  try {
    // Forward the caller's token; never use service_role or shared session state.
    const pagina=async(inicio,revisao=null)=>{
      if(Date.now()>=deadline)throw falha('Tempo total de leitura excedido.',504,'DEADLINE');
      const response=await fetch(`${url}/rest/v1/rpc/integracao_moradores_pagina_v2`,{method:'POST',headers:{apikey,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({inicio,revisao}),signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))});
      if(!response.ok)throw falha('Falha ao consultar pendências.',[401,403,409,422,429].includes(response.status)?response.status:503,'UPSTREAM_'+response.status);
      return response.json();
    };
    let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({message:'Corpo inválido.'});}
    if(Buffer.byteLength(JSON.stringify(body||{}))>1024*1024)return res.status(413).json({message:'Contexto excede o limite.'});
    const context=body?.contexto;
    if(!context||!Array.isArray(context.nucleos))return res.status(400).json({message:'Contexto das pendências ausente.'});
    const carga=await pagina(0);
    if(typeof carga?.revisao!=='string'||!carga.revisao)throw falha('Versão da leitura ausente.');
    const vistos=new Set();
    const validar=(page,inicio,total)=>{
      if(!page||!Array.isArray(page.clientes)||!Array.isArray(page.complementos))throw falha('Formato de página inválido.');
      if(!Number.isSafeInteger(total)||total<0||total>1000000)throw falha('Total de complementos inválido.');
      if(page.revisao!==carga.revisao)throw falha('O conjunto mudou durante a leitura.',409);
      if(page.total!=null&&page.total!==total)throw falha('O conjunto mudou durante a leitura.',409);
      if(page.complementos.length!==Math.min(500,Math.max(0,total-inicio)))throw falha('Página incompleta.');
      if(inicio&&page.clientes.length)throw falha('Clientes repetidos fora da primeira página.');
      for(const item of page.complementos){
        if(item?.colecao!=='processos'||typeof item.registro_id!=='string'||!item.registro_id||!item.dados||typeof item.dados!=='object')throw falha('Complemento inválido.');
        if(vistos.has(item.registro_id))throw falha('Complemento repetido durante a leitura.',409);
        vistos.add(item.registro_id);
      }
    };
    validar(carga,0,carga?.total);
    const clientes=new Set();for(const c of carga.clientes){if(typeof c?.id!=='string'||clientes.has(c.id))throw falha('Cliente inválido ou repetido.');clientes.add(c.id);}
    // Four bounded readers replace the browser's long serial full-record download.
    let offset=500;
    await Promise.all(Array.from({length:4},async()=>{while(offset<carga.total){const inicio=offset;offset+=500;const next=await pagina(inicio,carga.revisao);validar(next,inicio,carga.total);carga.complementos.push(...next.complementos);}}));
    carga.complementos.sort((a,b)=>a.registro_id.localeCompare(b.registro_id));
    if(Date.now()>=deadline)throw falha('Tempo total de leitura excedido.',504,'DEADLINE');
    const moradores=resumirMoradores(carga,context);
    console.info('resumo-moradores',{registros:moradores.length,duracaoMs:Date.now()-started});
    return res.status(200).json({resumo:compactarResumo(moradores)});
  } catch(error) {
    console.error('resumo-moradores',{tipo:error.name,duracaoMs:Date.now()-started});
    const status=error.status||(['TimeoutError','AbortError'].includes(error.name)?504:503);
    const message=status===401?'Entre novamente para carregar as pendências.':status===403?'Sua conta não tem permissão para consultar estas pendências.':status===429?'Limite de consultas atingido. Tente novamente mais tarde.':'Não foi possível validar a leitura completa das pendências. Tente novamente.';
    return res.status(status).json({message,code:error.code||'LEITURA_INDISPONIVEL'});
  }
}

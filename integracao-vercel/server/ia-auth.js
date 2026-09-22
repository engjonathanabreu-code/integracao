import {ErroIA} from './openai.js';
export async function exigirUsuarioIA(req){
 const authorization=req.headers.authorization;
 if(!/^Bearer \S+$/.test(authorization||''))throw new ErroIA('Entre novamente e atualize a página para analisar com a IA.',401);
 const url=process.env.VITE_ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co',apikey=process.env.VITE_ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4',headers={apikey,Authorization:authorization};
 const auth=await fetch(`${url}/auth/v1/user`,{headers,signal:AbortSignal.timeout(10000)});
 if(!auth.ok)throw new ErroIA('Sua sessão expirou. Entre novamente.',401);
 const user=await auth.json();
 const perfil=await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=ativo,tipo,setor`,{headers,signal:AbortSignal.timeout(10000)});
 if(!perfil.ok)throw new ErroIA('Não foi possível confirmar seu acesso. Tente novamente.');
 const ativo=(await perfil.json()).find(p=>p.ativo===true);
 if(!ativo)throw new ErroIA('Conta sem acesso ativo à análise de IA.',403);
 return ativo;
}

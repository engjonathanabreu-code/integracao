import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CRM_URL="https://oxjqcpkvaseqhjjtsxmd.supabase.co/functions/v1/erp-metas-upsert";
const SYNC_KEY = Deno.env.get("ERP_CRM_SYNC_KEY")!;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"private, no-store"};
async function lerJSON(req){
 const reader=req.body?.getReader();let tamanho=0;const partes=[];
 if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;tamanho+=value.byteLength;if(tamanho>65536){await reader.cancel();throw Object.assign(Error('Corpo excede o limite'),{status:413});}partes.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(tamanho);let offset=0;for(const p of partes){bytes.set(p,offset);offset+=p.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error('Corpo inválido'),{status:400});}
}
Deno.serve(async(req)=>{
 if(Number(req.headers.get("content-length")||0)>65536)return new Response(null,{status:413});
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Método não permitido"}),{status:405,headers:cors});
 try {

  const authHeader=req.headers.get("Authorization")||"";
  if(!/^Bearer \S+$/i.test(authHeader))return new Response(JSON.stringify({error:"Não autorizado"}),{status:401,headers:cors});
  const caller=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
  const {data:identity,error:authError}=await caller.auth.getUser(authHeader.replace(/^Bearer\s+/i,""));
  if(authError||!identity?.user)return new Response(JSON.stringify({error:"Não autorizado"}),{status:401,headers:cors});
  const {data:profile,error:profileError}=await caller.from("profiles").select("id,tipo,ativo").eq("id",identity.user.id).maybeSingle();
  if(profileError||!profile?.ativo)return new Response(JSON.stringify({error:"Perfil ativo necessário"}),{status:403,headers:cors});
  const erp=caller;
 const {meta_id}=await lerJSON(req);
 if(typeof meta_id!=="string"||! /^[0-9a-f-]{36}$/i.test(meta_id)) return new Response(JSON.stringify({error:"meta_id required"}),{status:400,headers:cors});
 const {data:permitido,error:erroPermissao}=await caller.rpc("integracao_atribuicoes_autorizar",{p_recurso:"metas",p_acao:"exportar",p_tabela:"metas",p_registro:meta_id});
 if(erroPermissao||permitido!==true)return new Response(JSON.stringify({error:"Operação não autorizada"}),{status:403,headers:cors});
 const [m,l,r,k,h,p]=await Promise.all([
   erp.from("metas").select("*").eq("id",meta_id).maybeSingle(),
   erp.from("meta_projetos").select("*").eq("meta_id",meta_id),
   erp.from("meta_responsaveis").select("usuario_id,profiles(nome)").eq("meta_id",meta_id),
   erp.from("meta_checklist").select("id,titulo,concluido,concluido_em,concluido_por,profiles:concluido_por(nome)").eq("meta_id",meta_id).order("created_at"),
   erp.from("meta_historico").select("acao,descricao,created_at,autor_id,profiles:autor_id(nome)").eq("meta_id",meta_id).order("created_at",{ascending:false}).limit(50),
   erp.from("processos_kanban").select("id,crm_projeto_id").not("crm_projeto_id","is",null)
 ]);
 if(m.error||l.error||r.error||k.error||h.error||p.error) return new Response(JSON.stringify({error:"Falha ao consultar meta"}),{status:500,headers:cors});
 if(!m.data)return new Response(JSON.stringify({error:"Meta indisponível ou sem acesso"}),{status:404,headers:cors});
 const meta=m.data;const links=l.data||[];const procMap=new Map((p.data||[]).map((x:any)=>[x.id,x.crm_projeto_id]));
 const responsaveis=(r.data||[]).map((x:any)=>({id:x.usuario_id,nome:x.profiles?.nome||null}));
 const desdobramentos=(k.data||[]).map((x:any)=>({id:x.id,titulo:x.titulo,concluido:!!x.concluido,concluido_em:x.concluido_em||null,concluido_por:x.profiles?.nome||null}));
 const historico=(h.data||[]).map((x:any)=>({acao:x.acao,descricao:x.descricao,created_at:x.created_at,autor:x.profiles?.nome||null}));
 const rows=meta?links.map((x:any)=>({meta_id,projeto_id:x.crm_projeto_id||procMap.get(x.processo_id),titulo:meta.titulo,observacoes:meta.observacoes,status:meta.status,semana_inicio:meta.semana_inicio,prazo:meta.prazo,responsaveis,desdobramentos,historico,atualizado_erp_em:new Date().toISOString(),updated_at:new Date().toISOString()})).filter((x:any)=>x.projeto_id):[];
 const resp=await fetch(CRM_URL,{redirect:"error",signal:AbortSignal.timeout(15000),method:"POST",headers:{"content-type":"application/json","x-erp-sync-key":SYNC_KEY},body:JSON.stringify({meta_id,rows})});
 const text=await resp.text();if(!resp.ok)return new Response(JSON.stringify({error:"Falha no serviço CRM"}),{status:502,headers:cors});
 return new Response(text,{headers:cors});
 }catch(e){return new Response(JSON.stringify({error:"Falha ao sincronizar meta"}),{status:[400,413].includes(e?.status)?e.status:503,headers:cors});}
});

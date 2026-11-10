import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CRM_URL = "https://oxjqcpkvaseqhjjtsxmd.supabase.co/functions/v1/erp-processos-export";
const CRM_ANON = Deno.env.get("ERP_CRM_ANON_KEY")!;
const SYNC_KEY = Deno.env.get("ERP_CRM_SYNC_KEY")!;
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"private, no-store"};
const inferStage=(status?:string|null)=>{if(status==="Concluído")return"Concluído";if(status==="Projeto")return"Projetos";if(status==="Topografia")return"Topografia";if(status==="Registro de Imóveis")return"Andamento";if(["Protocolado","Correções para Prefeitura","Outros"].includes(status||""))return"Protocolo";return"Comercial";};
Deno.serve(async(req)=>{
 if(Number(req.headers.get("content-length")||0)>65536)return new Response(null,{status:413});
 if(req.method==="OPTIONS")return new Response("ok",{status:200,headers:corsHeaders});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Método não permitido"}),{status:405,headers:corsHeaders});
 try{

  const authHeader=req.headers.get("Authorization")||"";
  if(!/^Bearer \S+$/i.test(authHeader))return new Response(JSON.stringify({error:"Não autorizado"}),{status:401,headers:corsHeaders});
  const caller=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
  const {data:identity,error:authError}=await caller.auth.getUser(authHeader.replace(/^Bearer\s+/i,""));
  if(authError||!identity?.user)return new Response(JSON.stringify({error:"Não autorizado"}),{status:401,headers:corsHeaders});
  const {data:profile,error:profileError}=await caller.from("profiles").select("id,tipo,ativo").eq("id",identity.user.id).maybeSingle();
  if(profileError||!profile?.ativo)return new Response(JSON.stringify({error:"Perfil ativo necessário"}),{status:403,headers:corsHeaders});
 
  if(!["Administrador","Comercial"].includes(profile.tipo)&&!/^Diretor(?: |$)/.test(profile.tipo||""))return new Response(JSON.stringify({error:"Sem permissão para sincronização geral"}),{status:403,headers:corsHeaders});
  const erp=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const r=await fetch(CRM_URL,{redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${CRM_ANON}`,apikey:CRM_ANON,"x-erp-sync-key":SYNC_KEY}});
  if(!r.ok)return new Response(JSON.stringify({error:"Falha no serviço CRM"}),{status:502,headers:corsHeaders});
  const payload=await r.json();const projetos=Array.isArray(payload.projetos)?payload.projetos:[];const andamentos=Array.isArray(payload.andamentos)?payload.andamentos:[];
  const {data:existing,error:eErr}=await erp.from("processos_kanban").select("id,crm_projeto_id,etapa_atual").not("crm_projeto_id","is",null);if(eErr)throw eErr;
  const existingMap=new Map((existing||[]).map((x:any)=>[x.crm_projeto_id,x]));
  const latest=new Map<string,any>();for(const a of andamentos){const cur=latest.get(a.projeto_id);const key=`${a.data_atualizacao||""}|${a.updated_at||""}`;const curKey=cur?`${cur.data_atualizacao||""}|${cur.updated_at||""}`:"";if(!cur||key>curKey)latest.set(a.projeto_id,a);}
  const now=new Date().toISOString();const rows=projetos.map((p:any)=>({crm_projeto_id:p.id,municipio:p.cidade||"Sem município",estado:p.estado||"SC",nucleo:p.nome||"Sem nome",ativo:p.ativo!==false,etapa_atual:existingMap.get(p.id)?.etapa_atual||inferStage(latest.get(p.id)?.status),observacao_interna:p.observacoes||null,origem:"CRM",crm_updated_at:p.updated_at||null,updated_at:now}));
  for(let i=0;i<rows.length;i+=150){const {error}=await erp.from("processos_kanban").upsert(rows.slice(i,i+150),{onConflict:"crm_projeto_id"});if(error)throw error;}
  const {data:proc,error:pErr}=await erp.from("processos_kanban").select("id,crm_projeto_id").not("crm_projeto_id","is",null);if(pErr)throw pErr;const procMap=new Map((proc||[]).map((x:any)=>[x.crm_projeto_id,x.id]));
  const aRows=andamentos.map((a:any)=>({processo_id:procMap.get(a.projeto_id),crm_andamento_id:a.id,status:a.status,status_operacional:a.status_operacional||null,descricao_cliente:a.descricao_cliente||null,observacao_interna:a.observacao_interna||null,previsao:a.previsao||null,orientacao_ia:a.orientacao_ia||null,visivel_ia:a.visivel_ia!==false,data_atualizacao:a.data_atualizacao||null,origem:a.fonte||"CRM",crm_created_at:a.created_at||null,crm_updated_at:a.updated_at||null})).filter((x:any)=>x.processo_id);
  for(let i=0;i<aRows.length;i+=150){const {error}=await erp.from("processos_kanban_andamentos").upsert(aRows.slice(i,i+150),{onConflict:"crm_andamento_id"});if(error)throw error;}
  return new Response(JSON.stringify({ok:true,projetos:rows.length,andamentos:aRows.length}),{headers:corsHeaders});
 }catch(e:any){console.error("sincronizar-processos-crm",{falha:true});return new Response(JSON.stringify({error:"Falha no serviço de integração"}),{status:500,headers:corsHeaders});}
});

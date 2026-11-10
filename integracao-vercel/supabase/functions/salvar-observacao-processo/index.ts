import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CRM_URL = "https://oxjqcpkvaseqhjjtsxmd.supabase.co/functions/v1/erp-processo-observacao";
const CRM_ANON = Deno.env.get("ERP_CRM_ANON_KEY")!;
const SYNC_KEY = Deno.env.get("ERP_CRM_SYNC_KEY")!;
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"private, no-store"};
async function lerJSON(req){
 const reader=req.body?.getReader();let tamanho=0;const partes=[];
 if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;tamanho+=value.byteLength;if(tamanho>65536){await reader.cancel();throw Object.assign(Error('Corpo excede o limite'),{status:413});}partes.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(tamanho);let offset=0;for(const p of partes){bytes.set(p,offset);offset+=p.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error('Corpo inválido'),{status:400});}
}
Deno.serve(async (req) => {
 if(Number(req.headers.get("content-length")||0)>65536)return new Response(null,{status:413});
  if(req.method === "OPTIONS") return new Response("ok",{headers:cors});
  if(req.method !== "POST") return new Response(JSON.stringify({error:"Método não permitido"}),{status:405,headers:cors});
  try {

  const authHeader=req.headers.get("Authorization")||"";
  if(!/^Bearer \S+$/i.test(authHeader))return new Response(JSON.stringify({error:"Não autorizado"}),{status:401,headers:cors});
  const caller=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false}});
  const {data:identity,error:authError}=await caller.auth.getUser(authHeader.replace(/^Bearer\s+/i,""));
  if(authError||!identity?.user)return new Response(JSON.stringify({error:"Não autorizado"}),{status:401,headers:cors});
  const {data:profile,error:profileError}=await caller.from("profiles").select("id,tipo,ativo").eq("id",identity.user.id).maybeSingle();
  if(profileError||!profile?.ativo)return new Response(JSON.stringify({error:"Perfil ativo necessário"}),{status:403,headers:cors});
     const erp=caller;
    const { processo_id, observacao } = await lerJSON(req);
    if(typeof processo_id!=="string"||! /^[0-9a-f-]{36}$/i.test(processo_id)||typeof observacao!=="string"||observacao.length>20000) return new Response(JSON.stringify({error:"processo_id obrigatório"}),{status:400,headers:cors});
 const {data:permitido,error:erroPermissao}=await caller.rpc("integracao_atribuicoes_autorizar",{p_recurso:"nucleos",p_acao:"editar",p_tabela:"processos_kanban",p_registro:processo_id});
 if(erroPermissao||permitido!==true)return new Response(JSON.stringify({error:"Operação não autorizada"}),{status:403,headers:cors});
    const {data:proc,error:pErr}=await erp.from("processos_kanban").select("id,crm_projeto_id").eq("id",processo_id).single();
    if(pErr||!proc)return new Response(JSON.stringify({error:"Processo indisponível ou sem acesso"}),{status:404,headers:cors});
    const text=String(observacao||"").trim();
    const {data:updated,error:uErr}=await erp.from("processos_kanban").update({observacao_interna:text||null,updated_at:new Date().toISOString()}).eq("id",processo_id).select("id").maybeSingle();
    if(uErr||!updated)return new Response(JSON.stringify({error:"Alteração não autorizada"}),{status:403,headers:cors});
    if(proc.crm_projeto_id){
      const r=await fetch(CRM_URL,{redirect:"error",signal:AbortSignal.timeout(15000),method:"POST",headers:{Authorization:`Bearer ${CRM_ANON}`,apikey:CRM_ANON,"x-erp-sync-key":SYNC_KEY,"content-type":"application/json"},body:JSON.stringify({projeto_id:proc.crm_projeto_id,observacao:text})});
      if(!r.ok) throw new Error("Falha no serviço CRM");
    }
    return new Response(JSON.stringify({ok:true}),{headers:cors});
  } catch(e:any){return new Response(JSON.stringify({error:"Falha no serviço de integração"}),{status:[400,413].includes(e?.status)?e.status:503,headers:cors});}
});

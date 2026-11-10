import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const source=readFileSync(process.env.INTEGRACAO_TEST_ADMIN_SOURCE||new URL('../supabase/functions/admin-create-usar/index.ts',import.meta.url),'utf8');
async function invoke(user,profile){
 let handler,writes=0;
 const client={auth:{getUser:async()=>({data:{user},error:null}),admin:{createUser:async()=>{writes++;return {data:{user:{id:'fixture-created'}},error:null};}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})};
 const code=(await transform(source.replace(/import \{ createClient \} from [^;]+;/,"const createClient=globalThis.fixtureClient;"),{loader:'ts',format:'cjs'})).code;
 const context={fixtureClient:()=>client,Deno:{env:{get:k=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SECRET_KEYS:'{"fixture":"fake-only"}',SUPABASE_SECRET_KEY_NAME:'fixture'})[k]},serve:fn=>handler=fn},Response,TextEncoder};
 vm.runInNewContext(code,context);
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer ficticio','Content-Type':'application/json'},body:JSON.stringify({email:'test@example.invalid'})}));
 return {status:response.status,writes};
}
test('metadado editável não autoriza criar usuários',async()=>assert.deepEqual(await invoke({id:'a',user_metadata:{is_admin:true}},{ativo:true,tipo:'Comercial'}),{status:403,writes:0}));
test('administrador inativo não cria usuários',async()=>assert.deepEqual(await invoke({id:'a',app_metadata:{role:'admin'}},{ativo:false,tipo:'Administrador'}),{status:403,writes:0}));
test('administrador ativo mantém a criação autorizada',async()=>assert.deepEqual(await invoke({id:'a',app_metadata:{role:'admin'}},{ativo:true,tipo:'Administrador'}),{status:200,writes:1}));

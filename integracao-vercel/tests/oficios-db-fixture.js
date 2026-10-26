import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
export const admin='00000000-0000-4000-8000-000000000001',func='00000000-0000-4000-8000-000000000002';
export async function banco(){const db=new PGlite();await db.exec(readFileSync(new URL('./oficios-db.fixture.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/operacoes/oficios.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/operacoes/oficios-equipe.sql',import.meta.url),'utf8'));return db;}
export async function como(db,u,sql,params=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${u}';`);try{return(await db.query(sql,params)).rows;}finally{await db.exec('reset role');}}
export const rpc=(db,u,d)=>como(db,u,"select integracao_oficios_operar('registrar',$1) r",[JSON.stringify(d)]).then(r=>r[0].r);
export async function arquivo(db,numero=42,data='2025-01-10',hash=crypto.randomUUID().replaceAll('-','').repeat(2)){
 const pedido=crypto.randomUUID(),caminho=`${admin}/${pedido}/oficio.pdf`;await db.query("insert into storage.objects values('integracao-oficios',$1)",[caminho]);return{pedido,caminho,numero,data_envio:data,prefeitura:'Prefeitura Teste',assunto:'Solicitação de análise',nome_arquivo:'oficio.pdf',mime:'application/pdf',tamanho:100,sha256:hash,resumo:'Solicita a análise do processo administrativo.',resumo_status:'ia'};
}

import {igualSemantico} from './igualdade-semantica.js';
import {revisaoDeRecusa} from './estado-sincronizacao.js';
const falhar=()=>{throw Object.assign(Error('Arquivo fora do escopo seguro desta revisão. Preserve o original e solicite análise.'),{code:'REVISAO_NECESSARIA'});};
export async function resumoBytes(value){
 if(typeof value!=='string')falhar();
 const bytes=new TextEncoder().encode(value);
 return {hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),bytes:bytes.length};
}
// Deliberately excludes public/shared files, mixed edits, removal and ambiguous batches.
export function arquivoRecusado(item,conta,state){
 if(!item||item.conta!==conta||item.recibo||!revisaoDeRecusa(item)||item.erro?.rejeicaoConfirmada!==true||item.erro?.codigo!=='PT409'||item.erro?.fase!=='envio'||item.original.substitui||item.original.legado||item.original.intencao.edicoes?.length)return null;
 const entries=Object.entries(item.original.intencao.arquivos||{});if(entries.length!==1)return null;
 const [id,a]=entries[0];
 if(!/^integracao-(campo-offline-v1$|comercial-offline-v1$|doc-offline-v1-)/.test(a.key)||id!==`${conta}|${a.key}`||typeof a.value!=='string'||!a.version)return null;
 const rows=(state.base?.integracao_arquivos||[]).filter(r=>r.registro_id===id);if(rows.length!==1)return null;
 const row=rows[0],d=row.dados;
 if(row.criado_por!==conta||row.referencia_tabela!=null||row.referencia_id!=null||row.colecao!=='arquivos'||typeof row.updated_at!=='string'||!d||d.chave!==a.key||! /^[a-f0-9]{64}$/.test(d.hash)||d.path!==`${conta}/${d.hash}`||!Number.isSafeInteger(d.bytes)||d.bytes<0)return null;
 if(Object.keys(d).sort().join(',')!=='bytes,chave,hash,path')return null;
 const ops=item.payload||[];
 if(ops.length!==1||ops[0].table!=='integracao_arquivos'||ops[0].key?.registro_id!==id||ops[0].key?.colecao!=='arquivos'||ops[0].remove||!ops[0].changes?.dados)return null;
 if(!igualSemantico(item.preparado?.sent?.[id],a))return null;
 return {id,arquivo:structuredClone(a),row:structuredClone(row)};
}
export async function prepararRevisaoArquivo({item,conta,state,lerConteudo,checksum,conferir}){
 const alvo=arquivoRecusado(item,conta,state);if(!alvo)falhar();
 if(await checksum(item.original)!==item.checksum)falhar();conferir();
 const local=await resumoBytes(alvo.arquivo.value),enviado=item.payload[0].changes.dados;
 if(!igualSemantico(enviado,{chave:alvo.arquivo.key,path:`${conta}/${local.hash}`,...local}))falhar();
 conferir();
 const value=await lerConteudo(alvo.row.dados.path);conferir();
 const remoto=await resumoBytes(value);conferir();
 if(remoto.hash!==alvo.row.dados.hash||remoto.bytes!==alvo.row.dados.bytes)falhar();
 return {versao:1,tipo:'substituicao_local_explicita',origem:item.id,checksumOriginal:item.checksum,conta,id:alvo.id,arquivoOriginal:alvo.arquivo,anterior:{row:alvo.row,value,...remoto},local,confirmadoEm:new Date().toISOString()};
}
// Guard the complete metadata as an UNCHANGED field. The existing SQL checks it
// exactly (no JSON merge), locks the row. A second guard keeps updated_at
// expected-only while writing data; a final op applies the normal timestamp.
export function protegerOperacoesArquivo(operacoes,auditoria){
 if(!auditoria)return operacoes;
 const {row}=auditoria.anterior;
 if(operacoes.length>1||operacoes.some(op=>op.table!=='integracao_arquivos'||op.key?.registro_id!==auditoria.id||op.insert||op.remove||!igualSemantico(op.expected?.dados,row.dados)))falhar();
 if(!operacoes.length)operacoes=[{table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:auditoria.id},expected:{dados:structuredClone(row.dados)},changes:{dados:structuredClone(row.dados)}}];
 const op=structuredClone(operacoes[0]),carimbo=op.changes.updated_at??row.updated_at;
 delete op.changes.updated_at;
 op.expected={...op.expected,updated_at:row.updated_at};
 return [
  {table:'integracao_arquivos',key:{colecao:'arquivos',registro_id:auditoria.id},expected:structuredClone(row),changes:{updated_at:row.updated_at}},
  op,
  {table:'integracao_arquivos',key:structuredClone(op.key),expected:{dados:structuredClone(op.changes.dados)},changes:{updated_at:carimbo}},
 ];
}

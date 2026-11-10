import {igualSemantico} from './igualdade-semantica.js';
// Advance a frozen file's base only through its own confirmed predecessors.
// An unrelated remote change remains subject to the normal SQL precondition.
export function arquivosDaIntencao(item,items){
 const arquivos=structuredClone(item.original.intencao.arquivos||{}),porId=new Map(items.map(i=>[i.id,i]));
 const deps=(item.dependencias||[]).map(id=>{let d=porId.get(id);const vistos=new Set();while(d?.substituidaPor&&!vistos.has(d.id)){vistos.add(d.id);d=porId.get(d.substituidaPor);}return d;}).filter(d=>d?.estado==='confirmado'&&d.recibo).sort((a,b)=>a.ordem-b.ordem);
 for(const [id,arquivo] of Object.entries(arquivos)){
  const baseOriginal=arquivo.expected??null;
  for(const dep of deps){
   const anterior=dep.original.intencao.arquivos?.[id];
   const op=dep.payload?.find(o=>o.table==='integracao_arquivos'&&o.key?.registro_id===id);
   if(!anterior||(!igualSemantico(baseOriginal,anterior.expected??null)&&!(op?.expected&&igualSemantico(baseOriginal,op.expected.dados??null))))continue;
   if(op?.remove)arquivo.expected=null;
   else if(op?.changes?.dados)arquivo.expected=structuredClone(op.changes.dados);
  }
 }
 return arquivos;
}

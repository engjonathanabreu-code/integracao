import {diagnosticoOperacao} from './diagnostico-sincronizacao.js';
import {terminal} from './estado-sincronizacao.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function edicaoVisivelParaAtualizar(documento=globalThis.document){
 if(!documento?.querySelectorAll)return true;
 // A blurred controlled input does not prove its React draft was saved. Do not
 // reload a screen with editable fields, even if no control currently has focus.
 return [...documento.querySelectorAll('input:not([type="hidden"]),textarea,select,[contenteditable="true"]')].some(el=>!el.disabled&&!el.readOnly&&el.getClientRects().length>0);
}
export function diagnosticosSuporte(itens,pedido=null){
 return itens.filter(i=>uuid(i.id)&&uuid(i.pedido||i.id)&&(pedido?i.id===pedido:!terminal(i))).slice(0,100).map(i=>{
  const d=diagnosticoOperacao(i,Date.now(),itens);
  return {id:d.id,pedido:d.pedido||d.id,estado:d.estado,codigo:d.codigo,fase:d.fase,tentativas:d.tentativas,temRecibo:!!i.recibo,dependencias:d.dependencias,restricao:d.restricao,espera:d.espera.motivo};
 });
}

// Local-only recovery copy. Re-read it before allowing a user-initiated reload;
// any intervening edit, file queue, session change or quota error aborts reload.
export async function prepararRecuperacaoAtualizacao({conta,storage,snapshot,seguro,conferir,esperar}){
 conferir();if(!seguro())return false;
 const antes=JSON.stringify(snapshot());await esperar();conferir();
 if(!seguro()||JSON.stringify(snapshot())!==antes)return false;
 const chave=`integracao-suporte-recuperacao-v1-${conta}-${crypto.randomUUID()}`;
 await storage.set(chave,antes);conferir();
 const gravado=await storage.get(chave);conferir();
 return gravado===antes&&seguro()&&JSON.stringify(snapshot())===antes;
}

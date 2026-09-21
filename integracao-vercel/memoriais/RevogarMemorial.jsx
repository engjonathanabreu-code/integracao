import {useState} from 'react';
import {revogarMemorial} from './revogacao.js';
export default function RevogarMemorial({db,n,alvo,anterior,pode,mutar,por,setToast,aoRevogar}) {
 const [revisao,setRevisao]=useState(null),[motivo,setMotivo]=useState(''),[erro,setErro]=useState(''),[salvando,setSalvando]=useState(false);
 if(!pode||!anterior)return null;
 const confirmar=async()=>{if(salvando)return;setSalvando(true);try{
  await mutar(d=>revogarMemorial(d,n.id,alvo,revisao,motivo,por),'Memorial revogado',{nucleoId:n.id,municipioId:n.municipioId,processoId:alvo.moradorId,detalhe:motivo});
  setRevisao(null);setMotivo('');setErro('');setToast('Memorial revogado. Histórico preservado.');aoRevogar?.();
 }catch(e){setErro(e.message);}finally{setSalvando(false);}};
 return <div style={{marginTop:12}}><button className="btn btn-perigo" onClick={()=>{setRevisao(structuredClone(anterior));setErro('');}}>Revogar memorial e liberar vínculo</button>
 {revisao&&<div role="region" aria-label="Revogar memorial" className="card" style={{padding:16,marginTop:12}}><p>O memorial será retirado deste destino e o lote ficará disponível para um novo vínculo. A versão anterior e o motivo permanecerão no histórico. Documentos já baixados não são alterados.</p>
 <label className="rot">Motivo da revogação<input className="inp" value={motivo} onChange={e=>setMotivo(e.target.value)}/></label>
 <div className="flex flex-wrap gap-2" style={{marginTop:10}}><button className="btn btn-perigo" disabled={salvando||!motivo.trim()} onClick={confirmar}>Confirmar revogação</button><button className="btn" onClick={()=>setRevisao(null)}>Cancelar revogação</button></div></div>}
 {erro&&<p role="alert" className="msg-erro">{erro}</p>}</div>;
}

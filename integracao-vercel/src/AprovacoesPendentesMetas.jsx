import React,{useState} from 'react';
import {Check} from 'lucide-react';
import {metasAguardandoAprovacao,diasAguardandoAprovacao,aprovarMetasEmLote,resumoAprovacaoEmLote} from './metas-uso.js';

// USO-M3 — fila de quem aprova: tudo o que espera a minha decisão em um só
// lugar, com aprovação de várias metas de uma vez. Recusar continua sendo
// feito dentro da meta, porque exige motivo.
export default function AprovacoesPendentesMetas({metas,usuarios,hoje,podeAprovar,aprovar,onAbrir,setToast}) {
  const [marcadas,setMarcadas]=useState(()=>new Set());
  const [enviando,setEnviando]=useState(false);
  const [falhas,setFalhas]=useState([]);
  const fila=metasAguardandoAprovacao(metas,podeAprovar);
  if(!fila.length&&!falhas.length)return null;
  const nome=id=>(usuarios||[]).find(u=>u.id===id)?.nome||'Usuário removido';
  const escolhidas=fila.filter(m=>marcadas.has(m.id));
  const todas=fila.length>0&&escolhidas.length===fila.length;
  const alternar=id=>setMarcadas(atual=>{const s=new Set(atual);if(s.has(id))s.delete(id);else s.add(id);return s;});
  const aprovarEscolhidas=async()=>{
    if(enviando||!escolhidas.length)return;
    if(!window.confirm(`Aprovar a conclusão de ${escolhidas.length} meta(s)? Cada uma será registrada no histórico e os responsáveis serão avisados.`))return;
    setEnviando(true);setFalhas([]);
    try{
      const resultado=await aprovarMetasEmLote(escolhidas,aprovar);
      setFalhas(resultado.falhas);setMarcadas(new Set(resultado.falhas.map(f=>f.id)));
      setToast(resumoAprovacaoEmLote(resultado));
    }finally{setEnviando(false);}
  };
  return (
    <section className="card" style={{padding:18,marginBottom:12}} aria-label="Aguardando minha aprovação">
      <div className="flex items-center justify-between gap-2 flex-wrap" style={{marginBottom:10}}>
        <div><strong>Aguardando minha aprovação ({fila.length})</strong><p className="ajuda" style={{margin:0}}>Pedidos de conclusão, do mais antigo para o mais novo. Para recusar, abra a meta.</p></div>
        {fila.length>0&&<div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 ajuda" style={{margin:0}}><input type="checkbox" checked={todas} disabled={enviando} onChange={()=>setMarcadas(todas?new Set():new Set(fila.map(m=>m.id)))}/>Selecionar todas</label>
          <button className="btn btn-sm btn-primario" disabled={enviando||!escolhidas.length} onClick={aprovarEscolhidas}><Check size={14}/>{enviando?'Aprovando…':`Aprovar selecionadas (${escolhidas.length})`}</button>
        </div>}
      </div>
      {falhas.length>0&&<div className="msg-erro" role="alert" style={{marginBottom:8}}>{falhas.map(f=><div key={f.id}>{f.titulo||'Meta'}: {f.mensagem}</div>)}</div>}
      {fila.map(m=>{
        const dias=diasAguardandoAprovacao(m,hoje),solicitante=m.solicitacaoConclusao?.solicitanteId;
        return (
          <div key={m.id} className="flex items-center gap-2 flex-wrap" style={{padding:'8px 0',borderTop:'1px solid var(--line2)'}}>
            <input type="checkbox" aria-label={`Selecionar ${m.titulo}`} checked={marcadas.has(m.id)} disabled={enviando} onChange={()=>alternar(m.id)}/>
            <span style={{flex:'1 1 220px',minWidth:0}}>
              <strong style={{display:'block',overflowWrap:'anywhere'}}>{m.titulo}</strong>
              <span className="ajuda" style={{margin:0}}>{solicitante?`Pedido por ${nome(solicitante)}`:(m.responsaveis||[]).map(nome).join(', ')||'Sem responsável'}{dias===null?'':dias===0?', hoje':`, há ${dias} ${dias===1?'dia':'dias'}`}{m.setor?` · ${m.setor}`:''}</span>
            </span>
            <button className="btn btn-sm" disabled={enviando} onClick={()=>onAbrir(m)}>Abrir</button>
          </div>
        );
      })}
    </section>
  );
}

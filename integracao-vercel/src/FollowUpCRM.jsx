import {useState} from 'react';
import {CampoCRM,EstadoModulo,useModulo} from './modulo-ui.jsx';
import {listarCRM,rpcCRM} from './crm-api.js';
import {PRAZOS_FOLLOWUP,situacaoFollowup,dataFollowup} from './crm-followup.js';
export function ResumoFollowUp({pendente,abrir}){
 const s=situacaoFollowup(pendente);
 return <section className={`crm-followup-resumo ${s.tipo}`}><strong>FollowUp · {s.texto}</strong>{pendente&&<span>{dataFollowup(pendente.previsto_em)} · {pendente.prazo_dias} dia(s)</span>}<button className="btn btn-sm" onClick={abrir}>{pendente?'Registrar FollowUp feito':'Agendar FollowUp'}</button></section>;
}
export function ResumoChatwoot({resumo}){
 return <div className="crm-chatwoot-resumo"><strong>Chatwoot</strong><span>{resumo?.conversas||0} conversa(s) · {resumo?.mensagens||0} mensagem(ns) registradas</span>{resumo?.ultima_mensagem&&<small>Última: {dataFollowup(resumo.ultima_mensagem)}</small>}</div>;
}
export default function FollowUpCRM({card,usuarios,atualizar,tabela='integracao_crm_followups',rpc='integracao_crm_followup',encerrado=false,mensagemEncerrado='Negócio encerrado. O histórico permanece disponível.'}){
 const m=useModulo(()=>listarCRM(tabela,`&card_id=eq.${card.id}&order=criado_em.desc,id.desc`),[card.id,tabela],['crm']);
 const [dias,setDias]=useState(''),[resumo,setResumo]=useState(''),[feito,setFeito]=useState(false),[pedido,setPedido]=useState(()=>crypto.randomUUID()),[aviso,setAviso]=useState('');
 const pendente=m.dados?.find(f=>f.status==='pendente');
 const autor=id=>usuarios.find(u=>(u.erpRef||u.id)===id)?.nome||'Usuário registrado';
 return <section className="crm-followup" aria-label="FollowUp do cliente"><h3>FollowUp</h3><EstadoModulo modulo={m}/>{m.dados&&<>
 <p className={`crm-followup-status ${situacaoFollowup(pendente).tipo}`}>{encerrado?'Acompanhamento encerrado':situacaoFollowup(pendente).texto}{pendente&&<> · {dataFollowup(pendente.previsto_em)}</>}</p>
 {!encerrado&&<form className="crm-form" data-edicao-pendente={!!dias||!!resumo} onSubmit={async e=>{e.preventDefault();if(pendente&&!feito)return;const ok=await m.executar(()=>rpcCRM(rpc,{p_card:card.id,p_pedido:pedido,p_anterior:pendente?.id||null,p_dias:Number(dias),p_resumo:pendente?resumo.trim():''}));if(ok){setDias('');setResumo('');setFeito(false);setPedido(crypto.randomUUID());setAviso(pendente?'FollowUp concluído e próximo prazo agendado.':'FollowUp agendado.');atualizar();}}}>
 <fieldset disabled={m.ocupado}>
 {pendente&&<><label className="crm-followup-confirmacao"><input type="checkbox" required checked={feito} onChange={e=>setFeito(e.target.checked)}/>Confirmo que este FollowUp foi feito</label><CampoCRM nome="Resumo do último FollowUp"><textarea aria-label="Resumo do último FollowUp" className="inp" required minLength={5} maxLength={2000} rows={4} value={resumo} onChange={e=>setResumo(e.target.value)} placeholder="O que foi feito ou descoberto? Registre o resultado do contato e os próximos passos."/></CampoCRM></>}
 <CampoCRM nome={pendente?'Novo prazo de FollowUp':'Prazo de FollowUp'}><select aria-label={pendente?'Novo prazo de FollowUp':'Prazo de FollowUp'} className="inp" required value={dias} onChange={e=>setDias(e.target.value)}><option value="">Selecione o prazo</option>{PRAZOS_FOLLOWUP.map(d=><option key={d} value={d}>{d} {d===1?'dia':'dias'}</option>)}</select></CampoCRM>
 <p className="ajuda">Dias corridos, contados a partir do registro. A conclusão e o próximo prazo são salvos juntos.</p>
 <button className="btn btn-primario" disabled={m.ocupado||!dias||!!pendente&&(!feito||resumo.trim().length<5)}>{m.ocupado?'Salvando…':pendente?'Concluir e agendar próximo':'Agendar FollowUp'}</button>
 </fieldset></form>}{encerrado&&<p>{mensagemEncerrado}</p>}{aviso&&<p role="status">{aviso}</p>}
 <details><summary>Histórico de FollowUp ({m.dados.filter(f=>f.status!=='pendente').length})</summary>{m.dados.filter(f=>f.status!=='pendente').map(f=><article className="crm-mensagem" key={f.id}><strong>{f.status==='feito'?'Feito':f.status==='arquivado'?'Agendamento encerrado ao arquivar lead':f.status==='cancelado'?'Agendamento encerrado junto com o negócio':'Agendamento unificado ao vincular cliente'}</strong><p>Previsto: {dataFollowup(f.previsto_em)} · {f.prazo_dias} dia(s)</p>{f.status==='feito'&&<><p>{dataFollowup(f.concluido_em)} · {autor(f.concluido_por)} · {new Date(f.concluido_em)>new Date(f.previsto_em)?'Concluído com atraso':'Concluído no prazo'}</p><p>{f.resumo}</p></>}</article>)}</details></>}</section>;
}

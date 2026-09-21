import {useRef,useState} from 'react';
import {useModulo,EstadoModulo,CampoCRM} from './modulo-ui.jsx';
import {ponto,solicitacoesPonto,idPonto,horaPonto} from './ponto-api.js';
import {acessoCRM} from './crm-regras.js';
const data=d=>d.split('-').reverse().join('/');
const horas=lista=>lista?.length?lista.map(h=>horaPonto(h)).join(' · '):'Sem marcações';
const status={pendente:'Aguardando Diretoria',aprovada:'Aprovada',recusada:'Recusada',cancelada:'Cancelada'};
export function PedirCorrecaoPonto({dia,fechar,salvar}){
 const [texto,setTexto]=useState(dia.batidas.map(h=>horaPonto(h).slice(0,5)).join('\n')),[motivo,setMotivo]=useState(''),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),pedido=useRef(crypto.randomUUID());
 return <section className="card ponto-acao" aria-label="Solicitar alteração"><h3>Solicitar alteração · {data(dia.dia)}</h3><p>Informe todos os horários corretos deste dia, em pares de entrada e saída. A folha só muda após aprovação da Diretoria.</p><p>Registrado atualmente: {horas(dia.batidas)}</p>
 <form className="ponto-form" data-edicao-pendente="true" onSubmit={async e=>{e.preventDefault();if(ocupado)return;setErro('');const lista=texto.trim().split(/\s+/).filter(Boolean);if(lista.length%2||lista.length>40||lista.some((h,i)=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)||(i>0&&h<=lista[i-1]))){setErro('Informe pares de horários HH:MM em ordem crescente, um por linha.');return;}setOcupado(true);try{await ponto('solicitar_correcao',{pedido:pedido.current,dia:dia.dia,assinatura:dia.assinatura,batidas:lista.map(h=>`${dia.dia}T${h}:00-03:00`),motivo});salvar();}catch(e){setErro(e.message);}finally{setOcupado(false);}}}>
 <CampoCRM nome="Horários solicitados"><textarea className="inp" rows={5} value={texto} onChange={e=>setTexto(e.target.value)}/></CampoCRM><p className="ajuda">Exemplo: 08:00, 12:00, 13:00 e 17:00, um por linha. Deixe vazio somente se solicitar a remoção de todas as marcações do dia. Os registros originais ficam preservados.</p>
 <CampoCRM nome="Motivo da alteração"><textarea className="inp" required minLength={5} value={motivo} onChange={e=>setMotivo(e.target.value)}/></CampoCRM>
 {erro&&<p role="alert">{erro}</p>}<div className="flex gap-2"><button className="btn btn-primario" disabled={ocupado||motivo.trim().length<5}>Enviar solicitação</button><button type="button" className="btn" disabled={ocupado} onClick={fechar}>Cancelar</button></div></form></section>;
}
export default function SolicitacoesPonto({usuario,usuarioId,mes,usuarios,aoDecidir,versao}){
 const diretor=acessoCRM(usuario).admin,meuId=idPonto(usuario),m=useModulo(()=>solicitacoesPonto(usuarioId,mes,diretor),[usuarioId,mes,diretor,versao],['ponto']);
 const [decisao,setDecisao]=useState(null),[motivo,setMotivo]=useState('');
 const nome=id=>usuarios.find(u=>idPonto(u)===id)?.nome||'Funcionário';
 const decidir=async()=>{if(await m.executar(()=>ponto('decidir_correcao',{pedido:decisao.r.id,aprovada:decisao.aprovada,motivo}))){setDecisao(null);setMotivo('');aoDecidir();}};
 const registro=r=><article key={r.id} className="card ponto-config"><strong>{nome(r.usuario_id)} · {data(r.dia)} · {status[r.status]}</strong><p>Motivo: {r.motivo}</p><p>Antes: {horas(r.anteriores)}</p><p>Solicitado: {horas(r.batidas)}</p><small>Solicitado em {new Date(r.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</small>
 {r.motivo_decisao&&<p>{r.status==='cancelada'?'Cancelamento':'Decisão'}: {r.motivo_decisao} · {nome(r.decisor)} · {new Date(r.decidido_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>}
 {r.status==='pendente'&&<div className="flex gap-2">{diretor&&r.usuario_id!==meuId&&<><button className="btn btn-primario" disabled={m.ocupado} onClick={()=>{setDecisao({r,aprovada:true});setMotivo('');}}>Aprovar alteração</button><button className="btn" disabled={m.ocupado} onClick={()=>{setDecisao({r,aprovada:false});setMotivo('');}}>Recusar alteração</button></>}{r.usuario_id===meuId&&<button className="btn" disabled={m.ocupado} onClick={()=>m.executar(()=>ponto('cancelar_correcao',{pedido:r.id}))}>Cancelar solicitação</button>}</div>}</article>;
 return <section aria-label="Solicitações de alteração"><h3>{diretor?'Solicitações de alteração':'Minhas solicitações de alteração'}</h3><EstadoModulo modulo={m}/>
 {decisao&&<form className="card ponto-config ponto-form" data-edicao-pendente="true" onSubmit={e=>{e.preventDefault();decidir();}}><h4>{decisao.aprovada?'Aprovar':'Recusar'} · {nome(decisao.r.usuario_id)} · {data(decisao.r.dia)}</h4><p>Horários solicitados: {horas(decisao.r.batidas)}</p><CampoCRM nome="Justificativa da decisão"><textarea className="inp" required minLength={5} value={motivo} onChange={e=>setMotivo(e.target.value)}/></CampoCRM><div className="flex gap-2"><button className="btn btn-primario" disabled={m.ocupado||motivo.trim().length<5}>Confirmar decisão</button><button type="button" className="btn" disabled={m.ocupado} onClick={()=>setDecisao(null)}>Voltar</button></div></form>}
 {diretor&&<><h4>Pendentes de todos os funcionários</h4>{m.dados?.pendentes.map(registro)}{m.dados&&!m.dados.pendentes.length&&<p>Nenhuma solicitação pendente.</p>}</>}
 <h4>Histórico do funcionário no mês selecionado</h4>{m.dados?.registros.filter(r=>!diretor||r.status!=='pendente').map(registro)}{m.dados&&!m.dados.registros.length&&<p>Nenhuma solicitação neste mês.</p>}
 </section>;
}

import {useEffect,useRef,useState} from 'react';
import {Building2,Plus,X} from 'lucide-react';
import {listarCRM,rpcCRM} from './crm-api.js';
import {acessoCRM,normalizarCRM} from './crm-regras.js';
import {CampoCRM,EstadoModulo,useModulo} from './modulo-ui.jsx';
import FollowUpCRM,{ResumoFollowUp} from './FollowUpCRM.jsx';
const ESTADOS=['Em negociação','Ganho','Perdido'];
const moeda=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function Ficha({registro,usuario,usuarios,salvar,fechar,atualizar,ocupado,erro}){
 const [f,setF]=useState(()=>registro||{id:crypto.randomUUID(),versao:0,nome:'',contato:'',produto:'',valor:'',responsavel_id:usuario.erpRef||usuario.id,status:'Em negociação',motivo_perda:'',dias:''});
 const dialog=useRef(null),[alterado,setAlterado]=useState(false);
 useEffect(()=>{const d=dialog.current;d.showModal();return()=>d.close();},[]);
 const campo=(k,v)=>{setF(a=>({...a,[k]:v}));setAlterado(true);};
 const admin=acessoCRM(usuario).admin;
 const responsaveis=usuarios.filter(u=>u.ativo!==false&&acessoCRM(u).comercial||u.erpRef===f.responsavel_id);
 return <dialog ref={dialog} className="crm-ficha-dialogo crm-institucional-dialogo" aria-label={registro?'Ficha institucional':'Cadastrar cliente institucional'} onCancel={e=>{e.preventDefault();if(!ocupado)fechar();}}>
 <button className="btn crm-ficha-fechar" aria-label="Fechar ficha institucional" disabled={ocupado} onClick={fechar}><X size={20}/></button>
 <h2>{registro?'Cliente institucional':'Cadastrar cliente institucional'}</h2><p>Negócio com prefeitura ou órgão público, registrado no CRM.</p>
 {erro&&<p className="crm-erro" role="alert">{erro}</p>}
 <form className="crm-form" data-edicao-pendente={alterado} onSubmit={e=>{e.preventDefault();salvar(f);}}><fieldset disabled={ocupado}>
 <CampoCRM nome="Nome do cliente"><input className="inp" required minLength={2} maxLength={200} value={f.nome} onChange={e=>campo('nome',e.target.value)} placeholder="Prefeitura / órgão público"/></CampoCRM>
 <CampoCRM nome="Contato"><textarea className="inp" required minLength={2} maxLength={500} rows={2} value={f.contato} onChange={e=>campo('contato',e.target.value)} placeholder="Pessoa, cargo, telefone ou e-mail"/></CampoCRM>
 <CampoCRM nome="Produto ou serviço"><input className="inp" required minLength={2} maxLength={500} value={f.produto} onChange={e=>campo('produto',e.target.value)}/></CampoCRM>
 <CampoCRM nome="Valor (R$)"><input className="inp" type="number" min="0" max="999999999999.99" step="0.01" required value={f.valor} onChange={e=>campo('valor',e.target.value)}/></CampoCRM>
 {admin&&<CampoCRM nome="Comercial responsável"><select aria-label="Comercial responsável" className="inp" required value={f.responsavel_id} onChange={e=>campo('responsavel_id',e.target.value)}>{responsaveis.map(u=><option key={u.id} value={u.erpRef||u.id}>{u.nome}{u.ativo===false?' (inativo)':''}</option>)}</select></CampoCRM>}
 {registro?<CampoCRM nome="Status do negócio"><select aria-label="Status do negócio" className="inp" value={f.status} onChange={e=>campo('status',e.target.value)}>{ESTADOS.map(s=><option key={s}>{s}</option>)}</select></CampoCRM>:<CampoCRM nome="Prazo inicial de FollowUp"><select aria-label="Prazo inicial de FollowUp" className="inp" required value={f.dias} onChange={e=>campo('dias',e.target.value)}><option value="">Selecione o prazo</option>{[1,2,4].map(d=><option key={d} value={d}>{d} {d===1?'dia':'dias'}</option>)}</select></CampoCRM>}
 {f.status==='Perdido'&&<CampoCRM nome="Motivo da perda"><textarea className="inp" required minLength={5} maxLength={2000} rows={3} value={f.motivo_perda} onChange={e=>campo('motivo_perda',e.target.value)} placeholder="Resuma por que o negócio foi perdido."/></CampoCRM>}
 {registro&&f.status!=='Em negociação'&&<p>Ao salvar, o FollowUp pendente será encerrado e o histórico será mantido.</p>}
 <div className="crm-acoes"><button className="btn btn-primario" disabled={ocupado}>{ocupado?'Salvando…':registro?'Salvar negócio':'Cadastrar cliente institucional'}</button><button type="button" className="btn" disabled={ocupado} onClick={fechar}>Cancelar</button></div>
 </fieldset></form>
 {registro&&<FollowUpCRM card={registro} usuarios={usuarios} atualizar={atualizar} tabela="integracao_crm_institucionais_followups" rpc="integracao_crm_institucional_followup" encerrado={registro.status!=='Em negociação'}/>}
 </dialog>;
}
export default function InstitucionaisCRM({usuario,usuarios}){
 const [busca,setBusca]=useState(''),[status,setStatus]=useState(''),[responsavel,setResponsavel]=useState(''),[ficha,setFicha]=useState(null),[aviso,setAviso]=useState('');
 const m=useModulo(async()=>{const [cards,followups]=await Promise.all([listarCRM('integracao_crm_institucionais'),listarCRM('integracao_crm_institucionais_followups','&status=eq.pendente')]);return {cards,followups};},[usuario.id],['crm']);
 const nome=id=>usuarios.find(u=>(u.erpRef||u.id)===id)?.nome||'Responsável registrado';
 const filtrados=(m.dados?.cards||[]).filter(c=>(!status||c.status===status)&&(!responsavel||c.responsavel_id===responsavel)&&normalizarCRM([c.nome,c.contato,c.produto].join(' ')).includes(normalizarCRM(busca))).sort((a,b)=>b.atualizado_em.localeCompare(a.atualizado_em));
 return <section className="crm-institucionais"><div className="cabeca"><div><h2><Building2 size={22}/> Clientes institucionais</h2><p>Vendas para prefeituras e órgãos públicos.</p></div><button className="btn btn-primario" onClick={()=>{setAviso('');setFicha({novo:true});}}><Plus size={17}/>Cadastrar institucional</button></div>
 <div className="crm-acoes"><input className="inp" aria-label="Buscar cliente institucional" placeholder="Cliente, contato ou produto" value={busca} onChange={e=>setBusca(e.target.value)}/><select className="inp" aria-label="Filtrar status institucional" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option>{ESTADOS.map(s=><option key={s}>{s}</option>)}</select>{acessoCRM(usuario).admin&&<select className="inp" aria-label="Filtrar responsável institucional" value={responsavel} onChange={e=>setResponsavel(e.target.value)}><option value="">Todos os responsáveis</option>{usuarios.filter(u=>acessoCRM(u).comercial||(m.dados?.cards||[]).some(c=>c.responsavel_id===u.erpRef)).map(u=><option key={u.id} value={u.erpRef||u.id}>{u.nome}</option>)}</select>}</div>
 <EstadoModulo modulo={m}/>{aviso&&<p role="status">{aviso}</p>}{m.dados&&<><p className="ajuda">{filtrados.length} negócio(s) · Valor em negociação: {moeda(filtrados.filter(c=>c.status==='Em negociação').reduce((s,c)=>s+Number(c.valor),0))}</p><div className="crm-grade">{filtrados.map(c=><article key={c.id} className="crm-card crm-institucional-card"><span className="crm-ficha-legenda">Institucional · {c.status}</span><h3>{c.nome}</h3><dl><dt>Contato</dt><dd>{c.contato}</dd><dt>Produto ou serviço</dt><dd>{c.produto}</dd><dt>Valor</dt><dd>{moeda(c.valor)}</dd><dt>Responsável</dt><dd>{nome(c.responsavel_id)}</dd></dl>{c.status==='Perdido'&&<p className="crm-institucional-motivo"><strong>Motivo da perda:</strong> {c.motivo_perda}</p>}{c.status==='Em negociação'&&<ResumoFollowUp pendente={m.dados.followups.find(f=>f.card_id===c.id)} abrir={()=>setFicha(c)}/>}<button className="btn" onClick={()=>{setAviso('');setFicha(c);}}>Abrir negócio</button></article>)}</div>{!filtrados.length&&<p>Nenhum cliente institucional encontrado.</p>}</>}
 {ficha&&<Ficha key={ficha.id||'novo'} registro={ficha.novo?null:ficha} usuario={usuario} usuarios={usuarios} ocupado={m.ocupado} erro={m.erro} atualizar={m.atualizar} fechar={()=>setFicha(null)} salvar={async f=>{if(await m.executar(()=>rpcCRM('integracao_crm_salvar_institucional',{p_id:f.id,p_versao:f.versao,p_nome:f.nome.trim(),p_contato:f.contato.trim(),p_produto:f.produto.trim(),p_valor:Number(f.valor),p_responsavel:f.responsavel_id,p_status:f.status,p_motivo:f.motivo_perda.trim(),p_dias:f.versao?null:Number(f.dias)}))){setFicha(null);setAviso('Negócio institucional salvo.');}}}/>}
 </section>;
}

import {RemessaLead,converterLead} from './LeadCRM.jsx';
import {useState} from 'react';
import {ETAPAS_CRM} from './crm-regras.js';
import {CampoCRM} from './modulo-ui.jsx';
import {formularioNegociacao,prepararNegociacao,resumoNegociacao,lerValorReais} from './crm-negociacao.js';
export default function NegociacaoCRM({card,ocupado,onSalvar,onConverter}){
 const [base,setBase]=useState(card),[form,setForm]=useState(()=>formularioNegociacao(card)),[status,setStatus]=useState(card.status),[erro,setErro]=useState('');
 const [municipio,setMunicipio]=useState(card.lead_municipio_id||card.municipio_id||''),[remessa,setRemessa]=useState('');
 const converter=!card.cliente_id&&['Contrato','Cliente ativo'].includes(status);
 const mudou=JSON.stringify(form)!==JSON.stringify(formularioNegociacao(base))||status!==base.status;
 // Atualiza dados remotos apenas quando não há edição local em andamento.
 if(!mudou&&JSON.stringify(card)!==JSON.stringify(base)){setBase(card);setForm(formularioNegociacao(card));setStatus(card.status);}
 const editar=(k,v)=>{setForm(f=>({...f,[k]:v}));setErro('');};
 let resumo='';try{resumo=resumoNegociacao(prepararNegociacao(form));}catch{}
 const salvar=async e=>{e.preventDefault();try{const dados={status,...prepararNegociacao(form)};if(await (converter?onConverter(()=>converterLead(card,dados,base,municipio,remessa)):onSalvar(dados,base))){setBase({...base,...dados});setForm(formularioNegociacao(dados));}}catch(e){setErro(e.message);}};
 return <form data-edicao-pendente={mudou} className="crm-negociacao" aria-label={`Negociação de ${card.nome||card.lead_nome||'Contato'}`} onSubmit={salvar}>
  <CampoCRM nome="Status"><select className="inp" aria-label="Status" value={status} disabled={ocupado} onChange={e=>setStatus(e.target.value)}>{[...ETAPAS_CRM,'Perdido'].map(s=><option key={s}>{s}</option>)}</select></CampoCRM>
  {converter&&<RemessaLead card={card} municipio={municipio} setMunicipio={setMunicipio} remessa={remessa} setRemessa={setRemessa}/>}
  <CampoCRM nome="Valor total (R$)"><input className="inp" inputMode="decimal" placeholder="R$ 0,00" value={form.valor} disabled={ocupado} onChange={e=>editar('valor',e.target.value)} onBlur={()=>{try{editar('valor',lerValorReais(form.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));}catch{}}}/></CampoCRM>
  <CampoCRM nome="Forma de negociação"><select className="inp" value={form.forma} disabled={ocupado} onChange={e=>setForm(f=>({...f,forma:e.target.value,parcelas:'',desconto:'',entrada:''}))}><option value="">Selecione</option><option value="parcelado">Parcelado</option><option value="avista">À vista</option><option value="entrada_parcelas">Entrada mais parcelas</option></select></CampoCRM>
  {form.forma==='avista'&&<CampoCRM nome="Desconto à vista (%)"><input className="inp" inputMode="decimal" value={form.desconto} disabled={ocupado} onChange={e=>editar('desconto',e.target.value)}/></CampoCRM>}
  {form.forma==='entrada_parcelas'&&<CampoCRM nome="Entrada (%)"><input className="inp" inputMode="decimal" value={form.entrada} disabled={ocupado} onChange={e=>editar('entrada',e.target.value)}/></CampoCRM>}
  {['parcelado','entrada_parcelas'].includes(form.forma)&&<CampoCRM nome={form.forma==='entrada_parcelas'?'Parcelas do saldo restante':'Quantidade de parcelas'}><input className="inp" type="number" min="1" max="999" step="1" value={form.parcelas} disabled={ocupado} onChange={e=>editar('parcelas',e.target.value)}/></CampoCRM>}
  {resumo&&<p className="crm-negociacao-resumo" aria-label="Resumo da negociação">{resumo}</p>}
  {erro&&<p className="msg-erro" role="alert">{erro}</p>}
  <button className="btn btn-primario" disabled={ocupado||!mudou||(converter&&(!municipio||!remessa))}>Salvar negociação e status</button>
  {mudou&&<small role="status">Alterações ainda não salvas.</small>}
 </form>;
}

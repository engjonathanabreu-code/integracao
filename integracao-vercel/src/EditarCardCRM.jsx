import {useState} from 'react';
import {CampoCRM,useModulo,EstadoModulo} from './modulo-ui.jsx';
import {CampoBusca} from './BuscaClientes.jsx';
import {listarCRM} from './crm-api.js';
import {normalizarCRM} from './crm-regras.js';
import {valoresCard,prepararEdicaoCard,exigeDocumentoCRM} from './crm-edicao.js';

const valorNucleo=n=>n.externo?.kanbanId||n.id;
const nomeNucleo=n=>[n.codigo,n.nome!==n.codigo?n.nome:''].filter(Boolean).join(' · ');

// Edição rápida dos dados do card. Antes da etapa Contrato somente o nome é exigido.
export default function EditarCardCRM({card,nucleos=[],ocupado,erro,salvar,cancelar}){
 const cliente=!!card.cliente_id;
 const m=useModulo(()=>listarCRM('fin_receb_municipios','&order=nome.asc'),[],['clientes']);
 const [form,setForm]=useState(()=>valoresCard(card)),[buscaMunicipio,setBuscaMunicipio]=useState(''),[erroLocal,setErroLocal]=useState('');
 const editar=(k,v)=>{setForm(f=>({...f,[k]:v,...(k==='municipio_id'?{nucleo_id:''}:{})}));setErroLocal('');};
 const doMunicipio=nucleos.filter(n=>n.ativo!==false&&n.municipioId===form.municipio_id).sort((a,b)=>nomeNucleo(a).localeCompare(nomeNucleo(b),'pt-BR'));
 const atualNucleo=form.nucleo_id&&!doMunicipio.some(n=>valorNucleo(n)===form.nucleo_id)?nucleos.find(n=>n.id===form.nucleo_id||valorNucleo(n)===form.nucleo_id):null;
 const cpfObrigatorio=exigeDocumentoCRM(card.status);
 const enviar=e=>{e.preventDefault();try{
  const escolhido=nucleos.find(n=>valorNucleo(n)===form.nucleo_id||n.id===form.nucleo_id);
  if(cliente&&escolhido?.remessaId&&card.remessa_id&&escolhido.remessaId!==card.remessa_id&&form.nucleo_id!==valoresCard(card).nucleo_id)throw new Error(`O núcleo ${nomeNucleo(escolhido)} pertence a outra remessa. Escolha outro núcleo ou altere a remessa em Abrir cadastro.`);
  salvar(prepararEdicaoCard(form,card));
 }catch(x){setErroLocal(x.message);}};
 return <form className="crm-form" aria-label={`Editar ${card.nome||card.lead_nome||'contato'}`} onSubmit={enviar}>
  <h2>Editar dados</h2>
  <p className="ajuda">{cpfObrigatorio?'A partir da etapa Contrato o CPF é obrigatório. Os demais documentos continuam em Abrir cadastro.':'Até a etapa Contrato apenas o nome é obrigatório. Complete os demais dados quando o cliente informar.'}</p>
  {(erroLocal||erro)&&<p role="alert" className="crm-erro">{erroLocal||erro}</p>}
  <CampoCRM nome="Nome"><input className="inp" autoFocus disabled={ocupado} required minLength={2} maxLength={200} value={form.nome} onChange={e=>editar('nome',e.target.value)}/></CampoCRM>
  <CampoCRM nome="Telefone"><input className="inp" type="tel" disabled={ocupado} pattern="[+()0-9 .-]{10,25}" placeholder="(48) 99999-9999" value={form.telefone} onChange={e=>editar('telefone',e.target.value)}/></CampoCRM>
  <CampoCRM nome={cpfObrigatorio?'CPF (obrigatório)':'CPF (opcional)'}><input className="inp" inputMode="numeric" disabled={ocupado} required={cpfObrigatorio} placeholder="000.000.000-00" value={form.cpf} onChange={e=>editar('cpf',e.target.value)}/></CampoCRM>
  <EstadoModulo modulo={m}/>
  {!cliente&&<CampoBusca aria-label="Filtrar municípios" placeholder="Buscar município ou UF" disabled={ocupado} value={buscaMunicipio} onChange={e=>setBuscaMunicipio(e.target.value)}/>}
  <CampoCRM nome="Cidade"><select className="inp" required={!cliente} disabled={ocupado||cliente} value={form.municipio_id} onChange={e=>editar('municipio_id',e.target.value)}><option value="">Selecione o município</option>{m.dados?.filter(x=>x.id===form.municipio_id||normalizarCRM(`${x.nome} ${x.uf}`).includes(normalizarCRM(buscaMunicipio))).map(x=><option key={x.id} value={x.id}>{x.nome} / {x.uf}</option>)}</select></CampoCRM>
  {cliente&&<p className="ajuda">O município de um cliente já cadastrado acompanha a remessa. Para trocá-lo, use Abrir cadastro.</p>}
  <CampoCRM nome="Núcleo"><select className="inp" disabled={ocupado||!form.municipio_id} value={form.nucleo_id} onChange={e=>editar('nucleo_id',e.target.value)}><option value="">Sem núcleo definido</option>{form.nucleo_id&&!doMunicipio.some(n=>valorNucleo(n)===form.nucleo_id)&&<option value={form.nucleo_id}>{atualNucleo?nomeNucleo(atualNucleo):'Núcleo vinculado'}</option>}{doMunicipio.map(n=><option key={n.id} value={valorNucleo(n)}>{nomeNucleo(n)}</option>)}</select></CampoCRM>
  {form.municipio_id&&!doMunicipio.length&&<p className="ajuda">Nenhum núcleo cadastrado para este município.</p>}
  <div className="crm-acoes"><button className="btn btn-primario" disabled={ocupado}>Salvar alterações</button><button type="button" className="btn" disabled={ocupado} onClick={cancelar}>Cancelar</button></div>
 </form>;
}

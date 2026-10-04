import {useState,useRef,useEffect,useId,Fragment} from 'react';
import {Pencil,Trash2,ArrowRight,Check,TriangleAlert,Clock,CalendarPlus,CalendarClock} from 'lucide-react';
import {rotuloPasso,totaisColuna,proximaEtapa,ETAPAS_ABERTAS} from './crm-hoje.js';
import {reais} from './crm-negociacao.js';
import './crm-hoje-funil.css';
// Funil de 3 colunas do CRM. Só apresenta o que recebe por props: nunca lê nem grava; mover etapa é um callback que a página executa.
const PAGINA=20;
const ICONES={atrasado:TriangleAlert,hoje:Clock,sem:CalendarPlus,futuro:CalendarClock};
const VAZIO={estado:'oculto',itens:[]};
function Etiqueta({passo}){
 const {texto,tom}=rotuloPasso(passo),Icone=ICONES[tom]||CalendarClock;
 return <span className="crm-hf-etiqueta" data-tom={tom}><Icone size={14} aria-hidden="true"/>{texto}</span>;
}
function Pendencias({lista}){
 const l=lista||[],resto=l.slice(2);
 if(!l.length)return null;
 return <span className="crm-hf-pends">{l.slice(0,2).map(p=><span key={p} className="crm-hf-pend">{p}</span>)}{resto.length>0&&<span className="crm-hf-pend" title={resto.join(' · ')}>+{resto.length}<span className="crm-hf-sr"> ({resto.join(', ')})</span></span>}</span>;
}
// Bloco recolhível: o conteúdo só existe no DOM enquanto aberto (milhares de cadastros não pesam nem repetem nomes acessíveis).
function Recolhivel({titulo,children}){
 const [aberto,setAberto]=useState(false);
 return <details className="crm-hf-detalhes" onToggle={e=>setAberto(e.currentTarget.open)}><summary>{titulo}</summary>{aberto&&children}</details>;
}
function ItemLista({item,onAbrirCadastro,onAbrirFicha}){
 const cadastro=item.tipo==='cadastro',acao=cadastro?onAbrirCadastro:onAbrirFicha,original=String(item.etapaOriginal??'').trim();
 const apoio=[cadastro&&item.codigo?`Código ${item.codigo}`:'',item.municipio,item.valor!=null?reais(item.valor):''].filter(Boolean).join(' · ');
 return <li className="crm-hf-ativo">
  <div className="crm-hf-ativo-info">
   <strong className="crm-hf-nome">{item.nome}</strong>
   {item.etapaReconhecida!==false&&<span className="crm-hf-etiqueta" data-tom="neutro">{item.etapa}</span>}
   {apoio&&<span className="crm-hf-apoio">{apoio}</span>}
   {cadastro&&!item.etapaReconhecida&&original&&<span className="crm-hf-apoio">Status do cadastro: "{original}"</span>}
   <Pendencias lista={item.pendencias}/>
  </div>
  {acao&&<button type="button" className="btn crm-hf-btn" aria-label={cadastro?`Abrir cadastro de ${item.nome}`:`Abrir ficha de ${item.nome}`} onClick={()=>acao(item)}>{cadastro?'Abrir cadastro':'Abrir ficha'}</button>}
 </li>;
}
// Lista só de leitura de cadastros (e de cartões já ativos). Também é usada pela aba Perdidos.
export function ListaCadastrosCRM({titulo,itens=[],onAbrirCadastro,onAbrirFicha}){
 const [limite,setLimite]=useState(PAGINA),mostradas=itens.slice(0,limite),resto=itens.length-mostradas.length;
 return <div className="crm-hf crm-hf-lista">
  {titulo&&<h3 className="crm-hf-lista-titulo">{`${titulo} (${itens.length})`}</h3>}
  {itens.some(i=>i.tipo==='cadastro')&&<p className="ajuda">Cadastro existente no Integração, ainda sem cartão no CRM. A etapa vem do status do cadastro.</p>}
  <ul className="crm-hf-ativos">{mostradas.map(i=><ItemLista key={i.chave} item={i} onAbrirCadastro={onAbrirCadastro} onAbrirFicha={onAbrirFicha}/>)}</ul>
  {resto>0&&<button type="button" className="btn crm-hf-btn crm-hf-mais" onClick={()=>setLimite(l=>l+PAGINA)}>Mostrar mais {Math.min(PAGINA,resto)}</button>}
 </div>;
}
function ConfirmarAtivacao({texto,ocupado,onConfirmar,onCancelar}){
 const botao=useRef(null),idTexto=useId();
 useEffect(()=>{botao.current?.focus();},[]);
 return <div className="crm-hf-confirmar" role="group" aria-label="Confirmar ativação" aria-describedby={idTexto} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancelar?.();}}}>
  <span id={idTexto}>{texto}</span>
  <span className="crm-hf-confirmar-acoes"><button ref={botao} type="button" className="btn btn-primario crm-hf-btn" disabled={ocupado} onClick={()=>onConfirmar?.()}>Confirmar ativação</button><button type="button" className="btn crm-hf-btn" disabled={ocupado} onClick={()=>onCancelar?.()}>Cancelar</button></span>
 </div>;
}
function CartaoEnxuto({item,ocupado,arrastando,confirmacao,onAbrirFicha,onEditar,onExcluirLead,onMover,onConfirmar,onCancelarConfirmacao,onIniciar,onEncerrar}){
 const {passo,nome}=item,sem=passo.tipo==='sem',proxima=item.movel?proximaEtapa(item.etapa):null,emConfirmacao=confirmacao?.chave===item.chave;
 const textoPasso=sem?'Agendar FollowUp':'Registrar FollowUp feito',avancar=useRef(null),confirmava=useRef(false);
 // Ao fechar a confirmação (Cancelar ou Esc), o foco volta ao botão que a abriu.
 useEffect(()=>{if(confirmava.current&&!emConfirmacao)avancar.current?.focus();confirmava.current=emConfirmacao;},[emConfirmacao]);
 return <article className="crm-card crm-cliente-card crm-hf-cartao" data-etapa={item.etapa} data-arrastando={arrastando?'true':undefined} draggable={item.movel&&!ocupado} onDragStart={e=>onIniciar(e,item)} onDragEnd={onEncerrar}>
  <div className="crm-hf-topo">
   <button type="button" className="crm-cliente-abrir crm-hf-abrir" aria-label={`Abrir ficha de ${nome}`} onClick={()=>onAbrirFicha?.(item)}>
    {item.municipio&&<span className="crm-hf-mun">{item.municipio}</span>}<h3 className="crm-hf-nome">{nome}</h3>
   </button>
   <span className="crm-hf-icones">
    <button type="button" className="crm-card-editar crm-hf-icone" title="Editar nome, telefone, CPF, cidade e núcleo" aria-label={`Editar ${nome}`} disabled={ocupado} onClick={()=>onEditar?.(item)}><Pencil size={16} aria-hidden="true"/></button>
    {item.lead&&<button type="button" className="crm-lead-lixeira crm-hf-icone" title="Excluir lead e guardar no arquivo" aria-label={`Excluir e arquivar ${nome}`} disabled={ocupado} onClick={()=>onExcluirLead?.(item)}><Trash2 size={16} aria-hidden="true"/></button>}
   </span>
  </div>
  {item.valor!=null&&<span className="crm-hf-valor">{reais(item.valor)}</span>}
  <div className="crm-hf-passo" data-tom={rotuloPasso(passo).tom}><Etiqueta passo={passo}/></div>
  <Pendencias lista={item.pendencias}/>
  {emConfirmacao?<ConfirmarAtivacao texto={confirmacao.texto} ocupado={ocupado} onConfirmar={onConfirmar} onCancelar={onCancelarConfirmacao}/>
   :<div className="crm-hf-rodape">
    <button type="button" className={`btn crm-hf-btn crm-hf-btn-passo${sem?' crm-hf-btn-agendar':''}`} aria-label={`${textoPasso} · ${nome}`} disabled={ocupado} onClick={()=>onAbrirFicha?.(item,'followup')}>{sem?<CalendarPlus size={15} aria-hidden="true"/>:<Check size={15} aria-hidden="true"/>}{textoPasso}</button>
    {proxima&&<button ref={avancar} type="button" className="btn crm-hf-btn crm-hf-avancar" aria-label={`Avançar ${nome} para ${proxima}`} disabled={ocupado} onClick={()=>onMover?.(item,proxima)}>Avançar<ArrowRight size={15} aria-hidden="true"/></button>}
   </div>}
 </article>;
}
export default function FunilCRM({itens=[],followups=null,semCartao,ativos=[],inativos=[],visao='reduzido',ocupado=false,confirmacao=null,renderCompleto,onAbrirFicha,onEditar,onExcluirLead,onMover,onConfirmar,onCancelarConfirmacao,onAbrirCadastro,onAtualizarCadastros}){
 const base=useId(),sc=semCartao||VAZIO,modo=visao==='semi'||visao==='detalhada'?visao:'reduzido',reduzido=modo==='reduzido';
 const arrastoRef=useRef(null),temporizador=useRef(0),[arrasto,setArrasto]=useState(null),[alvo,setAlvo]=useState(null);
 useEffect(()=>()=>clearTimeout(temporizador.current),[]);
 // Arrastar e soltar (só no cartão enxuto). Nada é gravado aqui e o cartão só muda de coluna quando os dados recarregam.
 const iniciar=(e,item)=>{
  if(e.target!==e.currentTarget)return; // arrastar texto selecionado dentro do cartão não é mover o cartão
  if(ocupado||!item.movel){e.preventDefault();return;}
  try{e.dataTransfer.setData('text/plain',item.chave);e.dataTransfer.effectAllowed='move';}catch{/* o navegador pode recusar; o arraste continua */}
  arrastoRef.current=item;
  temporizador.current=setTimeout(()=>setArrasto(item.chave),0);
 };
 const encerrar=()=>{clearTimeout(temporizador.current);arrastoRef.current=null;setArrasto(null);setAlvo(null);};
 const sobre=(e,etapa)=>{const a=arrastoRef.current;if(!a||a.etapa===etapa)return;e.preventDefault();e.dataTransfer.dropEffect='move';setAlvo(etapa);};
 const sair=(e,etapa)=>{if(!e.currentTarget.contains(e.relatedTarget))setAlvo(a=>a===etapa?null:a);};
 const soltar=(e,etapa)=>{const a=arrastoRef.current;if(!a||a.etapa===etapa)return;e.preventDefault();encerrar();onMover?.(a,etapa);};
 const cartoes=lista=>lista.map(i=>reduzido
  ?<CartaoEnxuto key={i.chave} item={i} ocupado={ocupado} arrastando={arrasto===i.chave} confirmacao={confirmacao} onAbrirFicha={onAbrirFicha} onEditar={onEditar} onExcluirLead={onExcluirLead} onMover={onMover} onConfirmar={onConfirmar} onCancelarConfirmacao={onCancelarConfirmacao} onIniciar={iniciar} onEncerrar={encerrar}/>
  :<Fragment key={i.chave}>{renderCompleto?.(i)}</Fragment>);
 return <div className="crm-hf crm-hf-funil">
  {reduzido&&<p className="ajuda crm-hf-dica">Arraste o cartão para outra etapa ou use Avançar. Em Semi e Detalhada, mude a etapa pelo formulário de Status.</p>}
  <div className={`crm-hf crm-hf-quadro crm-visao-${reduzido?'compacta':modo}`} style={{'--crm-colunas':followups?4:3}}>
   {ETAPAS_ABERTAS.map((etapa,n)=>{
    const lista=itens.filter(i=>i.etapa===etapa),t=totaisColuna(lista);
    const cadastros=sc.estado==='ok'?sc.itens.filter(i=>i.etapa===etapa):[];
    const total=[t.valor>0?`Valor: ${reais(t.valor)}`:'',t.semValor>0?(t.valor>0?`(${t.semValor} sem valor)`:`${t.semValor} sem valor`):''].filter(Boolean).join(' ');
    return <section key={etapa} className="crm-hf-coluna" data-etapa={etapa} data-alvo={alvo===etapa?'true':undefined} aria-labelledby={`${base}-${n}`} onDragOver={e=>sobre(e,etapa)} onDragLeave={e=>sair(e,etapa)} onDrop={e=>soltar(e,etapa)}>
     <h2 id={`${base}-${n}`} className="crm-hf-titulo">{`${etapa} · ${lista.length}`}</h2>
     {total&&<p className="ajuda crm-hf-total">{total}</p>}
     <div className="crm-hf-cartoes">{cartoes(lista)}</div>
     {!lista.length&&<p className="crm-hf-vazio">Nenhum cliente nesta etapa.</p>}
     {cadastros.length>0&&<Recolhivel titulo={`Cadastros sem cartão (${cadastros.length})`}><ListaCadastrosCRM itens={cadastros} onAbrirCadastro={onAbrirCadastro} onAbrirFicha={onAbrirFicha}/></Recolhivel>}
    </section>;
   })}
   {followups&&<section className="crm-hf-coluna crm-followup-coluna" aria-label="Follow Up prioritário">
    <h2 className="crm-hf-titulo">{`Follow Up · ${followups.length}`}</h2>
    <p className="ajuda">Vencidos ou com vencimento nas próximas 24 horas. Apenas sua carteira.</p>
    <div className="crm-hf-cartoes">{cartoes(followups)}</div>
    {!followups.length&&<p className="ajuda">Nenhum follow-up nesse período.</p>}
   </section>}
  </div>
  {sc.estado==='erro'&&<div className="crm-hf-aviso"><p className="ajuda">Não foi possível consultar os cadastros sem cartão agora.</p>{onAtualizarCadastros&&<button type="button" className="btn crm-hf-btn" onClick={()=>onAtualizarCadastros()}>Tentar novamente a lista de cadastros</button>}</div>}
  {ativos.length>0&&<Recolhivel titulo={`Clientes ativos (${ativos.length})`}><ListaCadastrosCRM itens={ativos} onAbrirCadastro={onAbrirCadastro} onAbrirFicha={onAbrirFicha}/></Recolhivel>}
  {inativos.length>0&&<Recolhivel titulo={`Cadastros inativos ou cancelados (${inativos.length})`}><ListaCadastrosCRM itens={inativos} onAbrirCadastro={onAbrirCadastro} onAbrirFicha={onAbrirFicha}/></Recolhivel>}
 </div>;
}

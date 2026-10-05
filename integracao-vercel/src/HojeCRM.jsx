import {useState,useEffect,useMemo} from 'react';
import {TriangleAlert,Clock,CalendarPlus,CalendarClock,Copy,Check,ListTodo} from 'lucide-react';
import {filaDoDia,resumoDoDia,rotuloPasso} from './crm-hoje.js';
import {reais} from './crm-negociacao.js';
import {dataFollowup} from './crm-followup.js';
import './crm-hoje-funil.css';
// Aba Hoje do CRM: fila por urgência. Só apresenta o que recebe por props: não lê nem grava nada; as ações abrem a ficha ou avisam.
const PAGINA=20,MINUTO=60000;
const FILTROS=[['todos','Todos'],['atrasados','Atrasados'],['hoje','Para hoje'],['sem','Sem próximo passo']];
const GRUPOS=[['atrasados','Atrasados'],['hoje','Para hoje'],['sem','Sem próximo passo']];
const ICONES={atrasado:TriangleAlert,hoje:Clock,sem:CalendarPlus,futuro:CalendarClock};
const LIMITES={atrasados:PAGINA,hoje:PAGINA,sem:PAGINA};
const dataLonga=ms=>{const t=new Date(ms).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'numeric',month:'long'});return t.charAt(0).toUpperCase()+t.slice(1);};
const prazoBR=p=>/^\d{4}-\d{2}-\d{2}$/.test(p||'')?p.split('-').reverse().join('/'):'';
// A área de transferência exige contexto seguro e permissão; sem isso tenta o método antigo antes de desistir.
async function copiarTexto(texto){
 try{await navigator.clipboard.writeText(texto);return true;}catch{/* tenta o método antigo */}
 try{
  const campo=document.createElement('textarea');
  campo.value=texto;campo.setAttribute('readonly','');campo.style.cssText='position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(campo);campo.select();
  const ok=document.execCommand('copy');
  document.body.removeChild(campo);
  return ok;
 }catch{return false;}
}
function Etiqueta({passo}){
 const {texto,tom}=rotuloPasso(passo),Icone=ICONES[tom]||CalendarClock;
 return <span className="crm-hf-etiqueta" data-tom={tom}><Icone size={14} aria-hidden="true"/>{texto}</span>;
}
function Pendencias({lista,ignorar}){
 const l=(lista||[]).filter(p=>p!==ignorar);
 if(!l.length)return null;
 const resto=l.slice(2);
 return <span className="crm-hf-pends">{l.slice(0,2).map(p=><span key={p} className="crm-hf-pend">{p}</span>)}{resto.length>0&&<span className="crm-hf-pend" title={resto.join(' · ')}>+{resto.length}<span className="crm-hf-sr"> ({resto.join(', ')})</span></span>}</span>;
}
function Linha({item,ocupado,onAbrirFicha,onAviso}){
 const {passo,nome,telefone}=item,sem=passo.tipo==='sem';
 const apoio=[item.municipio,item.etapa,item.valor!=null?reais(item.valor):''].filter(Boolean).join(' · ');
 const textoBotao=sem?'Agendar FollowUp':'Registrar FollowUp feito',prazo=prazoBR(item.tarefa?.prazo);
 const copiar=async()=>{onAviso?.(await copiarTexto(telefone)?'Telefone copiado.':`Não foi possível copiar. Telefone: ${telefone}`);};
 return <article className="crm-hf-linha" data-tom={rotuloPasso(passo).tom}>
  <button type="button" className="crm-hf-abrir" aria-label={`Abrir ficha de ${nome}`} onClick={()=>onAbrirFicha?.(item)}>
   <h4 className="crm-hf-nome">{nome}</h4><Etiqueta passo={passo}/>{apoio&&<span className="crm-hf-apoio">{apoio}</span>}
  </button>
  <div className="crm-hf-motivo">
   <span>{sem?'Escolha quando falar com este cliente':`Previsto para ${dataFollowup(passo.previsto_em)}`}</span>
   {item.tarefa&&<span className="crm-hf-apoio">Tarefa: {item.tarefa.titulo}{prazo&&` · prazo ${prazo}`}</span>}
   <Pendencias lista={item.pendencias} ignorar="Sem telefone"/>
  </div>
  <div className="crm-hf-acoes">
   {telefone?<span className="crm-hf-telefone"><button type="button" className="btn crm-hf-btn" aria-label={`Copiar telefone de ${nome}`} onClick={copiar}><Copy size={15} aria-hidden="true"/>Copiar telefone</button><span className="crm-hf-tel">{telefone}</span></span>:<span className="crm-hf-apoio">Sem telefone</span>}
   <button type="button" className="btn btn-primario crm-hf-btn" aria-label={`${textoBotao} · ${nome}`} disabled={ocupado} onClick={()=>onAbrirFicha?.(item,'followup')}>{sem?<CalendarPlus size={15} aria-hidden="true"/>:<Check size={15} aria-hidden="true"/>}{textoBotao}</button>
  </div>
 </article>;
}
export default function HojeCRM({itens=[],tarefasResumo,agora,ocupado=false,onAbrirFicha,onIrParaTarefas,onAviso}){
 const [filtro,setFiltro]=useState('todos'),[limites,setLimites]=useState(LIMITES),[relogio,setRelogio]=useState(()=>Date.now());
 // Sem 'agora' por props, a fila acompanha o relógio (o dia vira e os prazos vencem com a aba aberta).
 useEffect(()=>{if(agora!=null)return undefined;const t=setInterval(()=>setRelogio(Date.now()),MINUTO);return()=>clearInterval(t);},[agora]);
 const ms=agora??relogio;
 const fila=useMemo(()=>filaDoDia(itens,ms),[itens,ms]),resumo=useMemo(()=>resumoDoDia(itens,ms),[itens,ms]);
 const tarefas=(tarefasResumo?.atrasadas||0)+(tarefasResumo?.hoje||0),pendentes=resumo.pendentes;
 const contagens={todos:pendentes+resumo.sem,atrasados:resumo.atrasados,hoje:resumo.hoje,sem:resumo.sem};
 const visiveis=GRUPOS.filter(([id])=>contagens[id]>0&&(filtro==='todos'||filtro===id));
 const escolher=id=>{setFiltro(id);setLimites(LIMITES);};
 return <section className="crm-hf crm-hoje" aria-labelledby="crm-hoje-titulo">
  <header className="crm-hf-cabeca">
   <h2 id="crm-hoje-titulo">{pendentes?`Você tem ${pendentes} ${pendentes===1?'contato':'contatos'} para resolver`:'Dia em dia'}</h2>
   <p className="ajuda">{dataLonga(ms)} · {resumo.andamento} {resumo.andamento===1?'cliente em andamento':'clientes em andamento'}</p>
  </header>
  <dl className="crm-hf-resumo">
   <div data-tom={resumo.atrasados?'atrasado':undefined}><dt>Atrasados</dt><dd>{resumo.atrasados}</dd></div>
   <div data-tom={resumo.hoje?'hoje':undefined}><dt>Para hoje</dt><dd>{resumo.hoje}</dd></div>
   <div><dt>Sem próximo passo</dt><dd>{resumo.sem}</dd></div>
   <div><dt>Valor em aberto</dt><dd>{resumo.valorAberto>0?reais(resumo.valorAberto):'—'}{resumo.semValor>0&&<small> ({resumo.semValor} sem valor)</small>}</dd></div>
   <div data-tom={tarefas?'hoje':undefined}><dt>Tarefas vencidas ou para hoje</dt><dd>{tarefas}{tarefas>0&&<small> ({tarefasResumo.atrasadas||0} vencidas, {tarefasResumo.hoje||0} para hoje)</small>}</dd>{tarefas>0&&<button type="button" className="btn crm-hf-btn" onClick={()=>onIrParaTarefas?.()}><ListTodo size={15} aria-hidden="true"/>Ver tarefas</button>}</div>
  </dl>
  {resumo.andamento>0&&<div className="crm-hf-chips" role="group" aria-label="Filtros rápidos">{FILTROS.map(([id,nome])=><button key={id} type="button" className="crm-hf-chip" aria-pressed={filtro===id} onClick={()=>escolher(id)}>{nome}<span className="crm-hf-chip-n">{contagens[id]}</span></button>)}</div>}
  {!itens.length&&<p className="crm-hf-vazio">Nenhum cliente em andamento.</p>}
  {itens.length>0&&!visiveis.length&&<p className="crm-hf-vazio">{filtro==='todos'?'Nenhum contato para resolver agora. Os clientes em andamento já têm próximo passo marcado.':'Nada encontrado com esses filtros. Limpe a busca ou escolha Todos.'}</p>}
  {visiveis.map(([id,titulo])=>{
   const lista=fila[id],mostradas=lista.slice(0,limites[id]),resto=lista.length-mostradas.length;
   return <section key={id} className="crm-hf-grupo" data-grupo={id} aria-labelledby={`crm-hoje-g-${id}`}>
    <h3 id={`crm-hoje-g-${id}`}>{titulo} · {lista.length}</h3>
    <div className="crm-hf-fila">{mostradas.map(i=><Linha key={i.chave} item={i} ocupado={ocupado} onAbrirFicha={onAbrirFicha} onAviso={onAviso}/>)}</div>
    {resto>0&&<button type="button" className="btn crm-hf-btn crm-hf-mais" aria-label={`Mostrar mais ${Math.min(PAGINA,resto)} em ${titulo}`} onClick={()=>setLimites(l=>({...l,[id]:l[id]+PAGINA}))}>Mostrar mais {Math.min(PAGINA,resto)}</button>}
   </section>;
  })}
 </section>;
}

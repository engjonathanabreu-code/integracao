import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,History} from 'lucide-react';
import {dataAdicaoAndamento,timestampAndamento} from './andamentos-municipios.js';
import {municipiosParaNavegacao} from './andamentos-navegacao.js';
const dataBR=value=>timestampAndamento(value)!==null?value.slice(0,10).split('-').reverse().join('/'):'Data indisponível';
function paiRolavel(elemento){
 for(let p=elemento.parentElement;p;p=p.parentElement)if(/auto|scroll/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight)return p;
 return document.scrollingElement;
}
export default function TabelaAndamentosMunicipios({itens,db,podeEditar,nomeNucleo,onEditar,nucleo='',busca=''}) {
 const grupos=useMemo(()=>municipiosParaNavegacao(itens,db,{nucleo,busca}),[itens,db.nucleos,db.municipios,nucleo,busca]);
 const [selecionado,setSelecionado]=useState(null),[limites,setLimites]=useState({});
 const titulo=useRef(null),botoes=useRef(new Map()),retorno=useRef(null),navegou=useRef(false),id=useId();
 const grupo=grupos.find(g=>g.id===selecionado?.id),visiveis=grupos.filter(g=>g.corresponde);
 useEffect(()=>{
  if(!navegou.current)return;
  const frame=requestAnimationFrame(()=>{
   if(selecionado)titulo.current?.focus({preventScroll:false});
   else{const salvo=retorno.current;(botoes.current.get(salvo?.id)||titulo.current)?.focus({preventScroll:true});if(salvo?.pai?.isConnected)salvo.pai.scrollTop=salvo.top;}
  });
  return()=>cancelAnimationFrame(frame);
 },[selecionado]);
 function abrir(g,event){
  const pai=paiRolavel(event.currentTarget);retorno.current={id:g.id,pai,top:pai?.scrollTop||0};
  navegou.current=true;setSelecionado({id:g.id,nome:g.nome});
 }
 if(!selecionado)return <section className="andamentos-municipios" aria-labelledby={id}>
  <div className="andamentos-historico-titulo"><div><h2 id={id} ref={titulo} tabIndex={-1}>Municípios</h2><p>Selecione um município para consultar seu histórico.</p></div><span role="status">{visiveis.length} de {grupos.length} município(s)</span></div>
  {visiveis.length?<div className="card andamentos-indice"><div className="andamentos-tabela-rolagem"><table className="tab andamentos-indice-tabela">
   <caption className="sr-only">Municípios disponíveis nas consultas atuais</caption>
   <thead><tr><th>Município</th><th>Núcleos</th><th>Registros</th><th>Última adição</th><th><span className="sr-only">Consultar histórico</span></th></tr></thead>
   <tbody>{visiveis.map(g=><tr key={g.id} data-municipio={g.id}>
    <td className="andamentos-indice-nome">{g.nome}</td><td data-label="Núcleos">{g.nucleos}</td>
    <td data-label="Registros">{g.itens.length}{g.itens.length!==g.total&&<small> de {g.total}</small>}</td>
    <td data-label="Última adição">{g.itens.length?dataAdicaoAndamento(g.itens[0]):'Sem histórico'}</td>
    <td><button type="button" className="btn" ref={el=>{if(el)botoes.current.set(g.id,el);else botoes.current.delete(g.id);}} aria-label={'Ver histórico de '+g.nome} onClick={e=>abrir(g,e)}>Ver histórico <ArrowRight size={16}/></button></td>
   </tr>)}</tbody>
  </table></div></div>:<div className="andamentos-vazio" role="status"><History size={30}/><h3>Nenhum município encontrado</h3><p>Revise a busca e o filtro de núcleo.</p></div>}
 </section>;
 const limite=limites[selecionado.id]||50,registros=grupo?.itens||[],pagina=registros.slice(0,limite);
 return <section className="andamentos-municipios" aria-labelledby={id}>
  <div className="andamentos-historico-titulo andamentos-detalhe-titulo">
   <button type="button" className="btn" onClick={()=>setSelecionado(null)}><ArrowLeft size={16}/>Voltar aos municípios</button>
   <div><h2 id={id} ref={titulo} tabIndex={-1}>{selecionado.nome}</h2><p>Histórico do município · mais recentes primeiro</p></div><span role="status">{registros.length} registro(s)</span>
  </div>
  {!registros.length?<div className="andamentos-vazio" role="status"><History size={30}/><h3>Nenhum andamento encontrado</h3><p>{busca||nucleo?'Revise a busca e o filtro de núcleo.':'Este município ainda não possui histórico registrado.'}</p></div>:
   <div className="card andamentos-municipio" aria-label={'Andamentos de '+selecionado.nome}>
    <div className="andamentos-tabela-rolagem"><table className="tab"><caption className="sr-only">Histórico de {selecionado.nome}</caption>
     <thead><tr><th>Adicionado</th><th>Andamento</th><th>Contexto</th>{podeEditar&&<th>Ações</th>}</tr></thead>
     <tbody>{pagina.map(a=><tr key={a.id} data-andamento={a.id}>
      <td className="andamentos-adicao"><time>{dataAdicaoAndamento(a)}</time><small>Data do andamento: {dataBR(a.data_atualizacao)}</small></td>
      <td><span className="andamentos-etapa">{a.status||'Etapa não informada'}</span><p className="andamentos-descricao">{a.descricao_cliente||'Sem descrição.'}</p>
       <div className="andamentos-metadados">{a.previsao&&<span>Previsão: {dataBR(a.previsao)}</span>}<span className={a.visivel_ia?'andamentos-ia-autorizada':''}>{a.visivel_ia?'Disponível para atendimento IA':'Não autorizado para IA'}</span></div>
       {podeEditar&&(a.observacao_interna||a.orientacao_ia)&&<details className="andamentos-interno"><summary>Notas internas e orientação da IA</summary>{a.observacao_interna&&<p><strong>Observação interna</strong>{a.observacao_interna}</p>}{a.orientacao_ia&&<p><strong>Orientação da IA</strong>{a.orientacao_ia}</p>}</details>}
      </td><td className="andamentos-contexto-registro">Núcleo: {nomeNucleo(a.processo_id)}</td>
      {podeEditar&&<td><button type="button" className="btn btn-sm" onClick={()=>onEditar(a)}>Editar andamento</button></td>}
     </tr>)}</tbody>
    </table></div>
    {registros.length>pagina.length&&<button type="button" className="btn" onClick={()=>setLimites(l=>({...l,[selecionado.id]:limite+50}))}>Mostrar mais de {selecionado.nome} ({pagina.length}/{registros.length})</button>}
   </div>}
 </section>;
}

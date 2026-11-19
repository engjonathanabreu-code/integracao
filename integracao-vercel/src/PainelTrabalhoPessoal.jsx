import React, {useEffect, useRef, useState} from 'react';
import './trabalho-pessoal.css';
import {atalhoTrabalhoPessoal, diaTrabalho, filaTrabalhoPessoal, resumoTrabalhoPessoal} from './trabalho-pessoal.js';
import {preparoEntregaPessoal} from './preparo-entrega-pessoal.js';

export default function PainelTrabalhoPessoal(props) {
  const {usuario} = props;
  if (!usuario?.id || usuario.ativo === false) return null;
  // A nova identidade recebe outra instância, antes de qualquer efeito.
  // Promessas de cópia antigas só podem atualizar a instância desmontada.
  return <TrabalhoPessoalDaIdentidade key={JSON.stringify([usuario.id, usuario.erpRef || null])} {...props}/>;
}

function TrabalhoPessoalDaIdentidade({metas,usuario,ir}) {
  const [hoje,setHoje] = useState(diaTrabalho);
  const [aberto,setAberto] = useState(false);
  const [copia,setCopia] = useState('');
  const [entregaId,setEntregaId] = useState(null);
  const [copiaEntrega,setCopiaEntrega] = useState('');
  const contextoEntrega = useRef(null);
  useEffect(() => {const id=setInterval(()=>setHoje(diaTrabalho()),30000);return()=>clearInterval(id)},[]);
  const fila=filaTrabalhoPessoal(metas,usuario,hoje), resumo=resumoTrabalhoPessoal(fila,hoje), atalho=atalhoTrabalhoPessoal(usuario);
  const entrega = entregaId === null ? null : preparoEntregaPessoal(metas,usuario,entregaId,hoje);
  // Invalidar confirmações de cópia em voo assim que seleção/dados mudam.
  if (contextoEntrega.current?.texto !== entrega || contextoEntrega.current?.id !== entregaId) contextoEntrega.current={id:entregaId,texto:entrega};
  useEffect(()=>setCopiaEntrega(''),[entrega,entregaId]);
  useEffect(()=>setCopia(''),[resumo]);
  if (!usuario?.id || usuario.ativo === false) return null;
  async function copiar() {
    setCopia('');
    try {await navigator.clipboard.writeText(resumo);setCopia('Resumo copiado. Revise antes de compartilhar.');}
    catch {setCopia('Não foi possível copiar automaticamente. Selecione o texto abaixo e copie.');}
  }
  async function copiarEntrega() {
    if (!entrega) return;
    const contexto = contextoEntrega.current;
    setCopiaEntrega('');
    try {await navigator.clipboard.writeText(entrega);if (contextoEntrega.current === contexto) setCopiaEntrega('Preparo copiado. Revise antes de compartilhar.');}
    catch {if (contextoEntrega.current === contexto) setCopiaEntrega('Não foi possível copiar automaticamente. Selecione o preparo abaixo e copie.');}
  }
  return <section className="card ap-trabalho" aria-label="Minha fila de trabalho">
    <h3>Minha fila de trabalho</h3>
    <p className="ajuda">{fila.length} metas abertas atribuídas a você nesta sessão. Priorização por prazo, sem IA externa e sem alterar registros.</p>
    <p className="ajuda">Confira a sincronização antes de agir. Datas no horário de Brasília. Aprovação não significa nova execução.</p>
    <div className="ap-trabalho-lista">{fila.slice(0,5).map(m=><div className="ap-log" key={m.id}><div><strong>{m.titulo}</strong><p>{m.categoria} · {m.prazo || 'Sem prazo válido'} · {m.pendentes} itens pendentes</p><p>Próximo passo: {m.proximoPasso}</p>{m.id&&<><button type="button" className="btn btn-sm" aria-label={`Abrir meta: ${m.titulo}`} onClick={()=>ir({pag:'metas',id:m.id})}>Abrir meta</button><button type="button" className="btn btn-sm" aria-label={`Preparar entrega: ${m.titulo}`} aria-expanded={entregaId===m.id&&Boolean(entrega)} onClick={()=>{setEntregaId(m.id);setCopiaEntrega('')}}>Preparar entrega</button></>}</div></div>)}</div>
    {entrega&&<div><label>Preparo local para revisão<textarea className="inp" aria-label="Preparo de entrega" readOnly rows={10} value={entrega}/></label><div className="ap-actions"><button type="button" className="btn btn-sm" onClick={copiarEntrega}>Copiar preparo</button><button type="button" className="btn btn-sm" onClick={()=>setEntregaId(null)}>Fechar preparo</button></div><p role="status">{copiaEntrega}</p></div>}
    {!fila.length&&<p>Nenhuma meta aberta atribuída nos dados carregados.</p>}
    {fila.length>5&&<p className="ajuda">Exibindo 5 de {fila.length}. O resumo inclui todas as metas da fila.</p>}
    <div className="ap-actions"><button type="button" className="btn btn-sm" onClick={()=>ir({pag:'metas'})}>Abrir Metas para revisar</button>{atalho&&<button type="button" className="btn btn-sm" onClick={()=>ir(atalho.rota)}>{atalho.rotulo}</button>}<button type="button" className="btn btn-sm" aria-expanded={aberto} onClick={()=>{setAberto(v=>!v);setCopia('')}}>{aberto?'Fechar resumo':'Preparar resumo de trabalho'}</button></div>
    {aberto&&<div><label>Resumo local para revisão<textarea className="inp" aria-label="Resumo de trabalho" readOnly rows={8} value={resumo}/></label><button type="button" className="btn btn-sm" onClick={copiar}>Copiar resumo</button><p role="status">{copia}</p></div>}
  </section>;
}

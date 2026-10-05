import {useEffect,useRef,useState} from 'react';
import {BarChart3,ArrowUp,ArrowDown} from 'lucide-react';
import {useModulo,EstadoModulo,CampoCRM} from './modulo-ui.jsx';
import {rpcCRM} from './crm-api.js';
import {diaPonto} from './ponto-api.js';
import {dataFollowup,horasFollowup} from './crm-followup.js';
import {tokenTempoReal} from './dados-compartilhados.js';
import {reais} from './crm-negociacao.js';
import {SETORES} from './permissoes.js';
import {periodoValido,periodoAnterior,periodosRapidos,rotuloPeriodo,totaisAgentes,periodoAnteriorTemDados,variacao,atencaoPorComercial,funilAtual,filtrarPorComercial,linhasComparativo,ordenarLinhas,resumoMetas,movimentosDoComercial,evolucaoMensal} from './crm-dashboard.js';
import RelatorioAtivacoes from './RelatorioAtivacoes.jsx';
import './crm-dashboard.css';
const COLUNAS=[['nome','Comercial'],['conversoes','Conversões'],['perdas','Perdas'],['taxaConversao','Conversão'],['taxaNoPrazo','FollowUps no prazo'],['atrasados','Atrasados agora'],['semProximoPasso','Sem próximo passo']];
const numero=v=>Number(v||0).toLocaleString('pt-BR'),pct=v=>v==null?'—':`${v}%`,vazio=v=>v==null?'—':v;
// Valor em reais so quando algum cartao tem valor; "sem valor" nunca vira R$ 0.
const valorTexto=(valor,quantidade,semValor)=>quantidade-semValor>0?reais(valor):'';
function Delta({d}){
 if(!d)return null;
 const Icone=d.tipo==='subiu'?ArrowUp:d.tipo==='caiu'?ArrowDown:null;
 return <small className="crm-dash-delta" data-tom={d.tom}>{Icone&&<Icone size={14} aria-hidden="true"/>}{d.texto}</small>;
}
// Barras na mesma escala do eixo: a altura de cada coluna e valor/topo, e o eixo mostra 0, topo/2 e topo.
function EvolucaoMensal({linhas}){
 const topo=Math.max(4,Math.ceil(Math.max(0,...linhas.map(l=>l.total))/4)*4),altura=v=>`${(100*v/topo).toFixed(1)}%`,curto=l=>`${l.rotulo.slice(0,3)}/${l.mes.slice(2,4)}`;
 const resumo=linhas.map(l=>`${l.rotulo}: ${l.total}${l.estimado?` (${l.estimado} com data estimada)`:''}`).join('; ');
 return <div className="crm-dash-grafico"><div className="crm-dash-eixo" aria-hidden="true"><span style={{top:0}}>{topo}</span><span style={{top:'50%'}}>{topo/2}</span><span style={{top:'100%'}}>0</span></div>
  <div className="crm-dash-plano" role="img" aria-label={`Clientes ativados por mês. ${resumo}.`}>{linhas.map(l=><div className="crm-dash-col" key={l.mes}><b style={{bottom:`calc(${altura(l.total)} + 3px)`}}>{l.total}</b><div className="crm-dash-pilha" style={{height:altura(l.total)}}>{l.estimado>0&&<i className="crm-dash-estimado" style={{flexGrow:l.estimado}}/>}{l.total-l.estimado>0&&<i style={{flexGrow:l.total-l.estimado}}/>}</div></div>)}</div>
  <div className="crm-dash-meses" aria-hidden="true">{linhas.map(l=><span key={l.mes}>{curto(l)}</span>)}</div></div>;
}
export default function DashboardCRM({usuarios=[],itens=[],onVerCarteira}){
 const hoje=diaPonto(),[inicio,setInicio]=useState(hoje.slice(0,8)+'01'),[fim,setFim]=useState(hoje),[agente,setAgente]=useState(''),[sincronizando,setSincronizando]=useState(false),[aviso,setAviso]=useState(''),parar=useRef(false);
 const [ordem,setOrdem]=useState({chave:'conversoes',dir:'desc'}),[atualizacao,setAtualizacao]=useState(0),[anterior,setAnterior]=useState({estado:'sem',dados:null}),[metas,setMetas]=useState(null),[ativacoes,setAtivacoes]=useState(null),[detalheAberto,setDetalheAberto]=useState(true),[destaque,setDestaque]=useState(''),agentesRef=useRef({}),sincronizou=useRef(false);
 useEffect(()=>()=>{parar.current=true;},[]);
 const valido=periodoValido(inicio,fim);
 const m=useModulo(()=>valido?rpcCRM('integracao_crm_dashboard',{p_inicio:inicio,p_fim:fim}):Promise.reject(Error('Selecione um período válido de até 366 dias.')),[inicio,fim],['crm']);
 const sincronizar=async()=>{if(sincronizando)return;setSincronizando(true);setAviso('Consultando mensagens das conversas já vinculadas ao CRM…');parar.current=false;let cursor=null,total=0;try{const token=await tokenTempoReal();if(!token)throw Error('Entre novamente na sua conta.');do{const r=await fetch('/api/crm-chatwoot-sincronizar',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({cursor}),signal:AbortSignal.timeout(120000)});const d=await r.json();if(!r.ok)throw Error(d.message||'Não foi possível atualizar o Chatwoot.');total+=d.mensagens;cursor=d.cursor;setAviso(`${total} mensagens conferidas.${cursor?' Continuando…':' Histórico registrado atualizado.'}`);}while(cursor&&!parar.current);if(cursor)setAviso(`Atualização interrompida após ${total} mensagens. Os registros já conferidos foram preservados.`);}catch(e){setAviso(e.message);}finally{setSincronizando(false);m.atualizar();}};
 // Ao terminar a conferencia do Chatwoot, o periodo anterior tambem e relido (somente leitura).
 useEffect(()=>{if(sincronizando){sincronizou.current=true;return;}if(sincronizou.current){sincronizou.current=false;setAtualizacao(n=>n+1);}},[sincronizando]);
 // Periodo anterior: mesma duracao, logo antes do escolhido. Leitura de apoio: falha nunca aparece como erro e nunca repete sozinha.
 const ant=valido?periodoAnterior(inicio,fim):null;
 useEffect(()=>{
  if(!ant){setAnterior({estado:'sem',dados:null});return;}
  let vivo=true;setAnterior({estado:'carregando',dados:null});
  rpcCRM('integracao_crm_dashboard',{p_inicio:ant.inicio,p_fim:ant.fim}).then(d=>{if(vivo)setAnterior({estado:'ok',dados:d});}).catch(()=>{if(vivo)setAnterior({estado:'falha',dados:null});});
  return()=>{vivo=false;};
 },[valido,inicio,fim,atualizacao]);
 // Metas vigentes: o realizado vem pronto do sistema. Sem meta ou com falha, o bloco some.
 useEffect(()=>{let vivo=true;rpcCRM('integracao_crm_metas_painel',{}).then(d=>{if(vivo)setMetas(Array.isArray(d)?d:[]);}).catch(()=>{if(vivo)setMetas([]);});return()=>{vivo=false;};},[atualizacao]);
 // Clientes ativados nos ultimos 6 meses (mesmo relatorio do bloco Clientes ativados), so para o grafico mensal.
 const base=evolucaoMensal([],hoje),inicioSerie=base.length?`${base[0].mes}-01`:hoje;
 useEffect(()=>{let vivo=true;rpcCRM('integracao_crm_relatorio_ativacoes',{p_inicio:inicioSerie,p_fim:hoje}).then(d=>{if(vivo)setAtivacoes(Array.isArray(d)?d:null);}).catch(()=>{if(vivo)setAtivacoes(null);});return()=>{vivo=false;};},[atualizacao,inicioSerie,hoje]);
 const agentes=m.dados?.agentes||[],rows=agentes.filter(a=>!agente||a.id===agente),c=m.dados?.cobertura,agenteNome=agentes.find(a=>a.id===agente)?.nome;
 const t=totaisAgentes(agentes,agente),antes=anterior.estado==='ok'?totaisAgentes(anterior.dados?.agentes,agente):null,anteriorTemDados=antes?periodoAnteriorTemDados(antes):false;
 const comp=(campo,opcoes)=>{
  if(t[campo]==null)return null;
  if(anterior.estado==='carregando')return {tipo:'sem-base',tom:'neutro',texto:'Comparando com o período anterior…'};
  if(antes&&!anteriorTemDados)return null;
  return variacao(t[campo],antes?antes[campo]:null,opcoes);
 };
 const kpis=[
  ['Conversões em contrato',numero(t.conversoes),'',comp('conversoes')],
  ['Clientes perdidos',numero(t.perdas),'',comp('perdas',{menorEMelhor:true})],
  ['Conversão entre desfechos',pct(t.taxaConversao),'Conversões ÷ (conversões + perdas)',comp('taxaConversao',{unidade:'pontos'})],
  ['Movimentações realizadas',numero(t.movimentacoes),'',comp('movimentacoes')],
  ['FollowUps feitos no prazo',pct(t.taxaNoPrazo),`${numero(t.no_prazo)} de ${numero(t.followups_feitos)} FollowUps feitos`,comp('taxaNoPrazo',{unidade:'pontos'})],
  ['Atendimentos no Chatwoot',numero(t.atendimentos_chatwoot),'',comp('atendimentos_chatwoot')]
 ];
 // Situacao de hoje e funil: fotografia dos cartoes carregados no CRM, calculada aqui. Nunca depende do periodo.
 const atencao=atencaoPorComercial(itens,usuarios),itensDoFiltro=filtrarPorComercial(itens,agente),atencaoHoje=agente?atencaoPorComercial(itensDoFiltro,usuarios):atencao;
 const linhasHoje=agente?atencaoHoje.linhas.filter(l=>l.id===agente):atencaoHoje.linhas,tot=atencaoHoje.total;
 const funil=funilAtual(itensDoFiltro),maxFunil=Math.max(0,...funil.map(f=>f.quantidade));
 const metasVigentes=resumoMetas(metas||[],hoje);
 const linhas=ordenarLinhas(linhasComparativo(agentes,atencao,agente,{semLinhaComoZero:itens.length>0}),ordem.chave,ordem.dir);
 const ordenar=chave=>setOrdem(o=>o.chave===chave?{chave,dir:o.dir==='asc'?'desc':'asc'}:{chave,dir:chave==='nome'?'asc':'desc'});
 const mesesTodos=ativacoes?evolucaoMensal(ativacoes,hoje):[],haAtivacoes=mesesTodos.some(l=>l.total>0),meses=agente&&ativacoes?evolucaoMensal(ativacoes.filter(r=>r.responsavel_id===agente),hoje):mesesTodos;
 const verDetalhe=id=>{setDetalheAberto(true);setTimeout(()=>{const el=agentesRef.current[id];if(el){setDestaque(id);el.scrollIntoView({block:'start'});el.focus({preventScroll:true});}},0);};
 return <section className="crm-dashboard crm-dash"><header><h2><BarChart3 size={22}/> Dashboard comercial</h2><p>Resultados por comercial e acompanhamento dos próximos contatos.</p></header>
 <div className="crm-dashboard-filtros crm-dash-filtros"><CampoCRM nome="Início do período"><input className="inp" type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/></CampoCRM><CampoCRM nome="Fim do período"><input className="inp" type="date" value={fim} onChange={e=>setFim(e.target.value)}/></CampoCRM>
  <div className="crm-dash-periodos" role="group" aria-label="Períodos rápidos">{periodosRapidos(hoje).map(p=><button key={p.id} type="button" className="btn" aria-pressed={inicio===p.inicio&&fim===p.fim} onClick={()=>{setInicio(p.inicio);setFim(p.fim);}}>{p.rotulo}</button>)}</div>
  <CampoCRM nome="Comercial do dashboard"><select className="inp" value={agente} onChange={e=>setAgente(e.target.value)}><option value="">Todos os comerciais</option>{agentes.map(a=><option key={a.id} value={a.id}>{a.nome}{a.ativo?'':' (inativo)'}</option>)}</select></CampoCRM>
  <div className="crm-dash-acoes"><button className="btn" onClick={()=>{m.atualizar();setAtualizacao(n=>n+1);}}>Atualizar indicadores</button><button className="btn" disabled={sincronizando} onClick={sincronizar}>Conferir histórico no Chatwoot</button>{sincronizando&&<button className="btn" onClick={()=>{parar.current=true;setAviso('Parando após a página em andamento…');}}>Parar atualização</button>}</div></div>
 {aviso&&<p role="status">{aviso}</p>}<EstadoModulo modulo={m}/>
 {c&&<div className="crm-dashboard-cobertura"><strong>Chatwoot no período: {c.conversas} conversas · {c.mensagens} mensagens registradas</strong><p>{c.saidas_sem_autoria} mensagens de saída sem autoria confirmada · {c.humanas_sem_vinculo} mensagens humanas sem vínculo com usuário · {c.automaticas} automáticas. Última mensagem registrada: {dataFollowup(c.ultima_mensagem)}.</p><small>O painel considera o histórico disponível no Integração. “Conferir histórico” lê o Chatwoot e atualiza as conversas já vinculadas, sem enviar mensagens.</small></div>}
 {m.dados&&<section className="crm-dash-bloco" aria-labelledby="crm-dash-resultado"><h3 id="crm-dash-resultado">Resultado do período</h3><p className="ajuda">Período: {rotuloPeriodo(inicio,fim)}.{ant&&(antes&&!anteriorTemDados?' Sem registros no período anterior.':` Comparado com ${rotuloPeriodo(ant.inicio,ant.fim)}.`)}</p>
  <dl className="crm-dash-kpis">{kpis.map(([nome,valor,apoio,delta])=><div key={nome}><dt>{nome}</dt><dd className="crm-dash-valor">{valor}</dd>{apoio&&<dd className="crm-dash-apoio">{apoio}</dd>}{delta&&<dd><Delta d={delta}/></dd>}</div>)}</dl></section>}
 <section className="crm-dash-bloco" aria-labelledby="crm-dash-hoje"><h3 id="crm-dash-hoje">Situação de hoje</h3><p className="ajuda">Fotografia da carteira em andamento. Não depende do período escolhido.{agenteNome&&` Mostrando só os cartões de ${agenteNome}.`}</p>
  {!tot.andamento?<p className="crm-dash-vazio">Nenhum cliente em andamento.</p>:<>
   <dl className="crm-dash-atencao"><div><dt>Em andamento</dt><dd className="crm-dash-valor">{numero(tot.andamento)}</dd><dd className="crm-dash-apoio">Cliente novo, Negociação e Contrato</dd></div><div data-tom={tot.atrasados?'alerta':undefined}><dt>Próximo passo atrasado</dt><dd className="crm-dash-valor">{numero(tot.atrasados)}</dd><dd className="crm-dash-apoio">A data combinada já passou</dd></div><div><dt>Sem próximo passo</dt><dd className="crm-dash-valor">{numero(tot.semProximoPasso)}</dd><dd className="crm-dash-apoio">Ninguém agendou o próximo contato</dd></div><div><dt>Valor em aberto</dt><dd className="crm-dash-valor">{valorTexto(tot.valorAberto,tot.andamento,tot.semValor)||'—'}</dd>{tot.semValor>0&&<dd className="crm-dash-apoio">{tot.semValor} sem valor</dd>}</div></dl>
   <div className="crm-dash-rolagem" role="region" aria-label="Carteira em andamento por comercial" tabIndex={0}><table className="crm-dash-tabela"><caption>Carteira em andamento por comercial</caption><thead><tr><th scope="col">Comercial</th><th scope="col">Em andamento</th><th scope="col">Atrasados</th><th scope="col">Sem próximo passo</th><th scope="col">Valor em aberto</th></tr></thead>
    <tbody>{linhasHoje.map(l=><tr key={l.id}><th scope="row">{onVerCarteira?<button type="button" className="crm-dash-nome" aria-label={`Ver carteira de ${l.nome}`} onClick={()=>onVerCarteira(l.id)}>{l.nome}</button>:l.nome}</th><td>{l.andamento}</td><td data-tom={l.atrasados?'atrasado':undefined}>{l.atrasados}</td><td data-tom={l.semProximoPasso?'sem':undefined}>{l.semProximoPasso}</td><td>{valorTexto(l.valorAberto,l.andamento,l.semValor)||'—'}{l.semValor>0&&<small> · {l.semValor} sem valor</small>}</td></tr>)}</tbody>
    <tfoot><tr className="crm-dash-total"><th scope="row">Total</th><td>{tot.andamento}</td><td>{tot.atrasados}</td><td>{tot.semProximoPasso}</td><td>{valorTexto(tot.valorAberto,tot.andamento,tot.semValor)||'—'}{tot.semValor>0&&<small> · {tot.semValor} sem valor</small>}</td></tr></tfoot></table></div></>}</section>
 <section className="crm-dash-bloco" aria-labelledby="crm-dash-funil"><h3 id="crm-dash-funil">Funil de hoje</h3><p className="ajuda">Fotografia dos cartões neste momento, não do período. Cliente ativo e Perdido mostram o total acumulado.{agenteNome&&` Mostrando só os cartões de ${agenteNome}.`}</p>
  {!itensDoFiltro.some(i=>i.tipo==='card')?<p className="crm-dash-vazio">Nenhum cartão neste filtro.</p>:<ul className="crm-dash-funil">{funil.map(f=>{const aberta=f.etapa!=='Cliente ativo'&&f.etapa!=='Perdido',v=aberta?valorTexto(f.valor,f.quantidade,f.semValor):'';return <li key={f.etapa} className="crm-dash-etapa" data-etapa={f.etapa}><span className="crm-dash-etapa-nome">{f.etapa}</span><div className="crm-dash-barra" role="img" aria-label={`${f.etapa}: ${f.quantidade} de ${maxFunil}`}><i style={{width:`${maxFunil?Math.round(100*f.quantidade/maxFunil):0}%`}}/></div><span className="crm-dash-etapa-n"><strong>{f.quantidade}</strong> {f.quantidade===1?'cliente':'clientes'}</span>{aberta&&(v||f.semValor>0)&&<span className="crm-dash-etapa-valores">{v}{v&&f.semValor>0&&' · '}{f.semValor>0&&`${f.semValor} sem valor`}</span>}</li>;})}</ul>}</section>
 {metasVigentes.length>0&&<section className="crm-dash-bloco" aria-labelledby="crm-dash-metas"><h3 id="crm-dash-metas">Metas em andamento</h3><p className="ajuda">Cada meta usa o próprio período e o realizado calculado pelo sistema. Não muda com o período ao lado nem com o filtro de comercial.</p>
  <div className="crm-dash-metas">{metasVigentes.map(x=><article className="crm-dash-meta" key={x.id}><h4>{x.titulo}</h4><p className="ajuda">{x.escopo==='setor'?'Equipe':'Vendedor'}{x.setor?` · ${SETORES[x.setor]?.nome||x.setor}`:''} · {rotuloPeriodo(x.inicio,x.fim)}</p><p><strong>{x.textoRealizado}</strong> de {x.textoAlvo}{x.percentual!=null&&` (${x.percentual}%)`}</p>
   {x.percentual!=null&&<div className="crm-dash-barra" data-acima={x.percentual>100?'true':undefined} role="progressbar" aria-label={`Progresso de ${x.titulo}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,x.percentual)} aria-valuetext={`${x.percentual}% da meta`}><i style={{width:`${Math.min(100,x.percentual)}%`}}/></div>}
   {x.semValor>0&&x.unidade==='valor'&&<p className="ajuda">({x.semValor} sem valor)</p>}
   {x.escopo==='setor'&&x.participantes.length>0&&<details><summary>Contribuição de cada participante</summary><ul>{x.participantes.map(u=><li key={u.id}>{u.nome||'Usuário'}: {x.unidade==='valor'?reais(u.realizado):numero(u.realizado)}</li>)}</ul></details>}</article>)}</div></section>}
 {m.dados&&<section className="crm-dash-bloco" aria-labelledby="crm-dash-indicadores"><h3 id="crm-dash-indicadores">Indicadores por comercial</h3><p className="ajuda">Clique no título da coluna para ordenar. Clique no nome para ver todos os indicadores da pessoa. Atrasados agora e Sem próximo passo mostram a situação de hoje.</p>
  {!linhas.length?<p className="crm-dash-vazio">Nenhum comercial cadastrado neste filtro.</p>:<div className="crm-dash-rolagem" role="region" aria-label="Indicadores por comercial" tabIndex={0}><table className="crm-dash-tabela crm-dash-ordenavel"><caption>Indicadores por comercial</caption><thead><tr>{COLUNAS.map(([chave,rotulo])=><th key={chave} scope="col" aria-sort={ordem.chave===chave?(ordem.dir==='asc'?'ascending':'descending'):'none'}><button type="button" className="crm-dash-ordenar" onClick={()=>ordenar(chave)}>{rotulo}{ordem.chave===chave&&(ordem.dir==='asc'?<ArrowUp size={14} aria-hidden="true"/>:<ArrowDown size={14} aria-hidden="true"/>)}</button></th>)}</tr></thead>
   <tbody>{linhas.map(l=><tr key={l.id}><th scope="row"><button type="button" className="crm-dash-nome" aria-label={`Ver detalhe de ${l.nome}`} onClick={()=>verDetalhe(l.id)}>{l.nome}</button>{!l.ativo&&<small> · Inativo</small>}</th><td>{l.conversoes}</td><td>{l.perdas}</td><td>{pct(l.taxaConversao)}</td><td>{pct(l.taxaNoPrazo)}{l.followups_feitos>0&&<small> · {l.no_prazo} de {l.followups_feitos}</small>}</td><td data-tom={l.atrasados?'atrasado':undefined}>{vazio(l.atrasados)}</td><td data-tom={l.semProximoPasso?'sem':undefined}>{vazio(l.semProximoPasso)}</td></tr>)}</tbody></table></div>}</section>}
 {haAtivacoes&&<section className="crm-dash-bloco" aria-labelledby="crm-dash-evolucao"><h3 id="crm-dash-evolucao">Evolução mensal de clientes ativados</h3><p className="ajuda">Últimos 6 meses, a partir do relatório de clientes ativados. Não depende do período escolhido{agenteNome?`; mostra só ${agenteNome}`:''}.</p>
  <EvolucaoMensal linhas={meses}/><p className="crm-dash-legenda"><span><i/> Data registrada pelo sistema</span>{meses.some(l=>l.estimado>0)&&<span><i className="crm-dash-estimado"/> Data estimada (ativação anterior ao registro automático)</span>}</p></section>}
 {m.dados&&<section className="crm-dash-bloco" aria-labelledby="crm-dash-detalhe"><details className="crm-dash-detalhe" open={detalheAberto} onToggle={e=>setDetalheAberto(e.currentTarget.open)}><summary><h3 id="crm-dash-detalhe">Detalhe por comercial</h3></summary>
  <div className="crm-dashboard-grade">{rows.map(a=><article className="crm-dashboard-agente crm-dash-agente" key={a.id} id={`crm-dash-ag-${a.id}`} tabIndex={-1} ref={el=>{agentesRef.current[a.id]=el;}} data-destaque={destaque===a.id?'true':undefined} onBlur={()=>setDestaque(d=>d===a.id?'':d)}><h3>{a.nome}{!a.ativo&&<small> · Inativo</small>}</h3><dl>{[
 ['Clientes na carteira',a.carteira],['Movimentações realizadas',a.movimentacoes],['Conversões em contrato',a.conversoes],['Clientes perdidos',a.perdas],['Conversão entre desfechos',Number(a.conversoes)+Number(a.perdas)?`${Math.round(100*a.conversoes/(Number(a.conversoes)+Number(a.perdas)))}%`:'—'],
 ['FollowUps feitos',a.followups_feitos],['Feitos no prazo',a.no_prazo],['Tempo médio de FollowUp',horasFollowup(a.tempo_medio_horas)],['Atraso médio',horasFollowup(a.atraso_medio_horas)],['Pendentes agora',a.pendentes],['Atrasados agora',a.atrasados],['Clientes sem próximo prazo',a.sem_followup],['Atendimentos no Chatwoot',a.atendimentos_chatwoot],['Mensagens humanas enviadas',a.mensagens_enviadas],['Conversas da carteira',a.conversas_carteira],['Atendimentos manuais',a.atendimentos_manuais]
 ].map(([n,v])=><div key={n} className={n==='Atrasados agora'&&Number(v)>0?'crm-dashboard-alerta':''}><dt>{n}</dt><dd>{v}</dd></div>)}</dl></article>)}</div>
  {!rows.length&&<p>Nenhum comercial cadastrado neste filtro.</p>}</details></section>}
 {m.dados&&<section className="crm-dashboard-movimentos"><h3>Últimas movimentações no período</h3><p className="ajuda">Até 100 movimentações mais recentes; os indicadores acima consideram todo o período.</p>{movimentosDoComercial(m.dados.movimentacoes,agente).map((x,i)=><article key={`${x.registro_id}-${x.created_at}-${i}`}><strong>{x.nome||x.lead_nome||'Cliente'}</strong><span>{x.anterior} → {x.atual}</span><small>{dataFollowup(x.created_at)} · {usuarios.find(u=>(u.erpRef||u.id)===x.autor_id)?.nome||'Sistema / usuário registrado'}</small></article>)}</section>}
 <details className="crm-dashboard-definicoes"><summary>Como os indicadores são calculados</summary><p>Movimentações: mudanças de etapa realizadas pelo comercial no período. Conversões e perdas: clientes distintos por evento, atribuídos ao responsável principal no momento da mudança. Contrato → Cliente ativo não conta como nova conversão. A taxa usa conversões ÷ (conversões + perdas); um cliente recuperado pode constar nos dois resultados do período.</p><p>FollowUps feitos e tempos médios usam quem registrou a conclusão. Tempo médio: agendamento até conclusão; atraso médio inclui zero para conclusões no prazo. Pendentes, atrasados e carteira mostram a situação atual. Clientes compartilhados aparecem na carteira de cada responsável.</p><p>Atendimento Chatwoot: conversa distinta em que o comercial enviou mensagem humana e pública no período, identificado pelo ID do remetente. Mensagens automáticas, notas internas e autores desconhecidos não contam como atendimento do comercial. Conversas da carteira incluem todos os autores e podem aparecer em mais de uma carteira.</p><p>Comparação: o período anterior tem a mesma duração e termina no dia anterior ao início do período escolhido; sem registros nele, a comparação não aparece. Situação de hoje e Funil de hoje são uma fotografia dos cartões neste momento e não mudam com o período; Cliente ativo e Perdido mostram o total acumulado. Em Metas, o realizado vem do sistema e conta só ativações vindas de Contrato, por isso pode diferir do relatório de clientes ativados; a evolução mensal usa esse relatório, e as datas estimadas usam a última alteração do cartão. Clientes na carteira e Clientes sem próximo prazo, no detalhe de cada comercial, incluem perdidos e ativos, por isso não batem com a Situação de hoje.</p></details>
 <details className="crm-dash-ativados" open><summary>Clientes ativados: detalhe e planilha</summary><RelatorioAtivacoes usuarios={usuarios}/></details>
 </section>;
}

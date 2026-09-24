import {useState} from 'react';
import {UserCheck,Download} from 'lucide-react';
import {useModulo,EstadoModulo,CampoCRM} from './modulo-ui.jsx';
import {rpcCRM} from './crm-api.js';
import {diaPonto} from './ponto-api.js';
import {TIPOS_PERIODO,opcoesPeriodo,intervaloPeriodo,periodoAtual,resumirAtivacoes,reais,dataBR,csvAtivacoes} from './crm-ativacoes.js';

// Clientes que cada comercial levou à etapa Cliente ativo, por mês, trimestre, semestre ou ano.
export default function RelatorioAtivacoes({usuarios}){
 const hoje=diaPonto(),anoAtual=Number(hoje.slice(0,4));
 const [tipo,setTipo]=useState('mensal'),[ano,setAno]=useState(anoAtual),[numero,setNumero]=useState(()=>periodoAtual('mensal',hoje).numero),[agente,setAgente]=useState('');
 const periodo=intervaloPeriodo(tipo,ano,numero);
 const m=useModulo(()=>rpcCRM('integracao_crm_relatorio_ativacoes',{p_inicio:periodo.inicio,p_fim:periodo.fim}),[periodo.inicio,periodo.fim],['crm']);
 const nome=id=>usuarios.find(u=>(u.erpRef||u.id)===id)?.nome||(id?'Usuário removido':'Sem responsável');
 const todos=m.dados||[],registros=todos.filter(r=>!agente||r.responsavel_id===agente),resumo=resumirAtivacoes(registros);
 const comerciais=[...new Set(todos.map(r=>r.responsavel_id).filter(Boolean))].map(id=>[id,nome(id)]).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
 const trocarTipo=t=>{setTipo(t);setNumero(ano===anoAtual?periodoAtual(t,hoje).numero:1);};
 const exportar=()=>{const url=URL.createObjectURL(new Blob([csvAtivacoes(registros,nome)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`clientes-ativados-${periodo.inicio}-a-${periodo.fim}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section className="crm-dashboard crm-ativacoes" aria-labelledby="titulo-ativacoes">
  <header><h2 id="titulo-ativacoes"><UserCheck size={22}/> Clientes ativados</h2><p>Clientes que cada comercial levou à etapa Cliente ativo. Eles saem do funil, mas continuam registrados aqui para os relatórios de desempenho.</p></header>
  <div className="crm-dashboard-filtros">
   <CampoCRM nome="Relatório"><select className="inp" value={tipo} onChange={e=>trocarTipo(e.target.value)}>{TIPOS_PERIODO.map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></CampoCRM>
   <CampoCRM nome="Ano"><select className="inp" value={ano} onChange={e=>setAno(Number(e.target.value))}>{Array.from({length:anoAtual-2023},(_,i)=>anoAtual-i).map(a=><option key={a} value={a}>{a}</option>)}</select></CampoCRM>
   {tipo!=='anual'&&<CampoCRM nome="Período"><select className="inp" value={numero} onChange={e=>setNumero(Number(e.target.value))}>{opcoesPeriodo(tipo).map(([n,r])=><option key={n} value={n}>{r}</option>)}</select></CampoCRM>}
   <CampoCRM nome="Comercial"><select className="inp" value={agente} onChange={e=>setAgente(e.target.value)}><option value="">Todos os comerciais</option>{comerciais.map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></CampoCRM>
   <button className="btn" disabled={!registros.length} onClick={exportar}><Download size={16}/> Exportar planilha</button>
  </div>
  <EstadoModulo modulo={m}/>
  {m.dados&&<>
   <div className="crm-ativacoes-totais" aria-label={`Totais de ${periodo.rotulo}`}><div><span>Período</span><strong>{periodo.rotulo}</strong></div><div><span>Clientes ativados</span><strong>{resumo.quantidade}</strong></div><div><span>Valor total</span><strong>{reais(resumo.valor)}</strong></div></div>
   {!registros.length?<p>Nenhum cliente ativado neste período.</p>:<>
    <div className="crm-tabela-rolagem"><table className="crm-ativacoes-tabela"><caption>Desempenho por comercial</caption><thead><tr><th scope="col">Comercial</th><th scope="col">Clientes ativados</th><th scope="col">Valor total</th></tr></thead>
     <tbody>{resumo.linhas.map(l=><tr key={l.responsavel_id||'sem'}><th scope="row">{nome(l.responsavel_id)}</th><td>{l.quantidade}</td><td>{reais(l.valor)}{l.semValor?<small> · {l.semValor} sem valor</small>:null}</td></tr>)}</tbody></table></div>
    <div className="crm-tabela-rolagem"><table className="crm-ativacoes-tabela"><caption>Clientes ativados em {periodo.rotulo}</caption><thead><tr><th scope="col">Data</th><th scope="col">Cliente</th><th scope="col">Cidade</th><th scope="col">Valor</th><th scope="col">Comercial</th></tr></thead>
     <tbody>{registros.map(r=><tr key={r.card_id}><td>{dataBR(r.ativado_em)}{r.origem==='estimado'&&<small title="Ativação anterior ao registro automático"> · estimada</small>}</td><th scope="row">{r.nome}</th><td>{r.cidade||'Não informada'}</td><td>{reais(r.valor)}</td><td>{nome(r.responsavel_id)}{r.comerciais_adicionais?.length?<small> · com {r.comerciais_adicionais.map(nome).join(', ')}</small>:null}</td></tr>)}</tbody></table></div>
   </>}
   <details className="crm-dashboard-definicoes"><summary>Como o relatório é calculado</summary><p>Cada cliente conta uma vez, na data em que passou para Cliente ativo, para o comercial responsável principal naquele momento. O valor é o valor total da negociação registrada no card. Se a ativação for desfeita (o cliente volta a outra etapa), ela deixa de contar; se for ativado de novo, vale a data mais recente.</p><p>Clientes ativados antes deste registro automático usam o histórico de movimentações; quando não há histórico, a data é estimada pela última alteração do card.</p></details>
  </>}
 </section>;
}

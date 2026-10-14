import {useState} from 'react';
import {ArrowDown,Cloud,Plus} from 'lucide-react';
import './funil-institucional.css';
import {CampoCRM} from './modulo-ui.jsx';
import {acessoCRM} from './crm-regras.js';
import {alterarFunil, CARTEIRAS_INSTITUCIONAIS, funilVazio} from './funil-institucional.js';

export default function FunilInstitucional({db, usuario, mutar, institucionais, abrirInstitucional}) {
  const fluxo = db.funilInstitucional || funilVazio();
  const pode = acessoCRM(usuario).admin;
  const [nome,setNome] = useState(''), [uf,setUf] = useState('SC');
  const [ocupado,setOcupado] = useState(false), [erro,setErro] = useState('');
  const [cidadeId,setCidadeId] = useState(''),[nucleoNome,setNucleoNome] = useState('');
  const [carteira,setCarteira] = useState('reserva');
  const salvar = async acao => {
    if (!pode || ocupado) return;
    setOcupado(true);setErro('');
    try {
      await mutar(d => {
        d.funilInstitucional = alterarFunil(d.funilInstitucional, {...acao, eventoId:crypto.randomUUID()}, {institucionais:institucionais || [],autor:usuario.nome});
        return d;
      }, 'Fluxo institucional atualizado', {detalhe:acao.tipo === 'cidade' ? 'Município no fluxo institucional' : 'Núcleo no fluxo institucional'});
      if(acao.tipo==='cidade'&&!fluxo.cidades.some(c=>c.id===acao.id))setNome('');
      if(acao.tipo==='nucleo'&&!fluxo.nucleos.some(n=>n.nucleoId===acao.nucleoId))setNucleoNome('');
    } catch(e) {setErro(e.message || 'Não foi possível salvar o fluxo.');}
    finally {setOcupado(false);}
  };
  const origem = c => institucionais?.find(i=>i.id===c.institucionalId);
  const cidade = c => <article key={c.id} className="crm-card fi-registro">
    <h4>{c.nome}/{c.uf}</h4>
    <p className="ajuda">{c.institucionalId ? origem(c)?.nome || 'Cliente institucional indisponível' : c.municipioId ? 'Vínculo anterior preservado' : 'Aguardando vínculo institucional'}</p>
    {origem(c) && <div className="crm-acoes"><button className="btn" onClick={() => abrirInstitucional(origem(c))}>Abrir negócio</button></div>}
    {pode && <details><summary>Vínculo e etapa</summary><div className="crm-form">
      <CampoCRM nome="Cliente institucional"><select className="inp" aria-label={`Vincular institucional de ${c.nome}`} disabled={ocupado || !institucionais} value={c.institucionalId || ''} onChange={e => salvar({tipo:'cidade',...c,institucionalId:e.target.value || null})}><option value="">Sem vínculo institucional</option>{c.institucionalId&&!origem(c)&&<option value={c.institucionalId}>Vínculo indisponível preservado</option>}{(institucionais||[]).map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></CampoCRM>
      <CampoCRM nome="Etapa municipal"><select className="inp" aria-label={`Etapa de ${c.nome}`} disabled={ocupado} value={c.etapa} onChange={e => salvar({tipo:'cidade',...c,etapa:e.target.value})}><option value="nuvens">Nuvens</option><option value="prospeccao">Prospecção</option>{c.etapa === 'carteiras' && <option value="carteiras">Núcleos nas etapas seguintes</option>}</select></CampoCRM>
    </div></details>}
  </article>;
  const candidatos=fluxo.cidades.filter(c=>c.etapa==='nuvens'), prospectados=fluxo.cidades.filter(c=>c.etapa==='prospeccao');
  return <section className="card fi-painel" aria-label="Fluxo institucional integrado">
    <div className="cabeca"><div><h2>Fluxo institucional</h2><p className="ajuda">Municípios vinculados a Clientes institucionais. Prospecção acompanha até quatro municípios; as etapas seguintes acompanham seus núcleos.</p></div></div>
    {erro && <p role="alert" className="msg-erro">{erro}</p>}
    <section className="fi-nuvem" aria-label="Nuvens">
      <svg viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true"><path d="M120 96 C120 38 205 18 267 57 C294 1 394 0 440 44 C499 3 611 6 648 62 C725 20 829 43 838 99 C937 86 988 150 966 205 C1000 270 957 348 877 348 C855 408 757 416 704 380 C650 421 544 422 498 390 C441 426 337 416 303 380 C238 415 143 393 131 349 C47 367 2 302 29 245 C-9 183 33 104 120 96 Z"/></svg>
      <h3><Cloud size={22} aria-hidden="true"/>Nuvens <span className="pill">{candidatos.length} município(s)</span></h3>
      <div className="fi-nomes">{candidatos.map(c=><span className="pill" key={c.id}>{c.nome}/{c.uf}</span>)}{!candidatos.length&&<p className="ajuda">Nenhum município candidato.</p>}</div>
    </section>
    <details className="fi-candidatos"><summary>Gerenciar municípios nas Nuvens</summary>
      <div className="crm-grade">{candidatos.map(cidade)}</div>
      {pode && <form className="crm-form fi-form" onSubmit={e=>{e.preventDefault();salvar({tipo:'cidade',id:crypto.randomUUID(),nome,uf,etapa:'nuvens'});}}>
        <CampoCRM nome="Município candidato"><input className="inp" required minLength={2} maxLength={120} value={nome} onChange={e=>setNome(e.target.value)}/></CampoCRM>
        <CampoCRM nome="UF"><input className="inp" required pattern="[A-Z]{2}" maxLength={2} value={uf} onChange={e=>setUf(e.target.value.toUpperCase())}/></CampoCRM>
        <button className="btn btn-primario" disabled={ocupado}><Plus size={17}/>Adicionar às Nuvens</button>
      </form>}
    </details>
    <div className="fi-conexao" aria-hidden="true"><ArrowDown size={22}/></div>
    <ol className="fi-resumo" aria-label="Formato do funil comercial">{[{nome:'Prospecção',total:`${prospectados.length}/4 municípios`},...CARTEIRAS_INSTITUCIONAIS.map(c=>({nome:c.nome,total:`${fluxo.nucleos.filter(n=>n.carteira===c.id).length} núcleo(s)`}))].map(c=><li key={c.nome}><strong>{c.nome}</strong><span>{c.total}</span></li>)}</ol>
    <h3>Quadro das quatro etapas</h3><p className="ajuda fi-mobile">Deslize o quadro para consultar todas as etapas.</p>
    <div className="fi-quadro-rolagem" role="region" aria-label="Quadro das quatro etapas" tabIndex={0}>
    <div className="crm-quadro fi-quadro">
      <section className="crm-coluna fi-etapa" aria-label="Prospecção municipal"><h3>Prospecção</h3><p className="ajuda">{prospectados.length}/4 municípios</p>{prospectados.map(cidade)}{!prospectados.length&&<p className="fi-vazio">Nenhum município em prospecção.</p>}</section>
      {CARTEIRAS_INSTITUCIONAIS.map(c=><section key={c.id} className="crm-coluna fi-etapa" aria-label={`Carteira ${c.nome}`}><h3>{c.nome}</h3><p className="ajuda">{fluxo.nucleos.filter(n=>n.carteira===c.id).length} núcleo(s) · {c.descricao}</p>
        {fluxo.nucleos.filter(n=>n.carteira===c.id).map(item=>{
          const municipal=fluxo.cidades.find(m=>item.cidadeId?m.id===item.cidadeId:m.municipioId===item.municipioId);
          const nomeNucleo=item.nome || db.nucleos?.find(n=>n.id===item.nucleoId)?.codigo || 'Núcleo anterior indisponível';
          return <article className="crm-card fi-registro" key={item.nucleoId}><h4>{nomeNucleo}</h4><p>{municipal?`${municipal.nome}/${municipal.uf}`:'Vínculo anterior preservado'}</p>{municipal&&origem(municipal)&&<div className="crm-acoes"><button className="btn" onClick={()=>abrirInstitucional(origem(municipal))}>Abrir negócio</button></div>}{!item.cidadeId&&<p className="ajuda">Registro anterior preservado</p>}{pode&&<div className="crm-form"><CampoCRM nome="Mover para"><select className="inp" aria-label={`Carteira de ${nomeNucleo}`} disabled={ocupado} value={item.carteira} onChange={e=>salvar({tipo:'nucleo',nucleoId:item.nucleoId,carteira:e.target.value})}>{CARTEIRAS_INSTITUCIONAIS.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></CampoCRM></div>}</article>;
        })}{!fluxo.nucleos.some(n=>n.carteira===c.id)&&<p className="fi-vazio">Nenhum núcleo nesta etapa.</p>}
      </section>)}
    </div></div>
    {pode&&<details className="fi-candidatos"><summary>Adicionar núcleo institucional</summary><p className="ajuda">Cadastro próprio deste fluxo, vinculado a um município institucional. Um município pode ter vários núcleos.</p><form className="crm-form fi-form" onSubmit={e=>{e.preventDefault();salvar({tipo:'nucleo',nucleoId:crypto.randomUUID(),cidadeId,nome:nucleoNome,carteira});}}>
      <CampoCRM nome="Município institucional"><select className="inp" aria-label="Município institucional" required value={cidadeId} onChange={e=>setCidadeId(e.target.value)}><option value="">Selecione</option>{fluxo.cidades.filter(c=>c.institucionalId&&c.etapa!=='nuvens').map(c=><option key={c.id} value={c.id}>{c.nome}/{c.uf}</option>)}</select></CampoCRM>
      <CampoCRM nome="Nome do núcleo"><input className="inp" required minLength={2} maxLength={120} value={nucleoNome} onChange={e=>setNucleoNome(e.target.value)}/></CampoCRM>
      <CampoCRM nome="Etapa"><select className="inp" value={carteira} onChange={e=>setCarteira(e.target.value)}>{CARTEIRAS_INSTITUCIONAIS.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></CampoCRM><button className="btn btn-primario" disabled={ocupado}>Adicionar núcleo</button>
    </form></details>}
    <details className="fi-historico"><summary>Histórico do fluxo ({fluxo.historico.length})</summary>{[...fluxo.historico].reverse().map(h=><p key={h.id}>{new Date(h.data).toLocaleString('pt-BR')} — {h.autor}: {h.acao.tipo==='cidade'?`${h.acao.nome||'Município'} → ${h.acao.etapa||'vínculo atualizado'}`:`Núcleo → ${h.acao.carteira}`}</p>)}</details>
  </section>;
}

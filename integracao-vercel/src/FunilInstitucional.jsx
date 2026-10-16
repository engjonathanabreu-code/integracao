import {useEffect,useRef,useState} from 'react';
import {ArrowDown,Cloud,Plus,X} from 'lucide-react';
import './funil-institucional.css';
import CardFunilInstitucional from './CardFunilInstitucional.jsx';
import {CampoCRM} from './modulo-ui.jsx';
import {acessoCRM} from './crm-regras.js';
import {alterarFunil, CARTEIRAS_INSTITUCIONAIS, funilVazio} from './funil-institucional.js';

const municipioTexto = c => c ? [c.nome,c.uf].filter(Boolean).join('/') || null : null;
const etiquetasRegistro = (registro,etapa,legado=false) => [etapa,legado?'Vínculo anterior preservado':null,...(Array.isArray(registro.etiquetas)?registro.etiquetas.filter(x=>typeof x==='string'):[])].filter(Boolean);
function DetalhesFunil({titulo,fechar,ocupado,children}) {
  const dialog=useRef(null);
  useEffect(()=>{const d=dialog.current;d.showModal();return()=>d.close();},[]);
  return <dialog ref={dialog} className="crm-ficha-dialogo crm-institucional-dialogo fi-detalhes" aria-label={titulo||"Detalhes do registro institucional"} onCancel={e=>{e.preventDefault();if(!ocupado)fechar();}}><button className="btn crm-ficha-fechar" disabled={ocupado} aria-label="Fechar detalhes do registro" onClick={fechar}><X size={20}/></button><h2>{titulo||'Registro institucional'}</h2>{children}</dialog>;
}
export default function FunilInstitucional({db, usuario, mutar, institucionais, abrirInstitucional}) {
  const fluxo = db.funilInstitucional || funilVazio();
  const acesso = acessoCRM(usuario);
  const pode = acesso.admin, podeMunicipios = acesso.comercial;
  const [cadastrar,setCadastrar]=useState(false);
  const [nome,setNome] = useState(''), [uf,setUf] = useState('SC');
  const [ocupado,setOcupado] = useState(false), [erro,setErro] = useState('');
  const [cidadeId,setCidadeId] = useState(''),[nucleoNome,setNucleoNome] = useState('');
  const [carteira,setCarteira] = useState('reserva');
  const [selecionado,setSelecionado]=useState(null);
  const salvar = async acao => {
    if (!(acao.tipo==='cidade'?podeMunicipios:pode) || ocupado) return;
    setOcupado(true);setErro('');
    try {
      await mutar(d => {
        d.funilInstitucional = alterarFunil(d.funilInstitucional, {...acao, eventoId:crypto.randomUUID()}, {autor:usuario.nome});
        return d;
      }, 'Fluxo institucional atualizado', {detalhe:acao.tipo === 'cidade' ? 'Município no fluxo institucional' : 'Núcleo no fluxo institucional'});
      if(acao.tipo==='cidade'&&!fluxo.cidades.some(c=>c.id===acao.id)){setNome('');setCadastrar(false);}
      if(acao.tipo==='nucleo'&&!fluxo.nucleos.some(n=>n.nucleoId===acao.nucleoId))setNucleoNome('');
    } catch(e) {setErro(e.message || 'Não foi possível salvar o fluxo.');}
    finally {setOcupado(false);}
  };
  const verDetalhes=(tipo,id)=>{setErro('');setSelecionado({tipo,id});};
  const origem = c => institucionais?.find(i=>i.id===c.institucionalId);
  const nomeNucleo = item => item.nome || db.nucleos?.find(n=>n.id===item.nucleoId)?.codigo || null;
  const municipioNucleo = item => fluxo.cidades.find(c=>item.cidadeId?c.id===item.cidadeId:c.municipioId===item.municipioId);
  const etapaCidade = c => podeMunicipios&&<CampoCRM nome="Etapa municipal"><select className="inp" aria-label={`Etapa de ${c.nome||'município não informado'}`} disabled={ocupado} value={c.etapa} onChange={e=>salvar({tipo:'cidade',...c,etapa:e.target.value})}><option value="nuvens">Nuvens</option><option value="prospeccao">Prospecção</option>{c.etapa==='carteiras'&&<option value="carteiras">Núcleos nas etapas seguintes</option>}</select></CampoCRM>;
  const etapaNucleo = item => pode&&<CampoCRM nome="Mover para"><select className="inp" aria-label={`Carteira de ${nomeNucleo(item)||'núcleo não informado'}`} disabled={ocupado} value={item.carteira} onChange={e=>salvar({tipo:'nucleo',nucleoId:item.nucleoId,carteira:e.target.value})}>{CARTEIRAS_INSTITUCIONAIS.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></CampoCRM>;
  const cidade = (c,compacto=false) => <CardFunilInstitucional key={c.id} tipo="Município" titulo={municipioTexto(c)} municipio={municipioTexto(c)} referencia={c.etapa==='nuvens'?'Nuvens':c.etapa==='prospeccao'?'Prospecção':'Núcleos nas etapas seguintes'} etiquetas={etiquetasRegistro(c,c.etapa==='nuvens'?'Nuvens':'Prospecção',!!c.municipioId&&!c.institucionalId)} compacto={compacto} controleEtapa={etapaCidade(c)} abrirDetalhes={()=>verDetalhes('cidade',c.id)} abrirNegocio={origem(c)?()=>abrirInstitucional(origem(c)):null}/>;
  const detalheCidade = selecionado?.tipo==='cidade'&&fluxo.cidades.find(c=>c.id===selecionado.id);
  const detalheNucleo = selecionado?.tipo==='nucleo'&&fluxo.nucleos.find(n=>n.nucleoId===selecionado.id);
  const detalheMunicipio = detalheCidade||detalheNucleo&&municipioNucleo(detalheNucleo);
  const detalheTitulo = detalheCidade?municipioTexto(detalheCidade):detalheNucleo?nomeNucleo(detalheNucleo):null;
  const candidatos=fluxo.cidades.filter(c=>c.etapa==='nuvens'), prospectados=fluxo.cidades.filter(c=>c.etapa==='prospeccao');
  return <section className="card fi-painel" aria-label="Fluxo institucional integrado">
    <div className="cabeca"><div><h2>Fluxo institucional</h2><p className="ajuda">Fluxo próprio de municípios e núcleos. Prospecção acompanha até quatro municípios; as etapas seguintes acompanham seus núcleos.</p></div></div>
    {erro && !selecionado && <p role="alert" className="msg-erro">{erro}</p>}
    <section className="fi-nuvem" aria-label="Nuvens">
      <svg viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true"><path d="M120 96 C120 38 205 18 267 57 C294 1 394 0 440 44 C499 3 611 6 648 62 C725 20 829 43 838 99 C937 86 988 150 966 205 C1000 270 957 348 877 348 C855 408 757 416 704 380 C650 421 544 422 498 390 C441 426 337 416 303 380 C238 415 143 393 131 349 C47 367 2 302 29 245 C-9 183 33 104 120 96 Z"/></svg>
      <div className="fi-nuvem-cabeca"><h3><Cloud size={22} aria-hidden="true"/>Nuvens <span className="pill">{candidatos.length} município(s)</span></h3>{podeMunicipios&&<button type="button" className="btn btn-primario" onClick={()=>{setErro('');setCadastrar(true);}}><Plus size={18}/>Adicionar município</button>}</div>
      <div className="fi-nomes">{candidatos.map(c=>cidade(c,true))}{!candidatos.length&&<p className="ajuda">Nenhum município candidato.</p>}</div>
    </section>
    <details className="fi-candidatos"><summary>Gerenciar municípios nas Nuvens</summary>
      <div className="crm-grade">{candidatos.map(c=>cidade(c))}</div>

    </details>
      {cadastrar && podeMunicipios && <DetalhesFunil titulo="Adicionar município às Nuvens" ocupado={ocupado} fechar={()=>setCadastrar(false)}>{erro&&<p role="alert" className="msg-erro">{erro}</p>}<form className="crm-form fi-form" onSubmit={e=>{e.preventDefault();salvar({tipo:'cidade',id:crypto.randomUUID(),nome,uf,etapa:'nuvens'});}}>
        <CampoCRM nome="Município candidato"><input className="inp" autoFocus placeholder="Nome do município" required minLength={2} maxLength={120} value={nome} onChange={e=>setNome(e.target.value)}/></CampoCRM>
        <CampoCRM nome="UF"><input className="inp" required pattern="[A-Z]{2}" maxLength={2} value={uf} onChange={e=>setUf(e.target.value.toUpperCase())}/></CampoCRM>
        <button className="btn btn-primario" disabled={ocupado}><Plus size={17}/>Adicionar às Nuvens</button>
      </form></DetalhesFunil>}
    <div className="fi-conexao" aria-hidden="true"><ArrowDown size={22}/></div>
    <ol className="fi-resumo" aria-label="Formato do funil comercial">{[{nome:'Prospecção',total:`${prospectados.length}/4 municípios`},...CARTEIRAS_INSTITUCIONAIS.map(c=>({nome:c.nome,total:`${fluxo.nucleos.filter(n=>n.carteira===c.id).length} núcleo(s)`}))].map(c=><li key={c.nome}><strong>{c.nome}</strong><span>{c.total}</span></li>)}</ol>
    <h3>Quadro das quatro etapas</h3><p className="ajuda fi-mobile">Deslize o quadro para consultar todas as etapas.</p>
    <div className="fi-quadro-rolagem" role="region" aria-label="Quadro das quatro etapas" tabIndex={0}>
    <div className="crm-quadro fi-quadro">
      <section className="crm-coluna fi-etapa" aria-label="Prospecção municipal"><h3>Prospecção</h3><p className="ajuda">{prospectados.length}/4 municípios</p>{prospectados.map(c=>cidade(c))}{!prospectados.length&&<p className="fi-vazio">Nenhum município em prospecção.</p>}</section>
      {CARTEIRAS_INSTITUCIONAIS.map(c=><section key={c.id} className="crm-coluna fi-etapa" aria-label={`Carteira ${c.nome}`}><h3>{c.nome}</h3><p className="ajuda">{fluxo.nucleos.filter(n=>n.carteira===c.id).length} núcleo(s) · {c.descricao}</p>
        {fluxo.nucleos.filter(n=>n.carteira===c.id).map(item=>{
          const municipal=municipioNucleo(item),cliente=municipal&&origem(municipal);
          return <CardFunilInstitucional key={item.nucleoId} tipo="Núcleo" titulo={nomeNucleo(item)} municipio={municipioTexto(municipal)} referencia={c.nome} etiquetas={etiquetasRegistro(item,c.nome,!item.cidadeId)} controleEtapa={etapaNucleo(item)} abrirDetalhes={()=>verDetalhes('nucleo',item.nucleoId)} abrirNegocio={cliente?()=>abrirInstitucional(cliente):null}/>;
        })}{!fluxo.nucleos.some(n=>n.carteira===c.id)&&<p className="fi-vazio">Nenhum núcleo nesta etapa.</p>}
      </section>)}
    </div></div>
    {pode&&<details className="fi-candidatos"><summary>Adicionar núcleo institucional</summary><p className="ajuda">Cadastro próprio deste fluxo, vinculado a um município institucional. Um município pode ter vários núcleos.</p><form className="crm-form fi-form" onSubmit={e=>{e.preventDefault();salvar({tipo:'nucleo',nucleoId:crypto.randomUUID(),cidadeId,nome:nucleoNome,carteira});}}>
      <CampoCRM nome="Município institucional"><select className="inp" aria-label="Município institucional" required value={cidadeId} onChange={e=>setCidadeId(e.target.value)}><option value="">Selecione</option>{fluxo.cidades.filter(c=>['prospeccao','carteiras'].includes(c.etapa)).map(c=><option key={c.id} value={c.id}>{c.nome}/{c.uf}</option>)}</select></CampoCRM>
      <CampoCRM nome="Nome do núcleo"><input className="inp" required minLength={2} maxLength={120} value={nucleoNome} onChange={e=>setNucleoNome(e.target.value)}/></CampoCRM>
      <CampoCRM nome="Etapa"><select className="inp" value={carteira} onChange={e=>setCarteira(e.target.value)}>{CARTEIRAS_INSTITUCIONAIS.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></CampoCRM><button className="btn btn-primario" disabled={ocupado}>Adicionar núcleo</button>
    </form></details>}
    {selecionado&&<DetalhesFunil titulo={detalheTitulo} ocupado={ocupado} fechar={()=>setSelecionado(null)}>
      {erro&&<p role="alert" className="msg-erro">{erro}</p>}
      {!(detalheCidade||detalheNucleo)?<p>Registro indisponível. Feche os detalhes e atualize a tela.</p>:<>
        <dl className="fi-detalhes-campos"><dt>Tipo</dt><dd>{detalheCidade?'Município':'Núcleo'}</dd><dt>Identificação</dt><dd>{detalheTitulo||'Não informado'}</dd><dt>Município</dt><dd>{municipioTexto(detalheMunicipio)||'Não informado'}</dd><dt>Etapa</dt><dd>{detalheCidade?detalheCidade.etapa==='nuvens'?'Nuvens':detalheCidade.etapa==='prospeccao'?'Prospecção':'Núcleos nas etapas seguintes':CARTEIRAS_INSTITUCIONAIS.find(c=>c.id===detalheNucleo.carteira)?.nome||'Não informado'}</dd><dt>Etiquetas</dt><dd>{(Array.isArray((detalheCidade||detalheNucleo).etiquetas)?(detalheCidade||detalheNucleo).etiquetas.filter(x=>typeof x==='string'):[]).join(' · ')||'Sem etiquetas adicionais'}</dd></dl>
        {detalheMunicipio?.municipioId&&!detalheMunicipio.institucionalId&&<p className="ajuda">Vínculo anterior preservado.</p>}
        {detalheMunicipio?.institucionalId&&<p className="ajuda">Referência institucional anterior preservada: {origem(detalheMunicipio)?.nome||'registro indisponível'}.</p>}
        {podeMunicipios&&detalheCidade&&<div className="crm-form">{etapaCidade(detalheCidade)}</div>}
        {detalheNucleo&&<div className="crm-form">{etapaNucleo(detalheNucleo)}</div>}
        {detalheMunicipio&&origem(detalheMunicipio)&&<div className="crm-acoes"><button className="btn" onClick={()=>{setSelecionado(null);abrirInstitucional(origem(detalheMunicipio));}}>Abrir negócio</button></div>}
      </>}
    </DetalhesFunil>}
    <details className="fi-historico"><summary>Histórico do fluxo ({fluxo.historico.length})</summary>{[...fluxo.historico].reverse().map(h=><p key={h.id}>{new Date(h.data).toLocaleString('pt-BR')} — {h.autor}: {h.acao.tipo==='cidade'?`${h.acao.nome||'Município'} → ${h.acao.etapa||'vínculo atualizado'}`:`Núcleo → ${h.acao.carteira}`}</p>)}</details>
  </section>;
}

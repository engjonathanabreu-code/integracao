import {useState} from 'react';
import {ArrowDown,Cloud} from 'lucide-react';
import './funil-institucional.css';
import {acessoCRM} from './crm-regras.js';
import {alterarFunil, CARTEIRAS_INSTITUCIONAIS, funilVazio} from './funil-institucional.js';

export default function FunilInstitucional({db, usuario, mutar, ir}) {
  const fluxo = db.funilInstitucional || funilVazio();
  const pode = acessoCRM(usuario).admin;
  const [nome,setNome] = useState(''), [uf,setUf] = useState('SC');
  const [ocupado,setOcupado] = useState(false), [erro,setErro] = useState('');
  const [nucleoId,setNucleoId] = useState('');
  const [carteira,setCarteira] = useState('reserva');
  const salvar = async acao => {
    if (!pode || ocupado) return;
    setOcupado(true);setErro('');
    try {
      await mutar(d => {
        d.funilInstitucional = alterarFunil(d.funilInstitucional, {...acao, eventoId:crypto.randomUUID()}, {municipios:d.municipios,nucleos:d.nucleos,autor:usuario.nome});
        return d;
      }, 'Fluxo institucional atualizado', {detalhe:acao.tipo === 'cidade' ? 'Cidade no fluxo institucional' : 'Núcleo vinculado à carteira institucional'});
      setNome('');
    } catch(e) {setErro(e.message || 'Não foi possível salvar o fluxo.');}
    finally {setOcupado(false);}
  };
  const municipios = db.municipios || [], nucleos = db.nucleos || [];
  const cidade = c => <article key={c.id} className="fi-registro">
    <strong>{c.nome}/{c.uf}</strong>
    <div className="ajuda">{c.municipioId ? 'Vinculado ao cadastro municipal' : 'Candidata, ainda sem vínculo cadastral'}</div>
    {c.municipioId && <button className="btn btn-sm" onClick={() => ir({pag:'municipio',id:c.municipioId})}>Abrir município</button>}
    {pode && <details><summary>Vínculo e etapa</summary>
      <label className="rot">Município cadastrado<select className="inp" aria-label={`Vincular município de ${c.nome}`} disabled={ocupado} value={c.municipioId || ''} onChange={e => salvar({tipo:'cidade',...c,municipioId:e.target.value || null})}><option value="">Sem vínculo</option>{municipios.map(m => <option key={m.id} value={m.id}>{m.nome}/{m.uf}</option>)}</select></label>
      <label className="rot">Etapa municipal<select className="inp" aria-label={`Etapa de ${c.nome}`} disabled={ocupado} value={c.etapa} onChange={e => salvar({tipo:'cidade',...c,etapa:e.target.value})}><option value="nuvens">Nuvens</option><option value="prospeccao">Prospecção</option>{c.etapa === 'carteiras' && <option value="carteiras">Núcleos nas carteiras</option>}</select></label>
    </details>}
  </article>;
  return <section className="card fi-painel" aria-label="Fluxo institucional integrado">
    <h2>Fluxo institucional</h2><p className="ajuda fi-intro">Das cidades candidatas aos núcleos em venda. Prospecção acompanha até quatro municípios; cada município pode ter vários núcleos nas etapas seguintes.</p>
    {erro && <p role="alert" className="msg-erro">{erro}</p>}
    <section className="fi-nuvem" aria-label="Nuvens">
      <svg className="fi-nuvem-topo" viewBox="0 0 320 50" preserveAspectRatio="none" aria-hidden="true"><path d="M1 50 C1 25 30 14 56 28 C67 3 106 2 126 24 C151 5 191 6 210 27 C235 9 274 19 277 35 C300 30 319 36 319 50"/></svg>
      <svg className="fi-nuvem-contorno" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true"><path d="M120 96 C120 38 205 18 267 57 C294 1 394 0 440 44 C499 3 611 6 648 62 C725 20 829 43 838 99 C937 86 988 150 966 205 C1000 270 957 348 877 348 C855 408 757 416 704 380 C650 421 544 422 498 390 C441 426 337 416 303 380 C238 415 143 393 131 349 C47 367 2 302 29 245 C-9 183 33 104 120 96 Z"/></svg>
      <h3><Cloud size={24} aria-hidden="true"/>Nuvens <span className="fi-total">{fluxo.cidades.filter(c=>c.etapa==='nuvens').length} cidade(s)</span></h3><p className="ajuda">Cidades candidatas que orientam a atuação comercial.</p>
      <div className="fi-cidades">{fluxo.cidades.filter(c => c.etapa === 'nuvens').map(cidade)}</div>
    </section>
      {pode && <form className="fi-form" onSubmit={e => {e.preventDefault();salvar({tipo:'cidade',id:crypto.randomUUID(),nome,uf,etapa:'nuvens'});}}>
        <label className="rot">Cidade candidata<input className="inp" required minLength={2} maxLength={120} value={nome} onChange={e => setNome(e.target.value)}/></label>
        <label className="rot fi-uf">UF<input className="inp" required pattern="[A-Z]{2}" maxLength={2} value={uf} onChange={e => setUf(e.target.value.toUpperCase())}/></label>
        <button className="btn" disabled={ocupado}>Adicionar às Nuvens</button>
      </form>}
    <div className="fi-conexao" aria-hidden="true"><ArrowDown size={24}/></div>
    <ol className="fi-funil" aria-label="Etapas do funil institucional">
    <li className="fi-etapa" style={{'--fi-largura':'100%','--fi-indice':0}}><section aria-label="Prospecção municipal"><header className="fi-etapa-cabeca"><span className="fi-numero" aria-hidden="true">1</span><div><h3>Prospecção <span className="fi-total">{fluxo.cidades.filter(c => c.etapa === 'prospeccao').length}/4 municípios</span></h3><p className="ajuda">Municípios em prospecção institucional.</p></div></header>
      <div className="fi-cidades">{fluxo.cidades.filter(c => c.etapa === 'prospeccao').map(cidade)}</div>
    </section></li>

      {CARTEIRAS_INSTITUCIONAIS.map((c,i) => <li key={c.id} className="fi-etapa" style={{'--fi-largura':`${88-i*12}%`,'--fi-indice':i+1}}><section aria-label={`Carteira ${c.nome}`}><header className="fi-etapa-cabeca"><span className="fi-numero" aria-hidden="true">{i+2}</span><div><h3>{c.nome} <span className="fi-total">{fluxo.nucleos.filter(n => n.carteira === c.id).length} núcleo(s)</span></h3><p className="ajuda">{c.descricao}</p></div></header><div className="fi-cidades">
        {fluxo.nucleos.filter(n => n.carteira === c.id).map(item => {const n = nucleos.find(n => n.id === item.nucleoId);return <article className="fi-registro" key={item.nucleoId}><strong>{n?.codigo || 'Núcleo indisponível'}</strong><p>{municipios.find(m => m.id === item.municipioId)?.nome || 'Município vinculado indisponível'}</p>{n && <button className="btn btn-sm" onClick={() => ir({pag:'nucleo',id:n.id})}>Abrir núcleo</button>}{pode && n && <label className="rot">Mover para<select className="inp" aria-label={`Carteira de ${n.codigo}`} disabled={ocupado} value={item.carteira} onChange={e => salvar({tipo:'nucleo',nucleoId:n.id,carteira:e.target.value})}>{CARTEIRAS_INSTITUCIONAIS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}</article>;})}
      </div></section></li>)}
    </ol>
    {pode && <form className="fi-form" onSubmit={e => {e.preventDefault();salvar({tipo:'nucleo',nucleoId,carteira});}}>
      <label className="rot">Núcleo do município prospectado<select className="inp" required value={nucleoId} onChange={e => setNucleoId(e.target.value)}><option value="">Selecione</option>{nucleos.filter(n => fluxo.cidades.some(c => c.municipioId === n.municipioId && c.etapa !== 'nuvens')).map(n => <option key={n.id} value={n.id}>{n.codigo} — {municipios.find(m => m.id === n.municipioId)?.nome}</option>)}</select></label>
      <label className="rot">Carteira<select className="inp" value={carteira} onChange={e => setCarteira(e.target.value)}>{CARTEIRAS_INSTITUCIONAIS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <button className="btn" disabled={ocupado}>Vincular núcleo à carteira</button>
    </form>}

    <details className="fi-historico"><summary>Histórico do fluxo ({fluxo.historico.length})</summary>{[...fluxo.historico].reverse().map(h => <p key={h.id}>{new Date(h.data).toLocaleString('pt-BR')} — {h.autor}: {h.acao.tipo === 'cidade' ? `${h.acao.nome || 'Município'} → ${h.acao.etapa || 'vínculo atualizado'}` : `Núcleo → ${h.acao.carteira}`}</p>)}</details>
  </section>;
}

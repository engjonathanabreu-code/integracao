import {useState} from 'react';
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
  const cidade = c => <article key={c.id} className="card" style={{padding:12,marginTop:8}}>
    <strong>{c.nome}/{c.uf}</strong>
    <div className="ajuda">{c.municipioId ? 'Vinculado ao cadastro municipal' : 'Candidata, ainda sem vínculo cadastral'}</div>
    {c.municipioId && <button className="btn btn-sm" onClick={() => ir({pag:'municipio',id:c.municipioId})}>Abrir município</button>}
    {pode && <>
      <label className="rot">Município cadastrado<select className="inp" aria-label={`Vincular município de ${c.nome}`} disabled={ocupado} value={c.municipioId || ''} onChange={e => salvar({tipo:'cidade',...c,municipioId:e.target.value || null})}><option value="">Sem vínculo</option>{municipios.map(m => <option key={m.id} value={m.id}>{m.nome}/{m.uf}</option>)}</select></label>
      <label className="rot">Etapa municipal<select className="inp" aria-label={`Etapa de ${c.nome}`} disabled={ocupado} value={c.etapa} onChange={e => salvar({tipo:'cidade',...c,etapa:e.target.value})}><option value="nuvens">Nuvens</option><option value="prospeccao">Prospecção</option>{c.etapa === 'carteiras' && <option value="carteiras">Núcleos nas carteiras</option>}</select></label>
    </>}
  </article>;
  return <section className="card" style={{padding:16,marginBottom:20}} aria-label="Fluxo institucional integrado">
    <h2>Fluxo institucional</h2><p className="ajuda">Nuvens → Prospecção de municípios → Reserva → Preparação → Venda dos núcleos vinculados. Nenhum cadastro é criado ou convertido automaticamente.</p>
    {erro && <p role="alert" className="msg-erro">{erro}</p>}
    <section aria-label="Nuvens"><h3>Nuvens</h3><p className="ajuda">Cidades candidatas que orientam a atuação comercial.</p>
      {pode && <form className="flex gap-2 flex-wrap" onSubmit={e => {e.preventDefault();salvar({tipo:'cidade',id:crypto.randomUUID(),nome,uf,etapa:'nuvens'});}}>
        <label className="rot">Cidade candidata<input className="inp" required minLength={2} maxLength={120} value={nome} onChange={e => setNome(e.target.value)}/></label>
        <label className="rot">UF<input className="inp" required pattern="[A-Z]{2}" maxLength={2} value={uf} onChange={e => setUf(e.target.value.toUpperCase())}/></label>
        <button className="btn" disabled={ocupado}>Adicionar às Nuvens</button>
      </form>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:8}}>{fluxo.cidades.filter(c => c.etapa === 'nuvens').map(cidade)}</div>
    </section>
    <section aria-label="Prospecção municipal"><h3>Prospecção — {fluxo.cidades.filter(c => c.etapa === 'prospeccao').length}/4 municípios</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:8}}>{fluxo.cidades.filter(c => c.etapa === 'prospeccao').map(cidade)}</div>
    </section>
    {pode && <form className="flex gap-2 flex-wrap" onSubmit={e => {e.preventDefault();salvar({tipo:'nucleo',nucleoId,carteira});}}>
      <label className="rot">Núcleo do município prospectado<select className="inp" required value={nucleoId} onChange={e => setNucleoId(e.target.value)}><option value="">Selecione</option>{nucleos.filter(n => fluxo.cidades.some(c => c.municipioId === n.municipioId && c.etapa !== 'nuvens')).map(n => <option key={n.id} value={n.id}>{n.codigo} — {municipios.find(m => m.id === n.municipioId)?.nome}</option>)}</select></label>
      <label className="rot">Carteira<select className="inp" value={carteira} onChange={e => setCarteira(e.target.value)}>{CARTEIRAS_INSTITUCIONAIS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <button className="btn" disabled={ocupado}>Vincular núcleo à carteira</button>
    </form>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,240px),1fr))',gap:12,marginTop:16}}>
      {CARTEIRAS_INSTITUCIONAIS.map(c => <section key={c.id} aria-label={`Carteira ${c.nome}`}><h3>{c.nome} — {fluxo.nucleos.filter(n => n.carteira === c.id).length}</h3><p className="ajuda">{c.descricao}</p>
        {fluxo.nucleos.filter(n => n.carteira === c.id).map(item => {const n = nucleos.find(n => n.id === item.nucleoId);return <article className="card" style={{padding:12,marginTop:8}} key={item.nucleoId}><strong>{n?.codigo || 'Núcleo indisponível'}</strong><p>{municipios.find(m => m.id === item.municipioId)?.nome || 'Município vinculado indisponível'}</p>{n && <button className="btn btn-sm" onClick={() => ir({pag:'nucleo',id:n.id})}>Abrir núcleo</button>}{pode && n && <label className="rot">Mover para<select className="inp" aria-label={`Carteira de ${n.codigo}`} disabled={ocupado} value={item.carteira} onChange={e => salvar({tipo:'nucleo',nucleoId:n.id,carteira:e.target.value})}>{CARTEIRAS_INSTITUCIONAIS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}</article>;})}
      </section>)}
    </div>
    <details style={{marginTop:16}}><summary>Histórico do fluxo ({fluxo.historico.length})</summary>{[...fluxo.historico].reverse().map(h => <p key={h.id}>{new Date(h.data).toLocaleString('pt-BR')} — {h.autor}: {h.acao.tipo === 'cidade' ? `${h.acao.nome || 'Município'} → ${h.acao.etapa || 'vínculo atualizado'}` : `Núcleo → ${h.acao.carteira}`}</p>)}</details>
  </section>;
}

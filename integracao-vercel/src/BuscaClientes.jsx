import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {Search} from 'lucide-react';
import {lerIndiceClientes, obterIndiceClientes} from './dados-compartilhados.js';
import {filtrarClientes, reunirClientes} from './busca-clientes.js';

// Same input used by the previous municipality step and both client searches.
export function CampoBusca(props) {
  return <div style={{flex:'1 1 240px', maxWidth:360, position:'relative'}}>
    <Search aria-hidden="true" size={16} style={{position:'absolute', left:11, top:11, color:'var(--muted)'}} />
    <input {...props} className="inp" style={{paddingLeft:34}} />
  </div>;
}

export function BuscaClientes({db, municipioId, abrirCliente, demo=false, autoFocus=false, emModal=false}) {
  const id = useId();
  const [busca, setBusca] = useState('');
  const [indice, setIndice] = useState(() => demo ? {clientes:[], complementos:[]} : obterIndiceClientes());
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [abrindo, setAbrindo] = useState(false);
  const lista = useRef(null);
  useEffect(() => {
    let vivo = true;
    setErro('');
    if (demo) { setIndice({clientes:[], complementos:[]}); return; }
    lerIndiceClientes().then(r => { if (vivo) setIndice(r); }).catch(e => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [demo, tentativa]);
  const clientes = useMemo(() => reunirClientes(indice?.clientes || [], indice?.complementos || [], db._baseArquivo || db), [indice, db]);
  const resultados = useMemo(() => filtrarClientes(clientes, busca, municipioId), [clientes, busca, municipioId]);
  const visivel = aberto && !!busca.trim();
  useEffect(() => { lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'}); }, [ativo]);
  const escolher = async p => {
    if (abrindo) return;
    setAbrindo(true); setErro('');
    try { await abrirCliente(p); setAberto(false); } catch(e) { setErro(e.message); }
    finally { setAbrindo(false); }
  };
  return <div style={{position:'relative', width:'100%', maxWidth:520}} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setAberto(false); }}>
    <CampoBusca id={id} autoFocus={autoFocus} autoComplete="off" role="combobox" aria-label="Buscar cliente por nome ou código" aria-autocomplete="list" aria-expanded={visivel} aria-controls={`${id}-lista`} aria-activedescendant={visivel && ativo >= 0 && resultados[ativo] ? `${id}-${ativo}` : undefined}
      placeholder="Buscar cliente por nome ou código" value={busca} onFocus={() => setAberto(true)} onChange={e => {setBusca(e.target.value); setAtivo(-1); setAberto(true);}}
      onKeyDown={e => {
        if (e.key === 'Escape') {setAberto(false); e.stopPropagation();}
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {e.preventDefault(); setAberto(true); setAtivo(v => Math.max(0, Math.min(resultados.length - 1, v + (e.key === 'ArrowDown' ? 1 : -1))));}
        if (e.key === 'Enter' && visivel && resultados[ativo]) {e.preventDefault(); escolher(resultados[ativo]);}
      }} />
    {visivel && <div className="lista-busca" id={`${id}-lista`} role="listbox" aria-label="Clientes encontrados" ref={lista} style={{position:emModal ? 'relative' : 'absolute', zIndex:30, width:'100%', maxHeight:300, overflowY:'auto', background:'var(--card, white)', boxShadow:'0 8px 20px #1233'}}>
      {resultados.map((p,i) => <button type="button" key={p.id} id={`${id}-${i}`} className={`item-busca${ativo === i ? ' ativo' : ''}`} role="option" aria-selected={ativo === i} disabled={abrindo} onMouseDown={e => e.preventDefault()} onClick={() => escolher(p)}>
        <span><strong>{p.requerente?.nome || 'Cliente sem nome'}</strong><span className="ajuda" style={{display:'block', margin:0}}>{p.codigo || 'Sem código'} · {p.requerente?.tipoPessoa === 'juridica' ? 'PJ' : 'PF'} · {db.municipios.find(m => m.id === p.municipioId)?.nome || 'Sem município'}{!p.remessaId ? ' · Sem remessa' : ''}</span></span>
      </button>)}
      {!resultados.length && <div className="ajuda" style={{padding:10}}>{indice ? 'Nenhum cliente encontrado.' : erro ? 'Busca indisponível.' : 'Carregando clientes…'}</div>}
    </div>}
    <div className="ajuda" role="status">{abrindo ? 'Abrindo ficha do cliente…' : !indice && !erro ? 'Carregando clientes…' : busca.trim() ? `${resultados.length} cliente(s) encontrado(s).` : 'Pesquise PF ou PJ por nome, prefixo ou código.'}</div>
    {erro && <div role="alert" className="msg-erro">{erro} <button className="btn btn-sm" onClick={() => setTentativa(v => v+1)}>Tentar novamente</button></div>}
  </div>;
}

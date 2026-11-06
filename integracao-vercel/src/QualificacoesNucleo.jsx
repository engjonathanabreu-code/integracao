import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { carregarTodasQualificacoes, prepararQualificacoesCopia, textoLimpoQualificacao } from './qualificacoes-nucleo.js';

const TAMANHO_PAGINA = 30;

export default function QualificacoesNucleo({ nucleoId, carregarPagina, resolverQualificacao, identificarUnidades, onAbrir, revisao = 0 }) {
  const [busca, setBusca] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(0);
  const [estado, setEstado] = useState({ items: [], total: 0, carregando: true, erro: '' });
  const [selecionados, setSelecionados] = useState(new Set());
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [atualizacao, setAtualizacao] = useState(0);
  const request = useRef(0);
  const loader = useRef(carregarPagina); loader.current = carregarPagina;
  useEffect(() => {
    const timer = setTimeout(() => { setConsulta(busca.trim()); setPagina(0); setSelecionados(new Set()); }, 250);
    return () => clearTimeout(timer);
  }, [busca]);
  useEffect(() => { setPagina(0); setSelecionados(new Set()); setBusca(''); }, [nucleoId]);
  useEffect(() => {
    const id = ++request.current;
    setEstado(x => ({ ...x, carregando: true, erro: '' }));
    Promise.resolve().then(() => loader.current({ nucleoId, busca: consulta, offset: pagina * TAMANHO_PAGINA, limit: TAMANHO_PAGINA }))
      .then(r => {
        if (id !== request.current) return;
        if (!Array.isArray(r?.items) || !Number.isInteger(r.total)) throw new Error('Não foi possível carregar os moradores do núcleo.');
        if (pagina && pagina * TAMANHO_PAGINA >= r.total) { setPagina(0); return; }
        setEstado({ ...r, carregando: false, erro: '' });
      }).catch(e => { if (id === request.current) setEstado(x => ({ ...x, items: [], carregando: false, erro: e.message })); });
    return () => { request.current++; };
  }, [nucleoId, consulta, pagina, revisao, atualizacao]);
  const alternar = id => setSelecionados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const copiar = async (alvo, processo) => {
    if (copiando) return;
    setCopiando(true); setAviso('');
    try {
      let itens;
      if (alvo === 'um') {
        const r = await loader.current({ nucleoId, ids: [processo.id], offset: 0, limit: 1 });
        if (r?.total !== 1 || r.items?.[0]?.id !== processo.id) throw new Error('O cadastro mudou ou não está mais disponível. Atualize a lista.');
        itens = r.items;
      } else {
        itens = await carregarTodasQualificacoes(loader.current, { nucleoId, ...(alvo === 'selecionados' ? { ids: [...selecionados] } : { busca: consulta }) });
        if (alvo === 'selecionados' && (itens.length !== selecionados.size || itens.some(p => !selecionados.has(p.id)))) throw new Error('Um dos moradores selecionados não está mais disponível. Atualize a lista.');
      }
      if (!itens.length) throw new Error('Nenhum morador selecionado.');
      const texto = alvo === 'um' ? textoLimpoQualificacao(resolverQualificacao(itens[0]).texto) : prepararQualificacoesCopia(itens, resolverQualificacao);
      await navigator.clipboard.writeText(texto);
      setAviso(`${itens.length === 1 ? 'Qualificação copiada' : `${itens.length} qualificações copiadas`}.`);
    } catch (e) { setAviso(e.message || 'Não foi possível copiar. Tente novamente.'); }
    finally { setCopiando(false); }
  };
  return <section aria-label="Qualificações dos moradores" className="card" style={{ padding: 18 }}>
    <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 12 }}>
      <div><h3 style={{ margin: 0, color: 'var(--titulo)' }}>Qualificações</h3><p className="ajuda">Consulte e copie os textos dos cadastros vinculados a este núcleo.</p></div>
      <button type="button" className="btn btn-sm" onClick={() => setAtualizacao(x => x + 1)} disabled={estado.carregando}><RefreshCw size={14} />Atualizar</button>
    </div>
    <label className="flex items-center gap-2" style={{ marginBottom: 12 }}><Search size={17} /><input className="inp" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou código" aria-label="Buscar qualificações por nome ou código" /></label>
    <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
      <button type="button" className="btn btn-sm" disabled={!selecionados.size || copiando} onClick={() => copiar('selecionados')}><Copy size={14} />Copiar selecionados ({selecionados.size})</button>
      <button type="button" className="btn btn-sm" disabled={!estado.total || estado.carregando || copiando} onClick={() => copiar('todos')}><Copy size={14} />Copiar todos os resultados ({estado.total})</button>
      {!!selecionados.size && <button type="button" className="btn btn-sm" onClick={() => setSelecionados(new Set())}>Limpar seleção</button>}
    </div>
    {aviso && <p role="status" className="ajuda">{aviso}</p>}
    {estado.erro && <p role="alert" className="msg-erro">{estado.erro}</p>}
    {estado.carregando ? <p role="status">Carregando qualificações…</p> : <>
      {!estado.items.length && !estado.erro && <p className="ajuda">Nenhum morador encontrado.</p>}
      {estado.items.map(p => {
        const q = resolverQualificacao(p);
        const unidades = identificarUnidades?.(p) || (p.unidades || []).map(u => u.loteQuadra || u.id).filter(Boolean).join(', ');
        return <article key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} /><strong style={{ color: 'var(--titulo)' }}>{p.codigo || 'Sem código'} — {p.requerente?.nome || 'Nome não informado'}</strong></label>
            <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-sm" disabled={copiando} onClick={() => copiar('um', p)}><Copy size={14} />Copiar qualificação</button><button type="button" className="btn btn-sm" onClick={() => onAbrir(p)}><ExternalLink size={14} />Abrir cadastro</button></div>
          </div>
          {unidades && <p className="ajuda">Unidade(s): {unidades}</p>}
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.65, margin: '10px 0 0' }}>{textoLimpoQualificacao(q.texto) || 'Qualificação não informada.'}</p>
          {!!q.faltas?.length && <p style={{ color: 'var(--danger)', marginBottom: 0 }}><AlertTriangle size={14} style={{ display: 'inline' }} /> Faltam dados: {[...new Set(q.faltas)].join(', ')}.</p>}
          {q.desatualizada && <p className="ajuda"><AlertTriangle size={14} style={{ display: 'inline' }} /> O cadastro mudou após a edição manual deste texto. Confira no cadastro de origem.</p>}
        </article>;
      })}
      {estado.total > TAMANHO_PAGINA && <nav aria-label="Páginas de qualificações" className="flex flex-wrap items-center justify-between gap-2"><button className="btn btn-sm" disabled={!pagina} onClick={() => setPagina(x => x - 1)}>Anterior</button><span className="ajuda">Página {pagina + 1} de {Math.ceil(estado.total / TAMANHO_PAGINA)} · {estado.total} moradores</span><button className="btn btn-sm" disabled={(pagina + 1) * TAMANHO_PAGINA >= estado.total} onClick={() => setPagina(x => x + 1)}>Próxima</button></nav>}
    </>}
  </section>;
}

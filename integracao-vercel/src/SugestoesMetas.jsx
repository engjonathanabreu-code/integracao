import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, Plus } from 'lucide-react';
import { SETORES_PAINEL, setorDaMeta } from './agentes-ia.js';
import { guardado, pedirAgentes } from './agentes-api.js';
import './agentes.css';

// Suggestions are an AI call, so they are kept for 30 minutes per sector in
// this browser tab instead of being asked again on every open of the dialog.
const VALIDADE = 30 * 60000;
const chave = setor => `integracao-sugestoes-metas-${setor}`;

export default function SugestoesMetas({ setorMeta, onUsar }) {
  const setor = setorDaMeta(setorMeta);
  const [estado, setEstado] = useState({ ocupado: false, erro: '', setor: '', sugestoes: [] });
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    const cache = pedido === 0 ? guardado.ler(chave(setor)) : null;
    if (cache && Date.now() - cache.em < VALIDADE && cache.sugestoes?.length) { setEstado({ ocupado: false, erro: '', setor, sugestoes: cache.sugestoes }); return undefined; }
    let vivo = true;
    // A short wait so flipping through the sector list does not fire one call per option.
    const espera = setTimeout(() => {
      setEstado({ ocupado: true, erro: '', setor, sugestoes: [] });
      pedirAgentes({ modo: 'sugestoes', setor }, 120000)
        .then(r => { if (!vivo) return; guardado.gravar(chave(setor), { em: Date.now(), sugestoes: r.sugestoes }); setEstado({ ocupado: false, erro: '', setor, sugestoes: r.sugestoes }); })
        .catch(e => { if (vivo) setEstado({ ocupado: false, erro: e.message, setor, sugestoes: [] }); });
    }, 600);
    return () => { vivo = false; clearTimeout(espera); };
  }, [setor, pedido]);

  return (
    <aside className="sugestoes-metas" aria-label="Metas sugeridas pelo agente">
      <header>
        <h3><Sparkles size={16} aria-hidden="true" />Sugestões do agente</h3>
        <button type="button" className="btn-icone" disabled={estado.ocupado} onClick={() => setPedido(p => p + 1)} aria-label="Gerar outras sugestões" title="Gerar outras sugestões"><RefreshCw size={14} className={estado.ocupado ? 'girando' : ''} /></button>
      </header>
      <p className="ajuda">Três metas tiradas do panorama de {SETORES_PAINEL[setor].nome.toLowerCase()}. Escolha o setor da meta para mudar o foco.</p>
      {estado.ocupado && <p className="ajuda">Lendo os dados do setor…</p>}
      {estado.erro && <div className="msg-erro"><AlertTriangle size={14} />{estado.erro}</div>}
      {estado.sugestoes.map((s, i) => (
        <article key={i} className="sugestao-meta">
          <strong>{s.titulo}</strong>
          {s.motivo && <p>{s.motivo}</p>}
          {s.checklist.length > 0 && <ul>{s.checklist.map((c, j) => <li key={j}>{c}</li>)}</ul>}
          <div className="sugestao-meta-rodape">
            <span className="ajuda">Prazo sugerido: {s.prazoDias} dias</span>
            <button type="button" className="btn btn-sm" onClick={() => onUsar(s)}><Plus size={13} />Usar</button>
          </div>
        </article>
      ))}
      {!estado.ocupado && !estado.erro && estado.sugestoes.length > 0 && <p className="ajuda">Sugestão de IA: revise título, prazo e responsáveis antes de salvar.</p>}
    </aside>
  );
}

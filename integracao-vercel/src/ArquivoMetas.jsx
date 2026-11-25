import { useState } from 'react';
import { FolderOpen, Undo2 } from 'lucide-react';
import { metasArquivadas, podeArquivarMeta, restaurarMeta, resumoMetaArquivada } from './metas-arquivo.js';

// Lista das metas arquivadas, com o motivo, e a restauração. Só a Diretoria vê.
export default function ArquivoMetas({ metas, usuario, mutar, setToast, registrarHistorico, Modal }) {
  const [aberto, setAberto] = useState(false), [busca, setBusca] = useState('');
  if (!podeArquivarMeta(usuario)) return null;
  const lista = metasArquivadas(metas).map(resumoMetaArquivada);
  const normalizar = texto => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
  const visiveis = lista.filter(m => normalizar(`${m.titulo} ${m.setor} ${m.motivo}`).includes(normalizar(busca)));
  const restaurar = m => {
    try {
      Promise.resolve(mutar(d => { restaurarMeta(d, m.id, usuario); const meta = d.metas.find(x => x.id === m.id); if (meta) registrarHistorico?.(d, meta, 'Restaurada', `Meta restaurada do arquivo por ${usuario.nome}.`, usuario); return d; }, 'Meta restaurada', { detalhe: `${m.titulo}. Meta restaurada do arquivo.` })).catch(e => setToast(e.message));
      setToast('Meta restaurada. Acompanhe a confirmação de gravação.');
    } catch (e) { setToast(e.message); }
  };
  return <>
    <div className="flex flex-wrap gap-2" style={{ marginBottom: 12 }}><button type="button" className="btn btn-sm" onClick={() => { setBusca(''); setAberto(true); }}><FolderOpen size={14} />Arquivo de metas{lista.length ? ` (${lista.length})` : ''}</button></div>
    {aberto && <Modal titulo="Arquivo de metas" largura={760} onFechar={() => setAberto(false)}>
      <p>As metas arquivadas ficam fora das listas e dos indicadores. Checklist, comentários, anexos e histórico continuam guardados e voltam junto ao restaurar.</p>
      <input className="inp" aria-label="Buscar no arquivo de metas" placeholder="Buscar por título, setor ou motivo" value={busca} onChange={e => setBusca(e.target.value)} />
      {!visiveis.length && <p>Nenhuma meta arquivada.</p>}
      {visiveis.map(m => <div key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line2)' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>{m.titulo}</strong>
          <div className="ajuda">{[m.setor, m.status].filter(Boolean).join(' · ')}{m.arquivadoPor ? ` · Arquivada por ${m.arquivadoPor}` : ''}{m.arquivadoEm ? ` em ${new Date(m.arquivadoEm).toLocaleString('pt-BR')}` : ''}</div>
          <div>Motivo: {m.motivo || 'não informado'}</div>
          <div className="ajuda">{m.checklist} item(ns) de checklist · {m.comentarios} comentário(s) · {m.arquivos} anexo(s)</div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => restaurar(m)}><Undo2 size={14} />Restaurar</button>
      </div>)}
    </Modal>}
  </>;
}

import { useMemo, useState } from 'react';
import { prepararPauta, textoPauta } from './briefing-diretoria.js';

export default function BriefingDiretoria({ dados, indisponivel = false }) {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState('');
  const pauta = useMemo(() => prepararPauta(dados), [dados]);
  const conteudo = useMemo(() => textoPauta(pauta), [pauta]);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(conteudo);
      setAviso('Pauta copiada. Revise antes de compartilhar.');
    } catch { setAviso('Não foi possível copiar automaticamente. Selecione e copie o texto abaixo.'); }
  }
  return <section className="agente-acoes" aria-label="Preparação da reunião de gestão">
    <h3>Reunião de gestão</h3>
    <p className="ajuda">Transforme os registros deste panorama em pauta com evidências, próximos passos e espaço para decisões. Sem nova consulta à IA ou alterações no sistema.</p>
    <button type="button" className="btn" disabled={indisponivel} aria-expanded={aberto} onClick={() => { setAberto(!aberto); setAviso(''); }}>{aberto ? 'Recolher pauta' : 'Preparar reunião de gestão'}</button>
    {aberto && !indisponivel && <>
      <p className="ajuda">Pauta parcial para revisão. Copiar não envia nem salva decisões. Consulte os registros antes de agir.</p>
      <button type="button" className="btn" onClick={copiar}>Copiar pauta</button>
      <p role="status">{aviso}</p>
      <label className="rot" htmlFor="pauta-diretoria">Pauta editável em sua cópia</label>
      <textarea id="pauta-diretoria" className="inp" readOnly value={conteudo} rows={16} style={{ width: '100%', resize: 'vertical' }} />
    </>}
    {indisponivel && <p className="ajuda">Aguarde uma leitura válida do panorama para preparar ou copiar a pauta.</p>}
  </section>;
}

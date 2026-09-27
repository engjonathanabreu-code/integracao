import { useState } from 'react';
import { Sun, Moon, Palette } from 'lucide-react';

// Preview-only preference: never writes to a profile or the shared database.
export function useTemaPrevia() {
  const [tema, definir] = useState(() => {
    try { const v = sessionStorage.getItem('integracao-ui-preview-tema'); return ['claro','escuro'].includes(v) ? v : null; }
    catch { return null; }
  });
  return [tema, valor => {
    definir(valor);
    try { if (valor) sessionStorage.setItem('integracao-ui-preview-tema', valor); else sessionStorage.removeItem('integracao-ui-preview-tema'); }
    catch { /* The comparison still works without browser storage. */ }
  }];
}

export default function UiGuidePreview({ tema, escolher, personalizado }) {
  return <aside className="ui-preview-bar" aria-label="Prévia do novo visual">
    <div className="ui-preview-label"><Palette size={18} aria-hidden="true" /><div><strong>Prévia do novo visual</strong><span>Dados reais · Salvar altera os registros do sistema</span></div></div>
    <div className="ui-preview-temas" role="group" aria-label="Comparar temas">
      <button type="button" className="btn btn-sm" aria-pressed={tema === 'claro'} onClick={() => escolher('claro')}><Sun size={15} aria-hidden="true" />Claro</button>
      <button type="button" className="btn btn-sm" aria-pressed={tema === 'escuro'} onClick={() => escolher('escuro')}><Moon size={15} aria-hidden="true" />Escuro</button>
      {personalizado && <button type="button" className="btn-link" onClick={() => escolher(null)}>Usar tema do perfil</button>}
    </div>
  </aside>;
}

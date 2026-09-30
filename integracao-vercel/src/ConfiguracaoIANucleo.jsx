import {useState} from 'react';
import {listarCRM, criarCRM, editarCRM} from './crm-api.js';
import {useModulo, EstadoModulo} from './modulo-ui.jsx';

function Editor({modulo, nucleoId}) {
  const atual = modulo.dados[0];
  const [habilitado, setHabilitado] = useState(atual?.habilitado ?? true);
  const [instrucao, setInstrucao] = useState(atual?.instrucao || 'Responda somente com os andamentos liberados deste núcleo. Não invente prazos nem exponha observações internas.');
  const [salvo, setSalvo] = useState(false);
  const salvar = async e => {
    e.preventDefault(); setSalvo(false);
    const dados = {habilitado, instrucao: instrucao.trim()};
    setSalvo(await modulo.executar(() => atual ? editarCRM('integracao_nucleo_ia', nucleoId, dados) : criarCRM('integracao_nucleo_ia', {id: nucleoId, ...dados})));
  };
  return <form onSubmit={salvar} style={{paddingTop: 10}}>
    <label className="flex items-center gap-2"><input type="checkbox" checked={habilitado} onChange={e => setHabilitado(e.target.checked)} />Autorizar atendimento por IA neste núcleo</label>
    <label className="rot" htmlFor="instrucao-ia-nucleo">Instruções para o agente do Chatwoot</label>
    <textarea id="instrucao-ia-nucleo" className="inp" rows={3} value={instrucao} onChange={e => setInstrucao(e.target.value)} />
    <p className="ajuda">Somente os andamentos liberados são consultados. Observações internas permanecem no histórico da equipe.</p>
    <button className="btn btn-sm" disabled={modulo.ocupado}>Salvar configuração da IA</button>
    {salvo && <p role="status" className="ajuda">Configuração da IA salva.</p>}
  </form>;
}
function ConfiguracaoCarregada({nucleoId}) {
  const m = useModulo(() => listarCRM('integracao_nucleo_ia', `&id=eq.${encodeURIComponent(nucleoId)}`), [nucleoId], ['processos']);
  return <><EstadoModulo modulo={m} />{m.dados && <Editor key={nucleoId} modulo={m} nucleoId={nucleoId} />}</>;
}
export default function ConfiguracaoIANucleo({nucleoId}) {
  const [aberto, setAberto] = useState(false);
  return <details open={aberto} onToggle={e => setAberto(e.currentTarget.open)} style={{marginTop: 16}}>
    <summary>Configuração do agente IA do Chatwoot</summary>
    {aberto && <ConfiguracaoCarregada nucleoId={nucleoId} />}
  </details>;
}

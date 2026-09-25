import { useEffect, useRef, useState } from 'react';
import { Bot, Send, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { SETORES_PAINEL, MAX_CONVERSA } from './agentes-ia.js';
import { guardado, pedirAgentes } from './agentes-api.js';
import { Leitura } from './agentes-graficos.jsx';

const CHAVE = 'integracao-agentes-conversa';
const EXEMPLOS = {
  geral: ['O que precisa de decisão da diretoria esta semana?', 'Quais setores estão mais atrasados nas metas?', 'O que andou nos últimos dias?'],
  comercial: ['Como está o funil e o follow-up?', 'Quais clientes estão sem resposta?', 'Que núcleos estão parados na documentação?'],
  topografia: ['Quais núcleos estão parados em Topografia?', 'Quem está com mais metas vencidas?', 'O que a Topografia registrou esta semana?'],
  projeto: ['Quais projetos estão parados há mais tempo?', 'Que falhas mais voltam nas devolutivas?', 'Quais metas de Projetos vencem esta semana?'],
  posprotocolo: ['O que está aguardando Prefeitura ou Cartório?', 'Quais devolutivas estão com prazo vencido?', 'Qual o último andamento dos núcleos protocolados?'],
  juridico: ['Quais metas do Jurídico estão abertas?', 'O que está vencido no Jurídico?', 'Quais conclusões de meta foram recusadas?'],
};

export default function AgentesConversa({ setor, onSetor }) {
  const [mensagens, setMensagens] = useState(() => guardado.ler(CHAVE) || []);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const fim = useRef(null);

  useEffect(() => { guardado.gravar(CHAVE, mensagens.slice(-40)); }, [mensagens]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [mensagens.length, ocupado]);

  const enviar = async (pergunta) => {
    const t = String(pergunta || '').trim();
    if (ocupado || t.length < 3) return;
    const historico = [...mensagens, { papel: 'diretoria', texto: t, em: new Date().toISOString(), setor }];
    setMensagens(historico); setTexto(''); setErro(''); setOcupado(true);
    try {
      const r = await pedirAgentes({ modo: 'conversa', setor, mensagens: historico.slice(-MAX_CONVERSA).map(({ papel, texto }) => ({ papel, texto })) });
      setMensagens(atual => [...atual, { papel: 'agente', texto: r.resposta, consultados: r.consultados || [], em: r.gerado_em }]);
    } catch (e) {
      // The question goes back to the input box so it can be sent again.
      setMensagens(atual => atual.filter(m => m !== historico.at(-1)));
      setTexto(t); setErro(e.message);
    } finally { setOcupado(false); }
  };

  return (
    <div className="agente-painel">
      <div className="agente-cabeca">
        <div>
          <h2><Bot size={19} aria-hidden="true" />Conversa com o agente</h2>
          <p className="ajuda">Pergunte pelo andamento de um núcleo, de um município ou de um setor. A cada pergunta o agente lê os dados na hora; ele não altera nada.</p>
        </div>
        <div className="agente-controles">
          <label className="rot" htmlFor="conversa-setor">Foco</label>
          <select id="conversa-setor" className="inp" value={setor} onChange={e => onSetor(e.target.value)}>
            {Object.entries(SETORES_PAINEL).map(([id, s]) => <option key={id} value={id}>{s.nome}</option>)}
          </select>
          <button className="btn" disabled={ocupado || !mensagens.length} onClick={() => { setMensagens([]); guardado.apagar(CHAVE); setErro(''); }}><Trash2 size={15} />Nova conversa</button>
        </div>
      </div>

      <section className="card agente-chat" aria-live="polite">
        {!mensagens.length && !ocupado && <div className="agente-chat-vazio">
          <Bot size={28} aria-hidden="true" />
          <p>Comece com uma pergunta. Por exemplo:</p>
          <div className="flex flex-wrap gap-1" style={{ justifyContent: 'center' }}>
            {EXEMPLOS[setor].map(x => <button key={x} type="button" className="btn btn-sm" onClick={() => enviar(x)}>{x}</button>)}
          </div>
        </div>}
        {mensagens.map((m, i) => (
          <div key={i} className={`agente-msg agente-msg-${m.papel}`}>
            {m.papel === 'agente' ? <>
              <Leitura texto={m.texto} />
              {m.consultados?.length > 0 && <p className="ajuda">Consultou os andamentos de: {m.consultados.join(', ')}.</p>}
            </> : <p>{m.texto}</p>}
          </div>
        ))}
        {ocupado && <div className="agente-msg agente-msg-agente agente-msg-pensando"><RefreshCw size={14} className="girando" />Consultando os dados…</div>}
        <div ref={fim} />
      </section>

      {erro && <div className="msg-erro"><AlertTriangle size={15} />{erro}</div>}

      <form className="agente-perguntar" onSubmit={e => { e.preventDefault(); enviar(texto); }}>
        <label className="rot" htmlFor="conversa-texto">Sua pergunta</label>
        <div className="flex gap-2" style={{ alignItems: 'flex-end' }}>
          <textarea id="conversa-texto" className="inp" rows={2} maxLength={600} placeholder="Ex.: Como está o NUI03 de Ibirama?" value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
          <button className="btn btn-primario" disabled={ocupado || texto.trim().length < 3}><Send size={15} />Enviar</button>
        </div>
        <p className="ajuda">Enter envia; Shift+Enter quebra a linha. Respostas geradas por IA sobre os números do banco: confira antes de decidir.</p>
      </form>
    </div>
  );
}

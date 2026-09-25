import { useState } from 'react';
import { Bot, Sparkles, RefreshCw, AlertTriangle, ChevronDown, ChevronRight, Send, LayoutDashboard, MessageSquare } from 'lucide-react';
import { AGENTES, SETOR_PAINEL_VALIDO, destaques, dinheiro, porcento } from './agentes-ia.js';
import { pedirAgentes as pedir } from './agentes-api.js';
import { Leitura } from './agentes-graficos.jsx';
import AgentesPanorama from './AgentesPanorama.jsx';
import AgentesConversa from './AgentesConversa.jsx';
import './agentes.css';

const hoje = () => new Date().toISOString().slice(0, 10);
const diasAtras = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const dataBR = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';

function Tabela({ titulo, colunas, linhas, vazio }) {
  if (!Array.isArray(linhas) || !linhas.length) return <div className="agente-vazio"><strong>{titulo}</strong><span>{vazio}</span></div>;
  return (
    <div className="agente-tabela">
      <strong>{titulo}</strong>
      <div className="rolagem">
        <table className="tab">
          <thead><tr>{colunas.map(c => <th key={c.chave}>{c.nome}</th>)}</tr></thead>
          <tbody>{linhas.map((l, i) => <tr key={i}>{colunas.map(c => <td key={c.chave}>{c.valor(l)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Conferencia({ agente, p }) {
  const [aberto, setAberto] = useState(false);
  if (!p) return null;
  return (
    <section className="agente-conferencia">
      <button className="btn btn-sm" onClick={() => setAberto(a => !a)} aria-expanded={aberto}>
        {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Conferir os números
      </button>
      {aberto && <div className="agente-conferencia-corpo">
        <p className="ajuda">Tudo o que o agente leu foi apurado pelo banco. As listas abaixo são os mesmos dados, sem passar pela IA.</p>
        {agente === 'tecnico' ? <>
          <Tabela titulo="Núcleos parados há mais tempo" vazio="Nenhum núcleo passou do limite de dias na etapa."
            linhas={p.nucleos?.parados} colunas={[
              { chave: 'n', nome: 'Núcleo', valor: l => l.nucleo || '—' },
              { chave: 'm', nome: 'Município', valor: l => l.municipio || '—' },
              { chave: 'e', nome: 'Etapa', valor: l => l.etapa || '—' },
              { chave: 'd', nome: 'Dias na etapa', valor: l => l.dias_na_etapa ?? '—' },
              { chave: 'r', nome: 'Responsável', valor: l => l.responsavel || 'não atribuído' },
            ]} />
          <Tabela titulo="Metas vencidas" vazio="Nenhuma meta vencida."
            linhas={p.metas?.lista} colunas={[
              { chave: 't', nome: 'Meta', valor: l => l.titulo },
              { chave: 'p', nome: 'Prazo', valor: l => dataBR(l.prazo) },
              { chave: 'd', nome: 'Atraso', valor: l => `${l.dias_atraso} dia(s)` },
              { chave: 's', nome: 'Setor', valor: l => l.setor || '—' },
              { chave: 'r', nome: 'Responsáveis', valor: l => l.responsaveis },
            ]} />
          <Tabela titulo="Falhas apontadas nas devolutivas" vazio="Nenhum item categorizado ainda."
            linhas={p.falhas?.por_categoria} colunas={[
              { chave: 'c', nome: 'Categoria', valor: l => l.categoria },
              { chave: 'q', nome: 'Ocorrências', valor: l => l.total },
            ]} />
          <Tabela titulo="Devolutivas abertas" vazio="Nenhuma devolutiva aberta."
            linhas={p.devolutivas?.lista} colunas={[
              { chave: 'm', nome: 'Meta', valor: l => l.meta },
              { chave: 'o', nome: 'Origem', valor: l => l.origem || '—' },
              { chave: 'c', nome: 'Chegada', valor: l => dataBR(l.chegada) },
              { chave: 'p', nome: 'Prazo', valor: l => dataBR(l.prazo) },
              { chave: 'i', nome: 'Itens', valor: l => l.itens },
            ]} />
        </> : <>
          <Tabela titulo="Funil" vazio="Funil vazio."
            linhas={p.funil} colunas={[
              { chave: 'e', nome: 'Etapa', valor: l => l.etapa },
              { chave: 'c', nome: 'Cards', valor: l => l.cards },
              { chave: 'v', nome: 'Valor lançado', valor: l => dinheiro(l.valor) },
            ]} />
          <Tabela titulo="Fechamento por comercial" vazio="Sem desfechos no período."
            linhas={p.fechamento?.por_comercial} colunas={[
              { chave: 'c', nome: 'Comercial', valor: l => l.comercial },
              { chave: 'k', nome: 'Carteira', valor: l => l.carteira },
              { chave: 'g', nome: 'Ganhos', valor: l => l.ganhos },
              { chave: 'p', nome: 'Perdas', valor: l => l.perdas },
              { chave: 'i', nome: 'Índice', valor: l => l.indice === null || l.indice === undefined ? 'sem base' : porcento(l.indice) },
            ]} />
          <Tabela titulo="Clientes esperando resposta" vazio="Nenhum cliente esperando resposta além do limite."
            linhas={p.mensagens?.sem_resposta} colunas={[
              { chave: 'l', nome: 'Lead', valor: l => l.lead },
              { chave: 'e', nome: 'Etapa', valor: l => l.etapa },
              { chave: 'd', nome: 'Dias sem resposta', valor: l => l.dias },
              { chave: 'r', nome: 'Responsável', valor: l => l.responsavel || 'não atribuído' },
            ]} />
          <Tabela titulo="Follow-up atrasado" vazio="Nenhum follow-up atrasado."
            linhas={p.followup?.atrasados_lista} colunas={[
              { chave: 'l', nome: 'Lead', valor: l => l.lead },
              { chave: 'p', nome: 'Previsto', valor: l => dataBR(l.previsto) },
              { chave: 'd', nome: 'Atraso', valor: l => `${l.dias} dia(s)` },
              { chave: 'r', nome: 'Responsável', valor: l => l.responsavel || 'não atribuído' },
            ]} />
          <Tabela titulo="Leads parados" vazio="Nenhum lead parado além do limite."
            linhas={p.parados} colunas={[
              { chave: 'l', nome: 'Lead', valor: l => l.lead },
              { chave: 'e', nome: 'Etapa', valor: l => l.etapa },
              { chave: 'd', nome: 'Dias sem movimento', valor: l => l.dias_sem_movimento },
              { chave: 'r', nome: 'Responsável', valor: l => l.responsavel || 'não atribuído' },
            ]} />
        </>}
      </div>}
    </section>
  );
}

function Painel({ agente }) {
  const meta = AGENTES[agente];
  const [estado, setEstado] = useState({ ocupado: false, erro: '', panorama: null, leitura: '', geradoEm: '', pergunta: '' });
  const [pergunta, setPergunta] = useState('');
  const [paradoDias, setParadoDias] = useState(agente === 'comercial' ? 14 : 45);
  const [inicio, setInicio] = useState(diasAtras(89));
  const [fim, setFim] = useState(hoje());

  const executar = async (texto = '') => {
    setEstado(e => ({ ...e, ocupado: true, erro: '' }));
    try {
      const corpo = { agente, pergunta: texto, paradoDias, ...(agente === 'comercial' ? { inicio, fim } : {}) };
      const r = await pedir(corpo);
      setEstado({ ocupado: false, erro: '', panorama: r.panorama, leitura: r.leitura || '', geradoEm: r.gerado_em || '', pergunta: texto });
      if (texto) setPergunta('');
    } catch (e) {
      setEstado(x => ({ ...x, ocupado: false, erro: e.message }));
    }
  };

  const tiles = estado.panorama ? destaques(agente, estado.panorama) : [];
  return (
    <div className="agente-painel">
      <div className="agente-cabeca">
        <div>
          <h2><Bot size={19} aria-hidden="true" />{meta.nome}</h2>
          <p className="ajuda">{meta.resumo}</p>
        </div>
        <div className="agente-controles">
          {agente === 'comercial' ? <>
            <label className="rot" htmlFor={`ini-${agente}`}>De</label>
            <input id={`ini-${agente}`} type="date" className="inp" value={inicio} max={fim} onChange={e => setInicio(e.target.value)} />
            <label className="rot" htmlFor={`fim-${agente}`}>até</label>
            <input id={`fim-${agente}`} type="date" className="inp" value={fim} min={inicio} onChange={e => setFim(e.target.value)} />
          </> : null}
          <label className="rot" htmlFor={`parado-${agente}`}>{agente === 'comercial' ? 'Parado há' : 'Na etapa há'}</label>
          <select id={`parado-${agente}`} className="inp" value={paradoDias} onChange={e => setParadoDias(Number(e.target.value))}>
            {(agente === 'comercial' ? [7, 14, 30, 60] : [30, 45, 60, 90, 180]).map(d => <option key={d} value={d}>{d} dias ou mais</option>)}
          </select>
          <button className="btn btn-primario" disabled={estado.ocupado} onClick={() => executar('')}>
            {estado.ocupado ? <RefreshCw size={16} className="girando" /> : <Sparkles size={16} />}{estado.panorama ? 'Atualizar leitura' : 'Gerar leitura'}
          </button>
        </div>
      </div>

      {estado.erro && <div className="msg-erro"><AlertTriangle size={15} />{estado.erro}</div>}

      {!estado.panorama && !estado.ocupado && !estado.erro && (
        <p className="ajuda agente-inicio">O agente lê os dados na hora, direto do banco, e escreve o que merece atenção. Nada é gravado e nada é alterado por ele.</p>
      )}

      {tiles.length > 0 && <div className="agente-tiles">
        {tiles.map(t => <div key={t.rotulo} className={`agente-tile${t.tom ? ` agente-tile-${t.tom}` : ''}`}>
          <span className="agente-tile-valor">{t.valor}</span>
          <span className="agente-tile-rotulo">{t.rotulo}</span>
          <span className="agente-tile-detalhe">{t.detalhe}</span>
        </div>)}
      </div>}

      {estado.leitura && <section className="card agente-resposta">
        {estado.pergunta && <p className="agente-pergunta">{estado.pergunta}</p>}
        <Leitura texto={estado.leitura} />
        <p className="ajuda">Leitura gerada por IA sobre os números apurados ao lado. Confira antes de decidir.</p>
      </section>}

      {estado.panorama && <form className="agente-perguntar" onSubmit={e => { e.preventDefault(); if (pergunta.trim().length >= 3) executar(pergunta.trim()); }}>
        <label className="rot" htmlFor={`pergunta-${agente}`}>Perguntar ao agente</label>
        <div className="flex gap-2">
          <input id={`pergunta-${agente}`} className="inp" maxLength={600} placeholder="Escreva sua pergunta sobre estes dados" value={pergunta} onChange={e => setPergunta(e.target.value)} />
          <button className="btn btn-primario" disabled={estado.ocupado || pergunta.trim().length < 3}><Send size={15} />Perguntar</button>
        </div>
        <div className="flex flex-wrap gap-1" style={{ marginTop: 8 }}>
          {meta.exemplos.map(x => <button key={x} type="button" className="btn btn-sm" disabled={estado.ocupado} onClick={() => executar(x)}>{x}</button>)}
        </div>
      </form>}

      <Conferencia agente={agente} p={estado.panorama} />
    </div>
  );
}

const ABAS = [
  ['panorama', 'Panorama do setor', LayoutDashboard],
  ['conversa', 'Conversa', MessageSquare],
  ...Object.entries(AGENTES).map(([id, a]) => [id, a.nome, Bot]),
];

export default function AgentesIA({ usuario }) {
  const [aba, setAba] = useState('panorama');
  // The panorama opens on the viewer's own sector when it has one; the
  // diretoria starts from the overview.
  const [setor, setSetor] = useState(() => SETOR_PAINEL_VALIDO(usuario?.setor) ? usuario.setor : 'geral');
  if (usuario?.setor !== 'diretoria') return <div className="contem"><p className="ajuda">Este painel é da diretoria.</p></div>;
  return (
    <div className="contem largo">
      <div className="cabeca">
        <div>
          <h1>Agentes IA</h1>
          <p>O panorama de cada setor em gráficos, uma conversa para perguntar andamentos e os dois analistas de plantão, técnico e comercial. Só a diretoria enxerga esta tela.</p>
        </div>
      </div>
      <div className="abas" role="tablist" aria-label="Agentes">
        {ABAS.map(([id, nome, Icone]) => (
          <button key={id} role="tab" className="aba" aria-selected={aba === id} onClick={() => setAba(id)}><Icone size={15} />{nome}</button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        {aba === 'panorama' && <AgentesPanorama setor={setor} onSetor={setSetor} onConversar={s => { setSetor(s); setAba('conversa'); }} />}
        {aba === 'conversa' && <AgentesConversa setor={setor} onSetor={setSetor} />}
        {AGENTES[aba] && <Painel key={aba} agente={aba} />}
      </div>
    </div>
  );
}

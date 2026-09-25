import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';
import { SETORES_PAINEL, destaquesSetor, dinheiro } from './agentes-ia.js';
import { pedirAgentes } from './agentes-api.js';
import { BarrasH, Colunas, Empilhada, Grafico, Vazio } from './agentes-graficos.jsx';

const dataBR = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';
const diaMes = v => dataBR(v).slice(0, 5);
const lista = v => (Array.isArray(v) ? v : []);
const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

function situacaoMeta(m) {
  if (!m.prazo) return { rotulo: 'Sem prazo', classe: 'tag' };
  if (m.dias_atraso) return { rotulo: `${m.dias_atraso} dia(s) de atraso`, classe: 'tag tag-bloq' };
  const faltam = Math.round((new Date(`${m.prazo}T12:00:00`) - new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00')) / 86400000);
  return faltam <= 7 ? { rotulo: faltam === 0 ? 'Vence hoje' : `Vence em ${faltam} dia(s)`, classe: 'tag tag-pend' } : { rotulo: `Prazo ${dataBR(m.prazo)}`, classe: 'tag tag-ok' };
}

function Listas({ p }) {
  const pend = lista(p.metas?.pendencias), parados = lista(p.nucleos?.parados), recentes = lista(p.andamentos?.recentes);
  return (
    <div className="agente-listas">
      <Grafico titulo="Principais pendências" detalhe="Metas abertas do setor, das mais atrasadas para as sem prazo.">
        {pend.length ? <ul className="agente-itens">{pend.map((m, i) => {
          const s = situacaoMeta(m);
          return <li key={i}><div><strong>{m.titulo}</strong><span className="ajuda">{m.responsaveis}{m.setor && p.setor === 'geral' ? ` · ${m.setor}` : ''}{m.status === 'Aguardando aprovação' ? ' · aguardando aprovação' : ''}</span></div><span className={s.classe}>{s.rotulo}</span></li>;
        })}</ul> : <Vazio>Nenhuma meta aberta no setor.</Vazio>}
      </Grafico>
      <Grafico titulo="Núcleos parados" detalhe={`Na mesma etapa há ${n(p.parado_dias)} dias ou mais.`}>
        {parados.length ? <ul className="agente-itens">{parados.map((x, i) => (
          <li key={i}><div><strong>{x.nucleo} · {x.municipio}</strong><span className="ajuda">{x.etapa} · {x.responsavel || 'sem responsável'}{x.pendencia ? ` · ${x.pendencia}` : ''}</span></div><span className={`tag ${n(x.dias_na_etapa) > 90 ? 'tag-bloq' : 'tag-pend'}`}>{n(x.dias_na_etapa)} dias</span></li>
        ))}</ul> : <Vazio>Nenhum núcleo passou do limite.</Vazio>}
      </Grafico>
      <Grafico titulo="Últimas ações registradas" detalhe="Andamentos mais recentes do kanban de processos.">
        {recentes.length ? <ul className="agente-itens">{recentes.map((a, i) => (
          <li key={i}><div><strong>{a.nucleo} · {a.municipio}</strong><span className="ajuda">{a.etapa || 'sem etapa'} · {a.situacao || 'sem situação'}{a.observacao ? ` · ${a.observacao}` : ''}</span></div><span className="tag">{dataBR(a.data)}</span></li>
        ))}</ul> : <Vazio>Nenhum andamento registrado.</Vazio>}
      </Grafico>
    </div>
  );
}

export default function AgentesPanorama({ setor, onSetor, onConversar }) {
  const [paradoDias, setParadoDias] = useState(45);
  const [estado, setEstado] = useState({ ocupado: true, erro: '', dados: null });
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setEstado(e => ({ ...e, ocupado: true, erro: '' }));
    pedirAgentes({ modo: 'setor', setor, paradoDias }, 60000)
      .then(dados => { if (vivo) setEstado({ ocupado: false, erro: '', dados }); })
      .catch(e => { if (vivo) setEstado(x => ({ ...x, ocupado: false, erro: e.message })); });
    return () => { vivo = false; };
  }, [setor, paradoDias, recarga]);

  const atual = estado.dados?.setor === setor ? estado.dados : null;
  const p = atual?.painel;
  const c = atual?.comercial;
  const m = p?.metas || {}, nu = p?.nucleos || {}, f = nu.faixas || {};

  return (
    <div className="agente-painel">
      <div className="agente-setores" role="group" aria-label="Setor do panorama">
        {Object.entries(SETORES_PAINEL).map(([id, s]) => (
          <button key={id} type="button" className={`agente-setor${id === setor ? ' ativo' : ''}`} aria-pressed={id === setor} onClick={() => onSetor(id)}>{s.nome}</button>
        ))}
      </div>

      <div className="agente-cabeca">
        <div>
          <h2>{SETORES_PAINEL[setor].nome}</h2>
          <p className="ajuda">{SETORES_PAINEL[setor].resumo} Números lidos agora do banco, sem passar pela IA.</p>
        </div>
        <div className="agente-controles">
          <label className="rot" htmlFor="painel-parado">Parado há</label>
          <select id="painel-parado" className="inp" value={paradoDias} onChange={e => setParadoDias(Number(e.target.value))}>
            {[30, 45, 60, 90, 180].map(d => <option key={d} value={d}>{d} dias ou mais</option>)}
          </select>
          <button className="btn" disabled={estado.ocupado} onClick={() => setRecarga(r => r + 1)}><RefreshCw size={15} className={estado.ocupado ? 'girando' : ''} />Atualizar</button>
          <button className="btn btn-primario" onClick={() => onConversar(setor)}><MessageSquare size={15} />Perguntar ao agente</button>
        </div>
      </div>

      {estado.erro && <div className="msg-erro"><AlertTriangle size={15} />{estado.erro}</div>}
      {!p && estado.ocupado && <p className="ajuda">Carregando o panorama do setor…</p>}

      {p && <>
        <div className={`agente-tiles${estado.ocupado ? ' agente-carregando' : ''}`}>
          {destaquesSetor(p).map(t => <div key={t.rotulo} className={`agente-tile${t.tom ? ` agente-tile-${t.tom}` : ''}`}>
            <span className="agente-tile-valor">{t.valor}</span>
            <span className="agente-tile-rotulo">{t.rotulo}</span>
            <span className="agente-tile-detalhe">{t.detalhe}</span>
          </div>)}
        </div>

        <div className={`agente-graficos${estado.ocupado ? ' agente-carregando' : ''}`}>
          <Grafico titulo="Metas abertas por prazo" detalhe={`${n(m.abertas)} metas abertas no setor.`}>
            <Empilhada vazio="Nenhuma meta aberta." partes={[
              { rotulo: 'vencidas', valor: m.vencidas, tom: 'alerta' },
              { rotulo: 'vencem em 7 dias', valor: m.vencem_em_7, tom: 'atencao' },
              { rotulo: 'no prazo', valor: m.no_prazo, tom: 'base' },
              { rotulo: 'sem prazo', valor: m.sem_prazo, tom: 'neutro' },
            ]} />
          </Grafico>

          <Grafico titulo="Andamentos por semana" detalhe="Registros no kanban de processos nas últimas 8 semanas.">
            <Colunas pontos={lista(p.andamentos?.por_semana).map(s => ({ rotulo: diaMes(s.semana), dica: `Semana de ${dataBR(s.semana)}`, valor: s.total }))} />
          </Grafico>

          {setor === 'geral' && <Grafico titulo="Setores lado a lado" detalhe="Metas abertas por setor; a parte vermelha são as vencidas. Toque para abrir o setor.">
            <BarrasH onEscolher={l => onSetor(l.id)} vazio="Nenhuma meta aberta." linhas={lista(p.setores).map(s => ({
              id: s.setor, rotulo: SETORES_PAINEL[s.setor]?.nome || s.setor, total: n(s.metas_abertas), mostrarZero: true,
              partes: [{ valor: s.metas_vencidas, tom: 'alerta' }, { valor: n(s.metas_abertas) - n(s.metas_vencidas), tom: 'base' }],
              extra: `· ${n(s.metas_vencidas)} vencidas · ${n(s.nucleos)} núcleos`,
            }))} />
          </Grafico>}

          {setor !== 'juridico' && <Grafico titulo="Núcleos por etapa" detalhe={`${n(nu.total)} núcleos ativos.`}>
            <BarrasH vazio="Nenhum núcleo ativo nas etapas do setor." linhas={lista(nu.por_etapa).map(e => ({ rotulo: e.etapa, valor: e.total }))} />
          </Grafico>}

          {setor !== 'juridico' && <Grafico titulo="Tempo na etapa atual" detalhe="Quanto tempo os núcleos estão parados na mesma etapa.">
            <BarrasH vazio="Nenhum núcleo ativo." linhas={[
              { rotulo: 'Até 30 dias', valor: f.ate_30, tom: 'base', mostrarZero: true },
              { rotulo: '31 a 60 dias', valor: f.de_31_a_60, tom: 'base', mostrarZero: true },
              { rotulo: '61 a 90 dias', valor: f.de_61_a_90, tom: 'atencao', mostrarZero: true },
              { rotulo: 'Mais de 90 dias', valor: f.mais_de_90, tom: 'alerta', mostrarZero: true },
            ]} />
          </Grafico>}

          <Grafico titulo="Metas por responsável" detalhe="Abertas por pessoa; a parte vermelha são as vencidas.">
            <BarrasH vazio="Nenhuma meta aberta." linhas={lista(m.por_responsavel).map(r => ({
              rotulo: r.responsavel, total: r.abertas, extra: n(r.vencidas) ? `· ${n(r.vencidas)} vencidas` : '',
              partes: [{ valor: r.vencidas, tom: 'alerta' }, { valor: n(r.abertas) - n(r.vencidas), tom: 'base' }],
            }))} />
          </Grafico>

          {c && <Grafico titulo="Funil do CRM" detalhe={`Cards por etapa hoje. Follow-up atrasado: ${n(c.followup?.atrasados)}. Clientes sem resposta: ${lista(c.mensagens?.sem_resposta).length}.`}>
            <BarrasH vazio="Funil vazio." linhas={lista(c.funil).map(e => ({ rotulo: e.etapa, valor: e.cards, tom: e.etapa === 'Perdido' ? 'neutro' : 'base', extra: n(e.valor) ? `· ${dinheiro(e.valor)}` : '' }))} />
          </Grafico>}

          {setor !== 'juridico' && <Grafico titulo="Situação atual dos núcleos" detalhe="Pelo último andamento de cada núcleo.">
            <BarrasH vazio="Nenhum andamento registrado." linhas={lista(p.andamentos?.por_situacao).map(s => ({ rotulo: s.situacao, valor: s.total, tom: /Aguardando|Pausado/.test(s.situacao) ? 'atencao' : 'base' }))} />
          </Grafico>}
        </div>

        <Listas p={p} />
      </>}
    </div>
  );
}

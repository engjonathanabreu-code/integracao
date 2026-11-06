import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, FileText, History, Pencil, Plus } from 'lucide-react';
import { apiTermosMunicipais } from './termos-municipais-api.js';
import { CAMPOS_TERMO, MAX_TEXTO_TERMO, htmlTermoMunicipal, modelosDoMunicipio, preencherTermoMunicipal, validarModeloTermo } from './termos-municipais.js';

const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dataHora = v => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
const vazio = municipioId => ({ municipioId, titulo: '', variante: '', corpo: '', obrigatorios: [] });

export function ModelosTermosMunicipais({ municipios, municipioId: fixo, podeGerenciar, ui, api = apiTermosMunicipais }) {
  const { Secao, Modal } = ui;
  const [municipioId, setMunicipioId] = useState(fixo || '');
  const [modelos, setModelos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(null);
  const [base, setBase] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState('');
  const [revisao, setRevisao] = useState(0);
  const apiRef = useRef(api); apiRef.current = api;
  const sujo = form && JSON.stringify(form) !== base;
  useEffect(() => { if (fixo) setMunicipioId(fixo); }, [fixo]);
  useEffect(() => {
    let ativo = true; setModelos([]); setErro('');
    if (!municipioId) return;
    setCarregando(true);
    apiRef.current.listarModelos(municipioId).then(r => { if (ativo) setModelos(modelosDoMunicipio(r, municipioId)); })
      .catch(e => { if (ativo) setErro(e.message); }).finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [municipioId, revisao]);
  useEffect(() => {
    if (!sujo) return;
    const impedir = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', impedir);
    return () => window.removeEventListener('beforeunload', impedir);
  }, [sujo]);
  const editar = modelo => {
    const f = { ...(modelo ? { id: modelo.modeloId, municipioId: modelo.municipioId, titulo: modelo.titulo, variante: modelo.variante, corpo: modelo.corpo, obrigatorios: [...modelo.obrigatorios], versaoBase: modelo.versao } : vazio(municipioId)), pedidoId: crypto.randomUUID() };
    setForm(f); setBase(JSON.stringify(f)); setErro(''); setSalvo('');
  };
  const fechar = () => { if (!salvando && (!sujo || window.confirm('Descartar as alterações não salvas deste modelo?'))) setForm(null); };
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const validacao = form ? validarModeloTermo(form) : { erros: [], campos: [] };
  const salvar = async () => {
    if (salvando || !podeGerenciar || validacao.erros.length) return;
    setSalvando(true); setErro('');
    try {
      const resultado = await apiRef.current.salvarModelo(form);
      if (!resultado?.id || !resultado?.versao) throw new Error('Não foi possível confirmar o salvamento do modelo. Tente novamente.');
      setForm(null); setSalvo(`Modelo salvo na versão ${resultado.versao}. Os termos anteriores conservam o texto emitido.`); setRevisao(x => x + 1);
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  };
  const municipio = municipios.find(m => m.id === municipioId);
  return <Secao titulo="Modelos de termos de compromisso" nota="Cadastre o texto correspondente a cada município e suas variantes. Cada alteração salva uma nova versão.">
    {!fixo && <label className="rot">Município<select className="inp" value={municipioId} onChange={e => { setMunicipioId(e.target.value); setSalvo(''); }}><option value="">Selecione o município</option>{municipios.map(m => <option key={m.id} value={m.id}>{m.nome}/{m.uf}</option>)}</select></label>}
    {normalizar(municipio?.nome) === 'ilhota' && <p className="ajuda"><AlertTriangle size={14} style={{ display: 'inline' }} /> Confira o texto oficial de Ilhota: a regra informada atribui ao requerente as ligações de água e energia, inclusive na modalidade social, e à Prefeitura as demais infraestruturas. Aplique somente a redação do modelo municipal.</p>}
    {!!municipioId && podeGerenciar && <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => editar(null)}><Plus size={14} />Novo modelo</button>}
    {carregando && <p role="status">Carregando modelos…</p>}
    {erro && !form && <p role="alert" className="msg-erro">{erro}</p>}
    {salvo && <p role="status" className="ajuda">{salvo}</p>}
    {!!municipioId && !carregando && !erro && !modelos.length && <p className="ajuda">Ainda não há modelo de termo cadastrado para {municipio?.nome || 'este município'}. Cadastre o texto oficial e a variante aplicável para habilitar a emissão.</p>}
    {modelos.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-2" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}><span><strong>{m.titulo}</strong><span className="ajuda" style={{ display: 'block' }}>{m.variante} · versão {m.versao}</span></span>{podeGerenciar && <button type="button" className="btn btn-sm" onClick={() => editar(m)}><Pencil size={14} />Editar modelo</button>}</div>)}
    {form && <Modal titulo={form.id ? 'Nova versão do modelo' : 'Novo modelo municipal'} largura={900} onFechar={fechar} rodape={<><button className="btn" disabled={salvando} onClick={fechar}>Cancelar</button><button className="btn btn-primario" disabled={salvando || !!validacao.erros.length || !sujo} onClick={salvar}><Check size={15} />{salvando ? 'Salvando…' : 'Salvar modelo'}</button></>}>
      <div data-edicao-pendente={sujo ? 'true' : 'false'}>
        <p className="ajuda">Município: <strong>{municipio?.nome}/{municipio?.uf}</strong>. Cole o texto aprovado e use os marcadores para preenchimento automático.</p>
        <label className="rot">Título<input className="inp" maxLength={160} value={form.titulo} onChange={e => set('titulo', e.target.value)} /></label>
        <label className="rot">Variante<input className="inp" maxLength={100} value={form.variante} onChange={e => set('variante', e.target.value)} placeholder="Nome da modalidade ou condição prevista no modelo" /></label>
        <label className="rot">Texto do modelo<textarea className="inp memorial-texto" rows={12} maxLength={MAX_TEXTO_TERMO} value={form.corpo} onChange={e => { const corpo = e.target.value; const campos = validarModeloTermo({ ...form, corpo }).campos; setForm(x => ({ ...x, corpo, obrigatorios: x.obrigatorios.filter(c => campos.includes(c)) })); }} /></label>
        <details style={{ margin: '12px 0' }}><summary>Marcadores disponíveis</summary><div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>{Object.entries(CAMPOS_TERMO).map(([chave, nome]) => <button type="button" key={chave} className="btn btn-sm" title={nome} onClick={() => set('corpo', `${form.corpo}{{${chave}}}`)}>{`{{${chave}}}`}</button>)}</div></details>
        {!!validacao.campos.length && <fieldset style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}><legend>Campos obrigatórios para emitir</legend><div className="flex flex-col gap-2">{validacao.campos.filter(c => CAMPOS_TERMO[c]).map(c => <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={form.obrigatorios.includes(c)} onChange={e => set('obrigatorios', e.target.checked ? [...form.obrigatorios, c] : form.obrigatorios.filter(x => x !== c))} />{CAMPOS_TERMO[c]}</label>)}</div></fieldset>}
        {!!validacao.erros.length && <p className="ajuda">{validacao.erros.join(' ')}</p>}
        {erro && <p role="alert" className="msg-erro">{erro}</p>}
      </div>
    </Modal>}
  </Secao>;
}

export function TermosCompromissoMunicipais({ p, municipio, unidades, identificarUnidade, podeGerar, ui, timbrado, onExportar, onEmitida, api = apiTermosMunicipais }) {
  const { Secao, Modal, PreviaDocumento } = ui;
  const [modelos, setModelos] = useState([]);
  const [emissoes, setEmissoes] = useState([]);
  const [modeloId, setModeloId] = useState('');
  const [unidadeId, setUnidadeId] = useState(unidades.length === 1 ? unidades[0].id : '');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [previa, setPrevia] = useState(null);
  const apiRef = useRef(api); apiRef.current = api;
  const pedido = useRef('');
  const emCurso = useRef(false);
  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro(''); setModeloId(''); setPrevia(null);
    setUnidadeId(unidades.length === 1 ? unidades[0].id : '');
    Promise.all([apiRef.current.listarModelos(p.municipioId), apiRef.current.listarEmissoes(p.id)]).then(([ms, es]) => {
      if (!ativo) return;
      setModelos(modelosDoMunicipio(ms, p.municipioId)); setEmissoes(es || []);
    }).catch(e => { if (ativo) setErro(e.message); }).finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [p.id, p.municipioId]);
  const gerarPrevia = async () => {
    if (emCurso.current || !podeGerar) return;
    emCurso.current = true; setOcupado(true); setErro('');
    try {
      const preparo = await apiRef.current.preparar({ processoId: p.id, unidadeId, modeloVersaoId: modeloId });
      if (preparo?.modelo?.municipioId !== p.municipioId || preparo?.modelo?.id !== modeloId) throw new Error('O modelo selecionado mudou. Atualize a lista antes de gerar.');
      const resultado = preencherTermoMunicipal(preparo.modelo, preparo.dados);
      pedido.current = crypto.randomUUID();
      setPrevia({ ...resultado, modelo: preparo.modelo, unidadeId, emitido: null });
    } catch (e) { setErro(e.message); }
    finally { emCurso.current = false; setOcupado(false); }
  };
  const baixar = async formato => {
    if (emCurso.current || !previa || previa.faltas?.length || (!previa.emitido && !podeGerar)) return;
    emCurso.current = true; setOcupado(true); setErro('');
    try {
      let emitido = previa.emitido;
      if (!emitido) {
        emitido = await apiRef.current.emitir({ pedidoId: pedido.current, processoId: p.id, unidadeId: previa.unidadeId, modeloVersaoId: previa.modelo.id, textoEsperado: previa.texto });
        if (!emitido?.id || typeof emitido.texto !== 'string' || emitido.processoId !== p.id || emitido.municipioId !== p.municipioId) throw new Error('Não foi possível confirmar a emissão. Tente novamente.');
        setPrevia(x => ({ ...x, texto: emitido.texto, titulo: emitido.titulo, html: htmlTermoMunicipal(emitido.texto, emitido.titulo), emitido }));
        setEmissoes(es => [emitido, ...es.filter(e => e.id !== emitido.id)]);
        await onEmitida?.(emitido);
      }
      await onExportar({ html: htmlTermoMunicipal(emitido.texto, emitido.titulo), titulo: emitido.titulo, nome: `${p.codigo || 'morador'}-termo-compromisso-v${emitido.versao}`, formato, emissao: emitido });
    } catch (e) { setErro(e.message); }
    finally { emCurso.current = false; setOcupado(false); }
  };
  const abrirEmitido = e => { setErro(''); setPrevia({ titulo: e.titulo, texto: e.texto, html: htmlTermoMunicipal(e.texto, e.titulo), faltas: [], modelo: { versao: e.versao }, emitido: e }); };
  return <Secao titulo="Termo de compromisso municipal" nota="Escolha o modelo do município e a unidade. A emissão mantém o texto e a versão utilizados.">
    {carregando ? <p role="status">Carregando termos…</p> : <>
      {!modelos.length && <p className="ajuda">Falta cadastrar o texto oficial do termo de compromisso de {municipio?.nome || 'este município'}. Solicite a configuração à Administração ou Diretoria.</p>}
      {!!modelos.length && <div className="flex flex-col gap-2">
        <label className="rot">Modelo e variante<select className="inp" value={modeloId} onChange={e => setModeloId(e.target.value)} disabled={!podeGerar || ocupado}><option value="">Selecione o modelo aplicável</option>{modelos.map(m => <option key={m.id} value={m.id}>{m.titulo} — {m.variante} · v{m.versao}</option>)}</select></label>
        <label className="rot">Unidade<select className="inp" value={unidadeId} onChange={e => setUnidadeId(e.target.value)} disabled={!podeGerar || ocupado}><option value="">Selecione a unidade</option>{unidades.map((u, i) => <option key={u.id} value={u.id}>{identificarUnidade?.(u, i) || [u.codigo || `Unidade ${i + 1}`, u.loteQuadra].filter(Boolean).join(' · ')}</option>)}</select></label>
        <div><button className="btn btn-sm btn-primario" disabled={!podeGerar || !modeloId || !unidadeId || ocupado} onClick={gerarPrevia}><FileText size={14} />{ocupado ? 'Preparando…' : 'Visualizar termo'}</button></div>
      </div>}
      {!!emissoes.length && <div style={{ marginTop: 16 }}><strong className="flex items-center gap-2"><History size={15} />Termos municipais emitidos</strong>{emissoes.map(e => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{e.titulo}<span className="ajuda" style={{ display: 'block' }}>Versão {e.versao} · {dataHora(e.emitidoEm || e.criadoEm)}{e.por ? ` · ${e.por}` : ''}</span></span><button className="btn btn-sm" onClick={() => abrirEmitido(e)}>Abrir emissão</button></div>)}</div>}
    </>}
    {erro && !previa && <p role="alert" className="msg-erro">{erro}</p>}
    {previa && <Modal titulo={previa.titulo} largura={920} onFechar={() => { if (!ocupado) setPrevia(null); }} rodape={<><button className="btn" disabled={ocupado} onClick={() => setPrevia(null)}>Fechar</button><button className="btn" disabled={ocupado || !!previa.faltas.length || (!previa.emitido && !podeGerar)} onClick={() => baixar('docx')}><Download size={15} />Baixar Word</button><button className="btn btn-primario" disabled={ocupado || !!previa.faltas.length || (!previa.emitido && !podeGerar)} onClick={() => baixar('pdf')}><Download size={15} />{ocupado ? 'Gerando…' : 'Baixar PDF'}</button></>}>
      <p className="ajuda">Modelo versão {previa.modelo.versao}{previa.emitido ? ` · Emitido em ${dataHora(previa.emitido.emitidoEm || previa.emitido.criadoEm)}` : ' · Confira a prévia antes de emitir'}.</p>
      {!!previa.faltas.length && <p className="msg-erro" role="alert">Faltam dados obrigatórios no cadastro: {previa.faltas.map(c => CAMPOS_TERMO[c]).join(', ')}. Complete o cadastro e gere uma nova prévia.</p>}
      {erro && <p role="alert" className="msg-erro">{erro}</p>}
      <PreviaDocumento html={previa.html} titulo={previa.titulo} timbrado={timbrado} />
    </Modal>}
  </Secao>;
}

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, ListChecks, Undo2, Redo2, RemoveFormatting, Plus, Save, Pencil, Trash2, RotateCcw, X } from 'lucide-react';
import { criarHistoricoEditor, erroObservacao, lerTrechosDOM, marcarItem, mudarTipoBloco, novoBloco, observacaoVazia, podeEditarObservacao, textoObservacao, validarObservacao } from './observacoes-documentos.js';
import { observacoesDocumentosApi } from './observacoes-documentos-api.js';
import './observacoes-documentos.css';

const data = valor => valor ? new Date(valor).toLocaleString('pt-BR') : '';
const copia = valor => JSON.parse(JSON.stringify(valor));
function ConteudoTrechos({ runs }) { return runs.map((run, i) => <span key={i} style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? 'italic' : undefined }}>{run.text}</span>); }

export function ConteudoObservacao({ conteudo, onMarcar, disabled }) {
  let validado;
  try { validado = validarObservacao(conteudo, { permitirVazia: true }); } catch { return <p role="alert">Não foi possível exibir esta observação. Atualize a página ou avise a administração.</p>; }
  let numero = 0;
  return <div className="obs-doc-conteudo">{validado.blocks.map(b => {
    numero = b.type === 'ordered' ? numero + 1 : 0;
    return <div key={b.id} className={`obs-doc-linha obs-doc-${b.type}`}>
      {b.type === 'check' ? <input type="checkbox" checked={b.checked} disabled={disabled || !onMarcar} aria-label={`Concluir item: ${b.runs.map(r => r.text).join('')}`} onChange={e => onMarcar?.(b.id, e.target.checked)} /> : b.type !== 'paragraph' ? <span className="obs-doc-marcador" aria-hidden="true">{b.type === 'bullet' ? '•' : `${numero}.`}</span> : null}
      <div className="obs-doc-texto"><ConteudoTrechos runs={b.runs} /></div>
    </div>;
  })}</div>;
}

function BlocoEditor({ bloco, numero, disabled, foco, alterar, quebrar, removerVazio, registrarElemento }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el || JSON.stringify(lerTrechosDOM(el)) === JSON.stringify(bloco.runs)) return;
    const ativo = el.ownerDocument.activeElement === el;
    el.replaceChildren(...bloco.runs.map(run => { const span = el.ownerDocument.createElement('span'); span.textContent = run.text; if (run.bold) span.style.fontWeight = '700'; if (run.italic) span.style.fontStyle = 'italic'; return span; }));
    if (ativo) { const range = el.ownerDocument.createRange(); range.selectNodeContents(el); range.collapse(false); const selection = el.ownerDocument.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  }, [bloco.runs]);
  useEffect(() => { registrarElemento(bloco.id, ref.current); return () => registrarElemento(bloco.id, null); }, [bloco.id, registrarElemento]);
  const ler = () => alterar(bloco.id, lerTrechosDOM(ref.current));
  const keyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); const el = ref.current, selection = el.ownerDocument.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0); if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
      const antes = range.cloneRange(), depois = range.cloneRange(); antes.selectNodeContents(el); antes.setEnd(range.startContainer, range.startOffset); depois.selectNodeContents(el); depois.setStart(range.endContainer, range.endOffset);
      quebrar(bloco.id, lerTrechosDOM(antes.cloneContents()), lerTrechosDOM(depois.cloneContents()));
    } else if (event.key === 'Backspace' && !ref.current.textContent) { if (removerVazio(bloco.id)) event.preventDefault(); }
  };
  return <div className={`obs-doc-linha obs-doc-${bloco.type}`}>
    {bloco.type === 'check' ? <input type="checkbox" aria-label="Marcar item no rascunho" disabled={disabled} checked={bloco.checked} onChange={e => alterar(bloco.id, null, e.target.checked)} /> : bloco.type !== 'paragraph' ? <span className="obs-doc-marcador" aria-hidden="true">{bloco.type === 'bullet' ? '•' : `${numero}.`}</span> : null}
    <div ref={ref} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={bloco.type === 'check' ? 'Texto do item do checklist' : 'Texto da observação'} className="obs-doc-editavel" data-vazio="Escreva aqui" onFocus={() => foco(bloco.id)} onInput={ler} onKeyDown={keyDown} onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); ler(); }} onDrop={e => e.preventDefault()} />
  </div>;
}

export function MiniEditorObservacao({ value, onChange, disabled = false }) {
  const [ativo, setAtivo] = useState(value.blocks[0]?.id), historico = useRef(criarHistoricoEditor(value)), elementos = useRef(new Map());
  const registrarElemento = useCallback((id, el) => { if (el) elementos.current.set(id, el); else elementos.current.delete(id); }, []);
  const mudar = proximo => { historico.current.registrar(proximo); onChange(proximo); };
  const focar = id => requestAnimationFrame(() => { setAtivo(id); const el = elementos.current.get(id); el?.focus(); });
  const alterar = (id, runs, checked) => mudar({ ...value, blocks: value.blocks.map(b => b.id === id ? { ...b, ...(runs ? { runs } : {}), ...(checked !== undefined ? { checked } : {}) } : b) });
  const formatar = comando => { const el = elementos.current.get(ativo); if (!el) return; el.focus(); document.execCommand(comando, false); alterar(ativo, lerTrechosDOM(el)); };
  const tipo = type => { const bloco = value.blocks.find(b => b.id === ativo) || value.blocks[0]; mudar(mudarTipoBloco(value, bloco.id, bloco.type === type ? 'paragraph' : type)); focar(bloco.id); };
  const quebrar = (id, antes, depois) => {
    if (value.blocks.length >= 200) return;
    const indice = value.blocks.findIndex(b => b.id === id), atual = value.blocks[indice], novo = { ...novoBloco(atual.type), runs: depois };
    if (!antes.some(r => r.text) && !depois.some(r => r.text) && atual.type !== 'paragraph') { mudar(mudarTipoBloco(value, id, 'paragraph')); return; }
    const blocks = [...value.blocks]; blocks.splice(indice, 1, { ...atual, runs: antes }, novo); mudar({ ...value, blocks }); focar(novo.id);
  };
  const removerVazio = id => { if (value.blocks.length <= 1) return false; const indice = value.blocks.findIndex(b => b.id === id); mudar({ ...value, blocks: value.blocks.filter(b => b.id !== id) }); focar(value.blocks[Math.max(0, indice - 1)].id === id ? value.blocks[indice + 1].id : value.blocks[Math.max(0, indice - 1)].id); return true; };
  const desfazer = () => onChange(historico.current.desfazer()), refazer = () => onChange(historico.current.refazer());
  const limpar = () => mudar({ ...value, blocks: value.blocks.map(b => ({ id: b.id, type: 'paragraph', runs: [{ text: b.runs.map(r => r.text).join('') }] })) });
  const botao = (rotulo, Icon, fn, extra = false) => <button type="button" className="btn btn-sm" title={rotulo} aria-label={rotulo} disabled={disabled || extra} onMouseDown={e => e.preventDefault()} onClick={fn}><Icon size={16} /></button>;
  let numero = 0;
  return <div className="obs-doc-editor" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? refazer() : desfazer(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); refazer(); } }}>
    <div className="obs-doc-ferramentas" role="toolbar" aria-label="Formatação da observação">
      {botao('Negrito', Bold, () => formatar('bold'))}{botao('Itálico', Italic, () => formatar('italic'))}{botao('Lista com marcadores', List, () => tipo('bullet'))}{botao('Lista numerada', ListOrdered, () => tipo('ordered'))}{botao('Checklist', ListChecks, () => tipo('check'))}{botao('Desfazer', Undo2, desfazer, !historico.current.podeDesfazer)}{botao('Refazer', Redo2, refazer, !historico.current.podeRefazer)}{botao('Remover formatação', RemoveFormatting, limpar)}
    </div>
    <div className="obs-doc-editor-corpo">{value.blocks.map(bloco => { numero = bloco.type === 'ordered' ? numero + 1 : 0; return <BlocoEditor key={bloco.id} bloco={bloco} numero={numero} disabled={disabled} foco={setAtivo} alterar={alterar} quebrar={quebrar} removerVazio={removerVazio} registrarElemento={registrarElemento} />; })}</div>
    <p className="ajuda obs-doc-dica">Enter cria uma linha ou item. Shift + Enter quebra a linha. O checklist é salvo junto com o texto.</p>
  </div>;
}

export default function ObservacoesDocumentos({ processoId, usuario, podeCriar = false, podeGerenciar = false, onEdicaoPendente, api = observacoesDocumentosApi }) {
  const [itens, setItens] = useState([]), [total, setTotal] = useState(0), [inicio, setInicio] = useState(0), [excluidas, setExcluidas] = useState(false);
  const [carregando, setCarregando] = useState(true), [ocupado, setOcupado] = useState(false), [erro, setErro] = useState(''), [sucesso, setSucesso] = useState('');
  const [editor, setEditor] = useState(null), [conteudo, setConteudo] = useState(null), [confirmacao, setConfirmacao] = useState(null), [atualizacao, setAtualizacao] = useState(false);
  const trava = useRef(false), geracao = useRef(0), montado = useRef(true), estado = useRef({});
  const sujo = !!editor && JSON.stringify(conteudo) !== JSON.stringify(editor.original);
  estado.current = { editor, conteudo, sujo, ocupado };
  useEffect(() => { montado.current = true; return () => { montado.current = false; geracao.current++; }; }, []);
  useEffect(() => { onEdicaoPendente?.(sujo || ocupado); return () => onEdicaoPendente?.(false); }, [sujo, ocupado, onEdicaoPendente]);
  useEffect(() => { const sair = e => { if (!estado.current.sujo && !estado.current.ocupado) return; e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', sair); return () => window.removeEventListener('beforeunload', sair); }, []);
  const carregar = useCallback(async () => {
    const chamada = ++geracao.current; setCarregando(true);
    try { const r = await api.listar(processoId, { inicio, limite: 20, excluidas }); if (!montado.current || chamada !== geracao.current) return; setItens(r.itens); setTotal(r.total); setAtualizacao(false); }
    catch (e) { if (montado.current && chamada === geracao.current) setErro(erroObservacao(e)); }
    finally { if (montado.current && chamada === geracao.current) setCarregando(false); }
  }, [api, processoId, inicio, excluidas]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const receber = e => { if (e.detail?.modulo && !['documentos_observacoes', 'clientes', 'moradores', 'processos'].includes(e.detail.modulo)) return; if (estado.current.editor || estado.current.ocupado) setAtualizacao(true); else carregar(); };
    const retomar = () => { if (document.visibilityState === 'visible') receber({}); };
    window.addEventListener('integracao:atualizacao', receber); window.addEventListener('focus', retomar); document.addEventListener('visibilitychange', retomar);
    return () => { window.removeEventListener('integracao:atualizacao', receber); window.removeEventListener('focus', retomar); document.removeEventListener('visibilitychange', retomar); };
  }, [carregar]);
  const abrirEditor = item => {
    const c = item ? copia(item.conteudo) : observacaoVazia();
    setEditor({ id: item?.id || crypto.randomUUID(), processoId, versao: item?.versao || 0, original: copia(c) }); setConteudo(c); setErro(''); setSucesso('');
  };
  const executar = async (operacao, sucessoTexto, fecharEditor = false) => {
    if (trava.current) return; trava.current = true; setOcupado(true); setErro(''); setSucesso('');
    try { await operacao(); if (!montado.current) return; if (fecharEditor) { setEditor(null); setConteudo(null); } setConfirmacao(null); setSucesso(sucessoTexto); await carregar(); window.dispatchEvent(new CustomEvent('integracao:atualizacao', { detail: { modulo: 'documentos_observacoes' } })); }
    catch (e) { if (montado.current) setErro(erroObservacao(e)); }
    finally { trava.current = false; if (montado.current) setOcupado(false); }
  };
  const salvar = () => executar(() => {
    if (String(editor.processoId) !== String(processoId)) throw Error('O morador selecionado mudou. Seu texto foi mantido; retorne ao cadastro de origem para salvar.');
    return api.salvar(editor.processoId, { id: editor.id, versao: editor.versao, conteudo });
  }, 'Observação salva.', true);
  const fechar = () => { if (sujo) setConfirmacao({ acao: 'descartar' }); else { setEditor(null); setConteudo(null); } };
  const confirmar = () => {
    if (confirmacao.acao === 'descartar') { setEditor(null); setConteudo(null); setConfirmacao(null); return; }
    const o = confirmacao.item;
    executar(() => confirmacao.acao === 'excluir' ? api.excluir(processoId, { id: o.id, versao: o.versao }) : api.restaurar(processoId, { id: o.id, versao: o.versao }), confirmacao.acao === 'excluir' ? 'Observação excluída. Você pode recuperá-la em Excluídas.' : 'Observação restaurada.');
  };
  return <section className="card obs-doc" data-edicao-pendente={sujo || ocupado} aria-label="Observações dos documentos">
    <div className="obs-doc-cabecalho"><div><h3>Observações</h3><p className="ajuda">Anotações e checklists dos documentos deste morador.</p></div>{podeCriar && !editor && !excluidas && <button type="button" className="btn btn-sm btn-primario" disabled={ocupado} onClick={() => abrirEditor()}><Plus size={14} />Nova observação</button>}</div>
    {erro && <div role="alert" className="obs-doc-erro">{erro}{editor && <p>Você pode copiar seu texto antes de conferir a versão atual.</p>}<button type="button" className="btn btn-sm" disabled={ocupado} onClick={carregar}>Conferir versão atual</button></div>}
    {sucesso && <p role="status" className="ajuda">{sucesso}</p>}
    {atualizacao && <p role="status" className="ajuda">Há atualizações disponíveis. Seu rascunho foi mantido.<button type="button" className="btn btn-sm" disabled={ocupado} onClick={carregar}>Atualizar lista</button></p>}
    {editor && <div className="obs-doc-rascunho"><h4>{editor.versao ? 'Editar observação' : 'Nova observação'}</h4><MiniEditorObservacao key={editor.id} value={conteudo} onChange={setConteudo} disabled={ocupado} /><div className="obs-doc-acoes"><button type="button" className="btn btn-primario" disabled={ocupado || !sujo || !conteudo?.blocks.some(b => b.runs.some(r => r.text.trim()))} onClick={salvar}><Save size={14} />{ocupado ? 'Salvando…' : 'Salvar observação'}</button><button type="button" className="btn" disabled={ocupado} onClick={fechar}>Cancelar</button><button type="button" className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(textoObservacao(conteudo)); setSucesso('Texto copiado.'); } catch { setErro('Não foi possível copiar. Selecione o texto e use a opção Copiar do aparelho.'); } }}>Copiar texto</button></div><span role="status" className="ajuda">{ocupado ? 'Aguardando confirmação do salvamento…' : sujo ? 'Alterações ainda não salvas.' : ''}</span></div>}
    <div className="obs-doc-acoes"><button type="button" className={`btn btn-sm${!excluidas ? ' btn-primario' : ''}`} disabled={ocupado} onClick={() => { setExcluidas(false); setInicio(0); }}>Ativas</button><button type="button" className={`btn btn-sm${excluidas ? ' btn-primario' : ''}`} disabled={ocupado} onClick={() => { setExcluidas(true); setInicio(0); }}>Excluídas</button></div>
    {carregando && <p role="status" className="ajuda">Carregando observações…</p>}
    {!carregando && !itens.length && <p className="ajuda">{excluidas ? 'Nenhuma observação excluída.' : 'Nenhuma observação registrada nos documentos.'}</p>}
    <div className="obs-doc-lista">{itens.map(o => {
      const pode = podeCriar && podeEditarObservacao(o, usuario, podeGerenciar);
      return <article key={o.id} className="obs-doc-item"><div className="obs-doc-cabecalho"><div><strong>{o.autor_nome || 'Equipe'}</strong><span className="ajuda obs-doc-metadados">{o.autor_setor ? `${o.autor_setor} · ` : ''}{data(o.criado_em)}{o.atualizado_em !== o.criado_em ? ` · Editada em ${data(o.atualizado_em)}` : ''}{o.excluido_em ? ` · Excluída em ${data(o.excluido_em)}` : ''}</span></div>{pode && !editor && <div className="obs-doc-acoes">{!o.excluido_em ? <><button type="button" className="btn-icone" title="Editar observação" aria-label="Editar observação" disabled={ocupado} onClick={() => abrirEditor(o)}><Pencil size={14} /></button><button type="button" className="btn-icone" title="Excluir observação" aria-label="Excluir observação" disabled={ocupado} onClick={() => setConfirmacao({ acao: 'excluir', item: o })}><Trash2 size={14} /></button></> : <button type="button" className="btn btn-sm" disabled={ocupado} onClick={() => setConfirmacao({ acao: 'restaurar', item: o })}><RotateCcw size={14} />Restaurar</button>}</div>}</div><ConteudoObservacao conteudo={o.conteudo} disabled={ocupado || !!editor || !pode || !!o.excluido_em} onMarcar={(id, checked) => executar(() => api.salvar(processoId, { id: o.id, versao: o.versao, conteudo: marcarItem(o.conteudo, id, checked) }), 'Checklist salvo.')} /></article>;
    })}</div>
    {total > 20 && <div className="obs-doc-acoes"><button type="button" className="btn btn-sm" disabled={ocupado || carregando || !inicio} onClick={() => setInicio(Math.max(0, inicio - 20))}>Anterior</button><span className="ajuda">{inicio + 1}–{Math.min(inicio + 20, total)} de {total}</span><button type="button" className="btn btn-sm" disabled={ocupado || carregando || inicio + 20 >= total} onClick={() => setInicio(inicio + 20)}>Próxima</button></div>}
    {confirmacao && <div className="obs-doc-confirmacao" role="alertdialog" aria-modal="true" aria-label={confirmacao.acao === 'descartar' ? 'Descartar alterações?' : confirmacao.acao === 'excluir' ? 'Excluir observação?' : 'Restaurar observação?'}><p>{confirmacao.acao === 'descartar' ? 'Descartar as alterações que ainda não foram salvas?' : confirmacao.acao === 'excluir' ? 'Excluir esta observação? Ela permanecerá disponível em Excluídas para recuperação.' : 'Restaurar esta observação?'}</p><div className="obs-doc-acoes"><button type="button" className="btn" disabled={ocupado} onClick={() => setConfirmacao(null)}><X size={14} />Cancelar</button><button type="button" className="btn btn-primario" disabled={ocupado} onClick={confirmar}>{ocupado ? 'Salvando…' : 'Confirmar'}</button></div></div>}
  </section>;
}

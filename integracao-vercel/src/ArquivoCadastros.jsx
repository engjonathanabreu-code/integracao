import { createContext, useContext, useState } from 'react';
import { Folder, Archive, RotateCcw } from 'lucide-react';
import { COLECOES_ARQUIVO, arquivoDoRegistro, arquivadoDiretamente, mapaArquivamento, podeArquivar, vinculadosAoRegistro, alterarArquivamento } from './arquivamento.js';

const ContextoArquivo = createContext(null);
const nomes = { municipios:'Municípios', remessas:'Remessas', nucleos:'Núcleos', processos:'Clientes' };
const nomeRegistro = (r, colecao) => colecao === 'processos' ? `${r.codigo || ''} ${r.requerente?.nome || ''}`.trim() : r.nome || r.titulo || r.codigo || `Remessa ${r.numero || r.id}`;

export function BotaoArquivar({ colecao, registro }) {
  const arquivo = useContext(ContextoArquivo);
  if (!arquivo?.permitido || !registro) return null;
  const abrir = e => { e.stopPropagation(); arquivo.selecionar({ colecao, id:registro.id }); };
  return <button type="button" className="btn-icone" style={{ color:'#b47b08', marginLeft:6, verticalAlign:'middle' }} title={`Arquivar ${nomeRegistro(registro, colecao)}`} aria-label={`Arquivar ${nomeRegistro(registro, colecao)}`} onClick={abrir} onKeyDown={e => e.stopPropagation()}><Folder size={18} fill="#f7cc55" /></button>;
}

export function BotaoArquivo({ colecao, municipioId, remessaId, nucleoId, etapa, etapaCliente, geral = false }) {
  const arquivo = useContext(ContextoArquivo);
  if (!arquivo?.permitido) return null;
  return <button type="button" className="btn btn-sm" onClick={e => { e.stopPropagation(); arquivo.abrir({ colecao, municipioId, remessaId, nucleoId, etapa, etapaCliente }); }} onKeyDown={e => e.stopPropagation()}><Archive size={14} />{geral ? "Arquivo geral" : "Arquivo"}</button>;
}

export default function ArquivoCadastros({ db, usuario, mutar, carregarMunicipio, etapaDoNucleo, pronto, Modal, setToast, children }) {
  const [selecao, selecionar] = useState(null), [escopo, abrir] = useState(null), [busca, setBusca] = useState(''), [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('');
  const permitido = podeArquivar(usuario) && pronto;
  const mapa = mapaArquivamento(db);
  const registro = selecao && db[selecao.colecao]?.find(r => r.id === selecao.id);
  const vinculados = registro ? vinculadosAoRegistro(db, selecao.colecao, registro.id) : null;
  const contagem = vinculados && COLECOES_ARQUIVO.filter(c => vinculados[c].size).map(c => `${vinculados[c].size} ${nomes[c].toLowerCase()}`).join(', ');
  const normalizar = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const salvar = async (colecao, r, arquivar) => {
    setOcupado(true); setErro('');
    try {
      if (r.municipioId) await carregarMunicipio(r.municipioId);
      await mutar(d => alterarArquivamento(d, colecao, r.id, arquivar, usuario), arquivar ? 'Cadastro arquivado' : 'Cadastro restaurado', { municipioId:colecao === 'municipios' ? r.id : r.municipioId, remessaId:colecao === 'remessas' ? r.id : r.remessaId, nucleoId:colecao === 'nucleos' ? r.id : r.nucleoId, processoId:colecao === 'processos' ? r.id : undefined, detalhe:`${nomes[colecao]}: ${nomeRegistro(r,colecao)}` });
      selecionar(null); setToast(arquivar ? 'Cadastro arquivado. Acompanhe a confirmação de gravação.' : 'Cadastro restaurado. Acompanhe a confirmação de gravação.');
    } catch(e) { setErro(e.message); } finally { setOcupado(false); }
  };
  const linhas = !escopo ? [] : COLECOES_ARQUIVO.filter(c => !escopo.colecao || c === escopo.colecao).flatMap(c => (db[c] || []).filter(r => mapa[c].has(r.id)
    && (!escopo.municipioId || r.municipioId === escopo.municipioId) && (!escopo.remessaId || r.remessaId === escopo.remessaId)
    && (!escopo.nucleoId || r.nucleoId === escopo.nucleoId) && (!escopo.etapa || (c === 'nucleos' && etapaDoNucleo(r) === escopo.etapa))
    && (escopo.etapaCliente == null || String(r.etapa) === String(escopo.etapaCliente))
    && normalizar(nomeRegistro(r,c)).includes(normalizar(busca))).map(r => ({ colecao:c, registro:r })));
  return <ContextoArquivo.Provider value={{ permitido, selecionar:s => { setErro(''); selecionar(s); }, abrir:s => { setErro(''); setBusca(''); abrir(s); } }}>
    {children}
    {permitido && registro && <Modal titulo={`Arquivar ${nomeRegistro(registro,selecao.colecao)}?`} onFechar={() => !ocupado && selecionar(null)} rodape={<><button className="btn" disabled={ocupado} onClick={() => selecionar(null)}>Cancelar</button><button className="btn btn-primario" disabled={ocupado} onClick={() => salvar(selecao.colecao,registro,true)}>{ocupado ? 'Arquivando…' : 'Arquivar'}</button></>}>
      <p>O cadastro sai das listas de trabalho e permanece no Arquivo, com seus documentos e histórico.</p>
      {contagem && <p><strong>Também ficarão arquivados pelo vínculo: {contagem}.</strong> Ao restaurar este cadastro, o conjunto volta. Registros arquivados individualmente continuam arquivados.</p>}
      {erro && <p role="alert">{erro}</p>}
    </Modal>}
    {permitido && escopo && <Modal titulo={`Arquivo${escopo.etapa ? ` — ${escopo.etapa}` : ''}`} largura={860} onFechar={() => !ocupado && abrir(null)}>
      <p>Restaure o cadastro para voltar à mesma etapa, mantendo documentos e histórico. Quando o vínculo estiver arquivado, restaure primeiro o cadastro principal.</p>
      <input className="inp" aria-label="Buscar no arquivo" placeholder="Buscar por nome ou código" value={busca} onChange={e => setBusca(e.target.value)} />
      {erro && <p role="alert">{erro}</p>}
      {!linhas.length && <p>Nenhum registro arquivado neste local.</p>}
      {linhas.map(({ colecao, registro:r }) => <div key={`${colecao}:${r.id}`} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid var(--line2)' }}>
        <div style={{ flex:1, minWidth:0 }}><strong>{nomeRegistro(r,colecao)}</strong><div className="ajuda">{nomes[colecao]} · {arquivoDoRegistro(r)?.arquivadoPor || 'Arquivado pelo vínculo'}{arquivoDoRegistro(r)?.arquivadoEm ? ` · ${new Date(arquivoDoRegistro(r).arquivadoEm).toLocaleString('pt-BR')}` : ''}</div></div>
        <button className="btn btn-sm" disabled={ocupado || !arquivadoDiretamente(r)} title={arquivadoDiretamente(r) ? 'Restaurar cadastro' : 'Restaure primeiro o cadastro principal'} onClick={() => salvar(colecao,r,false)}><RotateCcw size={14} />Restaurar</button>
      </div>)}
    </Modal>}
  </ContextoArquivo.Provider>;
}

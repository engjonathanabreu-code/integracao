import { useState } from 'react';
import AbaMemoriais from './AbaMemoriais.jsx';
import { unidadesParaMemoriais, salvarUnidadeMemorial, salvarConfiguracaoMemoriais, contextoDocumentoMemorial } from './integracaoMemoriais.js';
import { lacunasDoDocumento } from '../src/modelos-html.js';

export default function IntegracaoMemoriais({ db, n, municipio, perm, mutar, setToast, montarDocumento, baixarDocumento, Modal, ListaHistorico }) {
  const [documentos, setDocumentos] = useState([]);
  const [erro, setErro] = useState('');
  const [unidades, setUnidades] = useState(() => unidadesParaMemoriais(db.processos, n.id));
  const liberada = n.etapa >= 1;
  const pode = perm.etapa('topografia');
  const editar = pode && n.etapa === 1;
  const log = (u) => ({ nucleoId: n.id, municipioId: n.municipioId, ...(u ? { processoId: u.moradorId, detalhe: u.codigo } : {}) });
  const avisar = (e) => { setErro(e.message); setToast(e.message); };
  const salvar = (unidade, dados) => {
    if (!editar) throw new Error('A edição dos memoriais é feita pela Topografia ou Diretoria durante a etapa Topografia.');
    try {
      mutar(d => salvarUnidadeMemorial(d, unidade, dados, n.id), 'Memorial descritivo gravado', { ...log(unidade), detalhe: `${unidade.codigo}, ${dados.vertices.length} vértices` });
      setUnidades(atuais => atuais.map(u => u.id === unidade.id ? { ...u, ...dados } : u));
      setErro('');
    } catch (e) { avisar(e); throw e; }
  };
  const configurar = (config) => {
    if (!editar || !perm.config) { const e = new Error('Peça à Diretoria para salvar as configurações compartilhadas dos memoriais.'); avisar(e); throw e; }
    mutar(d => salvarConfiguracaoMemoriais(d, config), 'Configuração de memoriais alterada', log());
  };
  const gerar = (unidade, marcadores) => {
    if (!liberada || !pode) { avisar(new Error('Somente a Topografia ou Diretoria pode emitir o memorial.')); return; }
    try {
      const html = montarDocumento(contextoDocumentoMemorial(marcadores));
      const lacunas = lacunasDoDocumento(html);
      if (lacunas.marcadores.length) throw new Error(`Falta preencher no cadastro: ${lacunas.marcadores.join(', ') || 'campos em branco'}.`);
      setDocumentos(atuais => [...atuais, { unidade, html }]); setErro('');
    } catch (e) { avisar(e); }
  };
  return <div className="flex flex-col gap-3">
    {erro && <p role="alert" style={{ color: 'var(--warning)' }}>{erro}</p>}
    {liberada && <p className="ajuda">{n.etapa > 1 ? 'Etapa Topografia concluída: consulta aos memoriais salvos e ao histórico.' : 'Alterações do levantamento são salvas na unidade selecionada. As configurações compartilhadas são mantidas pela Diretoria.'}</p>}
    <AbaMemoriais nucleo={n} municipio={municipio} unidades={unidades} config={db.memoriais} podeEditar={editar} etapaLiberada={liberada} aoSalvarUnidade={salvar} aoSalvarConfig={configurar} aoGerarDocumento={gerar} />
    {liberada && unidades.filter(u => u.memorial).map(u => <details key={u.id}><summary>Memorial salvo — {u.codigo}</summary><p style={{ whiteSpace:'pre-wrap' }}>{u.memorial}</p><p>Área: {u.area} m² · Perímetro: {u.perimetro || 'não informado'} m</p></details>)}
    {liberada && <details><summary>Histórico de memoriais</summary><ListaHistorico itens={db.auditoria.filter(a => a.nucleoId === n.id && /memoria[il]/i.test(a.acao))} vazio="Nenhuma ação registrada." /></details>}
    {documentos.length > 0 && <Modal titulo="Memoriais descritivos" largura={780} onFechar={() => setDocumentos([])}>
      {documentos.map(({ unidade, html }, i) => <section key={`${unidade.id}-${i}`}><h3>{unidade.codigo}</h3><div className="previa-doc" dangerouslySetInnerHTML={{ __html: html }} /><button className="btn btn-primario" disabled={!pode} onClick={() => { if (!pode) return; baixarDocumento(unidade, html); mutar(d => d, 'Documento memorial descritivo emitido', log(unidade)); }}>Baixar memorial para Word — {unidade.codigo}</button></section>)}
    </Modal>}
  </div>;
}

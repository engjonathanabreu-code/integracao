import RevogarMemorial from './RevogarMemorial.jsx';
import { useState } from 'react';
import AbaMemoriais from './AbaMemoriais.jsx';
import { unidadesParaMemoriais, salvarUnidadeMemorial, salvarConfiguracaoMemoriais, contextoDocumentoMemorial, configMemoriaisNucleo } from './integracaoMemoriais.js';
import { lacunasDoDocumento } from '../src/modelos-html.js';

export default function IntegracaoMemoriais({ db, n, municipio, perm, mutar, setToast, montarDocumento, baixarDocumento, Modal, ListaHistorico, por }) {
  const [documentos, setDocumentos] = useState([]);
  const [erro, setErro] = useState('');
  const unidades = unidadesParaMemoriais(db.processos, n.id);
  const liberada = n.etapa >= 1;
  const pode = perm.etapa('topografia') || perm.prf;
  const editar = perm.etapa('topografia') && n.etapa >= 1;
  const log = (u) => ({ nucleoId: n.id, municipioId: n.municipioId, ...(u ? { processoId: u.moradorId, detalhe: u.codigo } : {}) });
  const avisar = (e) => { setErro(e.message); setToast(e.message); };
  const salvar = (unidade, dados) => {
    if (!editar) throw new Error('A edição dos memoriais é feita pela Topografia ou Diretoria durante a etapa Topografia.');
    try {
      mutar(d => salvarUnidadeMemorial(d, unidade, dados, n.id), 'Memorial descritivo gravado', { ...log(unidade), detalhe: `${unidade.codigo}, ${dados.vertices.length} vértices` });
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
    {liberada && <p className="ajuda">{n.etapa > 1 ? 'Memoriais vinculados às unidades. Topografia pode revisar; Projetos e Diretoria também podem emitir os documentos.' : 'Alterações do levantamento são salvas na unidade selecionada. As configurações compartilhadas são mantidas pela Diretoria.'}</p>}
    <AbaMemoriais key={(n.memoriaisRevogados||[]).length} nucleo={n} municipio={municipio} unidades={unidades} config={configMemoriaisNucleo(n,db.memoriais)} podeEditar={editar} etapaLiberada={liberada} aoSalvarUnidade={salvar} aoSalvarConfig={configurar} aoGerarDocumento={gerar} />
    {liberada && unidades.filter(u => u.memorial).map(u => <details key={u.id}><summary>Memorial salvo — {u.codigo}</summary><p style={{ whiteSpace:'pre-wrap' }}>{u.memorial}</p><p>Área: {u.area} m² · Perímetro: {u.perimetro || 'não informado'} m</p><RevogarMemorial db={db} n={n} alvo={{tipo:'unidade',moradorId:u.moradorId,unidadeId:u.unidadeId}} anterior={u} pode={editar} mutar={mutar} por={por} setToast={setToast}/></details>)}
    {liberada && <details><summary>Histórico de memoriais</summary><ListaHistorico itens={db.auditoria.filter(a => a.nucleoId === n.id && /memoria[il]/i.test(a.acao))} vazio="Nenhuma ação registrada." /></details>}
    {documentos.length > 0 && <Modal titulo="Memoriais descritivos" largura={780} onFechar={() => setDocumentos([])}>
      {documentos.map(({ unidade, html }, i) => <section key={`${unidade.id}-${i}`}><h3>{unidade.codigo}</h3><div className="previa-doc" dangerouslySetInnerHTML={{ __html: html }} /><button className="btn btn-primario" disabled={!pode} onClick={async () => { if (!pode) return; try {await baixarDocumento(unidade, html); mutar(d => d, 'Documento memorial descritivo emitido', log(unidade));}catch(e){avisar(e);} }}>Baixar memorial para Word — {unidade.codigo}</button></section>)}
    </Modal>}
  </div>;
}

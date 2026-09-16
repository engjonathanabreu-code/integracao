import { useState } from 'react';
import { interpretarVertices, formatarMedida } from './memoriaisCalculos.js';
import { calcularMemorialNucleo, salvarMemorialNucleo } from './memorialNucleo.js';
import { contextoDocumentoMemorial } from './integracaoMemoriais.js';
import { lacunasDoDocumento } from '../src/modelos-html.js';

export default function MemoriaisNucleo({ db, n, municipio, perm, mutar, setToast, montarDocumento, baixarDocumento, Modal, por }) {
  const [selecao, setSelecao] = useState(null);
  const [nome, setNome] = useState('');
  const [entrada, setEntrada] = useState('');
  const [previa, setPrevia] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const editar = perm.etapa('topografia') && n.etapa === 1;
  const podeGerar = perm.etapa('topografia') && n.etapa >= 1;
  const vias = n.memorial?.vias || [];
  const ruas = [...new Set(db.processos.filter(p => p.nucleoId === n.id).map(p => p.enderecoImovel?.logradouro).concat(n.endereco?.logradouro).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const abrir = via => {
    const anterior = via === 'nucleo' ? n.memorial : via;
    setSelecao({ viaId: via === 'nucleo' ? null : via?.id || crypto.randomUUID(), anterior: structuredClone(anterior || null) });
    setNome(via === 'nucleo' ? `Núcleo ${n.nome || n.codigo}` : via?.nome || '');
    setEntrada('nome\teste\tnorte\tconfrontante\tlongitude\tlatitude\n' + (anterior?.vertices || []).map(v => [v.nome,v.e,v.n,v.confrontante || '',v.longitude || '',v.latitude || ''].join('\t')).join('\n'));
    setMensagem('');
  };
  const calcular = () => {
    if (!nome.trim()) throw new Error('Informe o nome da via.');
    const primeira = entrada.trim().split(/\r?\n/)[0] || '';
    const separador = primeira.includes('\t') ? '\t' : ';';
    const temCabecalho = /(?:^|[;\t])(e|este|x|easting)(?:[;\t]|$)/i.test(primeira);
    const lido = interpretarVertices(temCabecalho ? entrada : ['nome','este','norte','confrontante','longitude','latitude'].join(separador) + '\n' + entrada);
    if (lido.avisos.length) throw new Error(lido.avisos.join(' '));
    const config = db.memoriais || {};
    if (config.sistema === 'Geográfica' && lido.vertices.some(v => !v.longitude || !v.latitude)) throw new Error('No sistema geográfico, inclua também as colunas longitude e latitude de cada vértice; Este e Norte continuam necessários para os cálculos.');
    if (!config.responsavel?.nome || !config.responsavel?.registro || (!config.meridiano && config.sistema !== 'Geográfica')) throw new Error('Preencha responsável técnico, registro e meridiano nas configurações da aba Memoriais dos lotes.');
    return { ...calcularMemorialNucleo(lido.vertices, config), nome: nome.trim() };
  };
  const executar = fn => { try { fn(); } catch(e) { setMensagem(e.message); setToast(e.message); } };
  const salvar = () => executar(() => {
    if (!editar) throw new Error('A edição é liberada para Topografia e Diretoria na etapa Topografia.');
    const dados = calcular();
    mutar(d => salvarMemorialNucleo(d,n.id,selecao.anterior,dados,selecao.viaId,por), 'Memorial do núcleo ou via gravado', { nucleoId:n.id,municipioId:n.municipioId,detalhe:nome });
    setSelecao(s => ({...s, anterior:dados})); setMensagem('Levantamento salvo.');
  });
  const gerar = () => executar(() => {
    if (!podeGerar) throw new Error('Emissão disponível a partir da Topografia.');
    const dados = calcular();
    const config = db.memoriais || {};
    const contexto = contextoDocumentoMemorial({ 'levantamento.nome':nome, 'nucleo.nome':n.nome || n.codigo, 'nucleo.codigo':n.codigo, 'municipio.nome':municipio.nome, 'municipio.uf':municipio.uf,
      'unidade.area':formatarMedida(dados.area), 'unidade.perimetro':formatarMedida(dados.perimetro), 'unidade.memorial':dados.texto,
      'responsavelTecnico.nome':config.responsavel.nome, 'responsavelTecnico.registro':config.responsavel.registro });
    const html = montarDocumento(contexto);
    const lacunas = lacunasDoDocumento(html);
    if (lacunas.marcadores.length) throw new Error(`Falta preencher: ${lacunas.marcadores.join(', ')}.`);
    setPrevia({html,nome});
  });
  return <section className="card" style={{padding:18}}>
    <h3>Memoriais do núcleo e das vias</h3>
    <p className="ajuda">Cadastre o contorno completo do núcleo ou de cada rua. Área e perímetro são calculados pelos vértices. O memorial salvo do núcleo também alimenta o PRF.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button className="btn" onClick={()=>abrir('nucleo')}>Abrir memorial do núcleo</button>
      {vias.map(v=><button className="btn" key={v.id} onClick={()=>abrir(v)}>{v.nome}</button>)}
      <button className="btn" disabled={!editar} onClick={()=>abrir(null)}>+ Memorial de via</button>
    </div>
    {selecao && <div style={{marginTop:16}}>
      <label className="rot" htmlFor="nome-levantamento">{selecao.viaId ? 'Nome da rua/via' : 'Levantamento'}</label>
      <input className="inp" id="nome-levantamento" list="ruas-nucleo" value={nome} disabled={!editar || !selecao.viaId} onChange={e=>setNome(e.target.value)} />
      <datalist id="ruas-nucleo">{ruas.map(r=><option key={r} value={r}/>)}</datalist>
      <label className="rot" htmlFor="vertices-nucleo" style={{marginTop:12}}>Vértices — nome, Este (X), Norte (Y), confrontante</label>
      <p className="ajuda">Cole uma linha por vértice, com colunas separadas por tabulação ou ponto e vírgula. Para uma via, informe o contorno da área, não apenas o eixo da rua.</p>
      <textarea className="inp" id="vertices-nucleo" rows={10} value={entrada} disabled={!editar} onChange={e=>setEntrada(e.target.value)} placeholder={'nome;este;norte;confrontante\nV01;500000;7000000;Rua A\nV02;500010;7000000;Lote 1\nV03;500010;7000010;Lote 2'} />
      {selecao.anterior?.texto && <details><summary>Memorial salvo</summary><p style={{whiteSpace:'pre-wrap'}}>{selecao.anterior.texto}</p></details>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="btn btn-primario" disabled={!editar} onClick={salvar}>Calcular e salvar memorial</button><button className="btn" disabled={!podeGerar} onClick={gerar}>Gerar documento</button></div>
      {mensagem && <p role="status">{mensagem}</p>}
    </div>}
    {previa && <Modal titulo={previa.nome} largura={780} onFechar={()=>setPrevia(null)}><div className="previa-doc" dangerouslySetInnerHTML={{__html:previa.html}}/><button className="btn btn-primario" onClick={()=>{baixarDocumento({codigo:`${n.codigo}-${previa.nome}`},previa.html);mutar(d=>d,'Documento memorial do núcleo ou via emitido',{nucleoId:n.id,municipioId:n.municipioId,detalhe:previa.nome});}}>Baixar memorial para Word</button></Modal>}
  </section>;
}

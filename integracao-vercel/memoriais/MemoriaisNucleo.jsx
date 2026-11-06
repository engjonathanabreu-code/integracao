import RevogarMemorial from './RevogarMemorial.jsx';
import { TIPOS_AREA_PRF } from "../src/cadastros-prf.js";
import { useRef, useState } from 'react';
import { interpretarVertices, formatarMedida } from './memoriaisCalculos.js';
import { calcularMemorialNucleo, salvarMemorialNucleo } from './memorialNucleo.js';
import { contextoDocumentoMemorial, configMemoriaisNucleo } from './integracaoMemoriais.js';
import { lacunasDoDocumento } from '../src/modelos-html.js';
import { criarConfirmacaoRetomavel } from '../geojson/confirmacao-retomavel.js';

export default function MemoriaisNucleo({ db, n, municipio, perm, mutar, setToast, montarDocumento, baixarDocumento, Modal, por }) {
  const [selecao, setSelecao] = useState(null);
  const [tipo, setTipo] = useState('via');
  const [nome, setNome] = useState('');
  const [entrada, setEntrada] = useState('');
  const [previa, setPrevia] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ocupado = useRef(false);
  const [confirmacao] = useState(criarConfirmacaoRetomavel);
  const editarLegado = perm.etapa('topografia') && n.etapa >= 1;
  const editarNucleo = perm.memorialNucleo ?? editarLegado;
  const editar = selecao?.viaId ? editarLegado : editarNucleo;
  const podeGerar = (selecao?.viaId ? false : editarNucleo) || ((perm.etapa('topografia') || perm.prf) && n.etapa >= 1);
  const vias = n.memorial?.vias || [];
  const ruas = [...new Set(db.processos.filter(p => p.nucleoId === n.id).map(p => p.enderecoImovel?.logradouro).concat(n.endereco?.logradouro).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const abrir = via => {
    if(ocupado.current)return;
    confirmacao.invalidar();
    const anterior = via === 'nucleo' ? n.memorial : via;
    setSelecao({ viaId: via === 'nucleo' ? null : via?.id || crypto.randomUUID(), anterior: structuredClone(anterior || null) });
    setTipo(via?.tipo || 'via');
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
    const config = configMemoriaisNucleo(n,db.memoriais);
    if (config.sistema === 'Geográfica' && lido.vertices.some(v => !v.longitude || !v.latitude)) throw new Error('No sistema geográfico, inclua também as colunas longitude e latitude de cada vértice; Este e Norte continuam necessários para os cálculos.');
    if (!config.responsavel?.nome || !config.responsavel?.registro || (!config.meridiano && config.sistema !== 'Geográfica')) throw new Error('Preencha responsável técnico, registro e meridiano nas configurações da aba Memoriais dos lotes.');
    return { ...calcularMemorialNucleo(lido.vertices, config), nome: nome.trim(), tipo };
  };
  const executar = async fn => { if(ocupado.current)return;ocupado.current=true;setSalvando(true);try { await fn(); } catch(e) { setMensagem(e.message); setToast(e.message); } finally { ocupado.current=false;setSalvando(false); } };
  const salvar = () => executar(async () => {
    if (!editar) throw new Error('Seu perfil não possui permissão para editar este levantamento.');
    const dados = calcular();
    await confirmacao.executar(JSON.stringify(['salvar',n.id,selecao,dados]),()=>mutar(d => salvarMemorialNucleo(d,n.id,selecao.anterior,dados,selecao.viaId,por), 'Memorial do núcleo ou via gravado', { nucleoId:n.id,municipioId:n.municipioId,detalhe:nome }));
    setSelecao(s => ({...s, anterior:dados})); setMensagem('Levantamento salvo.');
  });
  const gerar = () => executar(() => {
    confirmacao.invalidar();
    if (!podeGerar) throw new Error('Seu perfil não possui permissão para gerar este memorial.');
    const dados = calcular();
    const config = configMemoriaisNucleo(n,db.memoriais);
    const contexto = contextoDocumentoMemorial({ 'levantamento.nome':nome, 'nucleo.nome':n.nome || n.codigo, 'nucleo.codigo':n.codigo, 'municipio.nome':municipio.nome, 'municipio.uf':municipio.uf,
      'unidade.area':formatarMedida(dados.area), 'unidade.perimetro':formatarMedida(dados.perimetro), 'unidade.memorial':dados.texto,
      'responsavelTecnico.nome':config.responsavel.nome, 'responsavelTecnico.registro':config.responsavel.registro });
    const html = montarDocumento(contexto);
    const lacunas = lacunasDoDocumento(html);
    if (lacunas.marcadores.length) throw new Error(`Falta preencher: ${lacunas.marcadores.join(', ')}.`);
    setPrevia({html,nome});
  });
  return <section className="card" style={{padding:18}}>
    <h3>Memoriais do núcleo, vias e áreas</h3>
    <p className="ajuda">Cadastre o contorno do núcleo, das vias, APP, risco, áreas públicas e servidões. Cada levantamento permanece separado. Área e perímetro são calculados pelos vértices. O memorial salvo do núcleo também alimenta o PRF.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button className="btn" onClick={()=>abrir('nucleo')}>Abrir memorial do núcleo</button>
      {vias.map(v=><button className="btn" key={v.id} onClick={()=>abrir(v)}>{v.nome}</button>)}
      <button className="btn" disabled={!editarLegado||salvando} onClick={()=>abrir(null)}>+ Memorial de via ou área</button>
    </div>
    {selecao && <div style={{marginTop:16}}>
      <label className="rot" htmlFor="tipo-levantamento">Tipo de área</label><select id="tipo-levantamento" className="inp" value={tipo} disabled={!editar || !selecao.viaId || salvando} onChange={e=>{confirmacao.invalidar();setTipo(e.target.value);}}>{TIPOS_AREA_PRF.map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select>
      <label className="rot" htmlFor="nome-levantamento">{selecao.viaId ? 'Nome da via ou área' : 'Levantamento'}</label>
      <input className="inp" id="nome-levantamento" list="ruas-nucleo" value={nome} disabled={!editar || !selecao.viaId || salvando} onChange={e=>{confirmacao.invalidar();setNome(e.target.value);}} />
      <datalist id="ruas-nucleo">{ruas.map(r=><option key={r} value={r}/>)}</datalist>
      <label className="rot" htmlFor="vertices-nucleo" style={{marginTop:12}}>Vértices — nome, Este (X), Norte (Y), confrontante</label>
      <p className="ajuda">Cole uma linha por vértice, com colunas separadas por tabulação ou ponto e vírgula. Para uma via, informe o contorno da área, não apenas o eixo da rua.</p>
      <textarea className="inp" id="vertices-nucleo" rows={10} value={entrada} disabled={!editar || salvando} onChange={e=>{confirmacao.invalidar();setEntrada(e.target.value);}} placeholder={'nome;este;norte;confrontante\nV01;500000;7000000;Rua A\nV02;500010;7000000;Lote 1\nV03;500010;7000010;Lote 2'} />
      {selecao.anterior?.texto && <details><summary>Memorial salvo</summary><p style={{whiteSpace:'pre-wrap'}}>{selecao.anterior.texto}</p></details>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="btn btn-primario" disabled={!editar||salvando} onClick={salvar}>Calcular e salvar memorial</button><button className="btn" disabled={!podeGerar||salvando} onClick={gerar}>Gerar documento</button></div>
      {selecao.anterior?.texto&&<RevogarMemorial db={db} n={n} alvo={{tipo:selecao.viaId?tipo:'nucleo',viaId:selecao.viaId}} anterior={selecao.anterior} pode={editarLegado} mutar={mutar} por={por} setToast={setToast} aoRevogar={()=>{confirmacao.invalidar();setSelecao(null);}}/>}
      {mensagem && <p role="status">{mensagem}</p>}
    </div>}
    {previa && <Modal titulo={previa.nome} largura={780} onFechar={()=>{if(ocupado.current)return;confirmacao.invalidar();setPrevia(null);}}><div className="previa-doc" dangerouslySetInnerHTML={{__html:previa.html}}/><button className="btn btn-primario" disabled={salvando} onClick={()=>executar(async()=>{await confirmacao.executar(JSON.stringify(["emitir",n.id,previa]),async()=>{await baixarDocumento({codigo:`${n.codigo}-${previa.nome}`},previa.html);await mutar(d=>d,'Documento memorial do núcleo ou via emitido',{nucleoId:n.id,municipioId:n.municipioId,detalhe:previa.nome});});})}>Baixar memorial para Word</button></Modal>}
  </section>;
}

import { useRef, useState } from 'react';
import { Upload, MapPin } from 'lucide-react';
import { lerGeoJSON, prepararFeicoes, salvarImportacao, vincularFeicao, memorialDaFeicao } from './levantamento.js';
import { formatarCoordenada, formatarMedida } from '../memoriais/memoriaisCalculos.js';
import { unidadesParaMemoriais } from '../memoriais/integracaoMemoriais.js';
import { TIPOS_AREA_PRF } from '../src/cadastros-prf.js';

export default function ImportadorGeoJSON({db,n,perm,mutar,por,setToast,onVer,onMemoriais}) {
  const entrada=useRef(null);
  const [salvando,setSalvando]=useState(false);
  const [lido,setLido]=useState(null),[campo,setCampo]=useState(''),[previa,setPrevia]=useState(null),[erro,setErro]=useState(''),[selecionada,setSelecionada]=useState(''),[destino,setDestino]=useState(''),[nome,setNome]=useState(''),[confirma,setConfirma]=useState(null);
  const salvo=n.levantamentoGeoJSON;
  const pode=perm.etapa('topografia') && n.etapa>=1;
  const feicoes=previa?.feicoes || salvo?.feicoes || [];
  const feicao=feicoes.find(f=>f.id===selecionada);
  const unidades=unidadesParaMemoriais(db.processos.filter(p=>p.situacao==='Ativo'),n.id);
  const vinculo=feicao?.vinculo;
  const memorialSalvo=vinculo?.tipo==='unidade'?unidades.find(u=>u.moradorId===vinculo.moradorId&&u.unidadeId===vinculo.unidadeId):vinculo?.tipo==='nucleo'?n.memorial:n.memorial?.vias?.find(v=>v.id===feicao?.id);
  const textoMemorial=vinculo?(memorialSalvo?.memorial||memorialSalvo?.texto||'Memorial indisponível. Confira o destino em Memoriais.'):(feicao?memorialDaFeicao(feicao,previa?.epsg||salvo?.epsg):'');
  const executar=async fn=>{if(salvando)return;try{setErro('');setSalvando(true);await fn();}catch(e){setErro(e.message);}finally{setSalvando(false);}};
  const ler=async arquivo=>{
    if(!arquivo)return;
    setErro('');setPrevia(null);setLido(null);setConfirma(null);
    try{
      if(arquivo.size>10*1024*1024)throw new Error('O GeoJSON deve ter até 10 MB.');
      const novo=lerGeoJSON(await arquivo.text());
      setLido({...novo,arquivo:arquivo.name});setCampo('');
    }catch(e){setErro(e.message);}finally{if(entrada.current)entrada.current.value='';}
  };
  const revisar=()=>executar(()=>{const p={...prepararFeicoes(lido,campo),arquivo:lido.arquivo};setPrevia(p);setSelecionada(p.feicoes[0]?.id);});
  const salvar=()=>executar(async()=>{
    if(!pode)throw new Error('Importação disponível na etapa Topografia.');
    await mutar(d=>salvarImportacao(d,n.id,previa,por),'Levantamento GeoJSON importado',{nucleoId:n.id,municipioId:n.municipioId,detalhe:`${previa.arquivo}: ${previa.feicoes.length} feições, campo ${previa.campo}`});
    setPrevia(null);setLido(null);setToast('Levantamento registrado. Agora vincule os polígonos e acompanhe a sincronização no topo.');
  });
  const prepararVinculo=()=>executar(()=>{
    if(!pode || !feicao || feicao.vinculo || previa)throw new Error('Salve a importação e escolha uma feição ainda sem vínculo.');
    const unidade=unidades.find(u=>`unidade:${u.id}`===destino);
    if(!unidade&&!['nucleo',...TIPOS_AREA_PRF.map(([id])=>id)].includes(destino))throw new Error('Escolha um cliente/unidade ou um tipo de área.');
    const alvo=unidade?{tipo:'unidade',moradorId:unidade.moradorId,unidadeId:unidade.unidadeId,nome:`${unidade.codigo} — ${unidade.requerente}`}:{tipo:destino,nome:nome.trim()||feicao.codigo};
    const anterior=unidade || (destino==='nucleo'?n.memorial:null);
    setConfirma({alvo,anterior:structuredClone(anterior||null),feicao:structuredClone(feicao)});
  });
  const vincular=()=>executar(async()=>{
    if(!pode)throw new Error('Vinculação disponível na etapa Topografia.');
    await mutar(d=>vincularFeicao(d,n.id,confirma.feicao,confirma.alvo,confirma.anterior,por),'Feição vinculada ao memorial',{nucleoId:n.id,municipioId:n.municipioId,processoId:confirma.alvo.moradorId,detalhe:`${confirma.feicao.codigo} → ${confirma.alvo.nome}`});
    setConfirma(null);setDestino('');setToast('Vínculo registrado. Memorial preenchido; acompanhe a sincronização no topo.');
  });
  const selecionar=f=>{setSelecionada(f.id);setDestino('');setConfirma(null);setNome(f.codigo);if(!previa)onVer(f);};
  return <section className="card" style={{padding:18,minWidth:0}}>
    <div className="flex flex-wrap items-center gap-2"><h3 style={{margin:0,flex:1}}>Lotes e áreas do GeoJSON</h3><button className="btn" disabled={!pode||salvando} onClick={()=>entrada.current?.click()}><Upload size={15}/>{salvo?.feicoes?.length?'Adicionar GeoJSON':'Importar GeoJSON'}</button></div>
    <p className="ajuda">Importe os polígonos do QGIS, confira os vértices e vincule cada lote à unidade do cliente ou a uma área do núcleo. SIRGAS 2000 / UTM Sul, fusos 18 a 25. Os dados são salvos somente após sua confirmação.</p>
    {!pode&&<p className="ajuda">Importação e vínculo disponíveis para Topografia e Diretoria a partir da etapa Topografia.</p>}
    <input ref={entrada} type="file" accept=".geojson,.json" aria-label="Arquivo GeoJSON" style={{display:'none'}} onChange={e=>ler(e.target.files?.[0])}/>
    {salvo&&<p className="ajuda">{salvo.arquivo} · EPSG {salvo.epsg} · código: {salvo.campo} · importado por {salvo.por}. {feicoes.filter(f=>f.vinculo).length} de {feicoes.length} vinculados. A importação existente é preservada.</p>}
    {lido&&<div style={{padding:12,background:'var(--bg)',borderRadius:8}}><strong>{lido.arquivo} · {lido.dados.features.length} feições · EPSG {lido.epsg}</strong><label className="rot" htmlFor="codigo-geojson">Campo de código das feições</label><select id="codigo-geojson" className="inp" value={campo} onChange={e=>{setCampo(e.target.value);setPrevia(null);}}><option value="">Selecione o campo de lote ou código do processo</option>{lido.campos.map(c=><option key={c}>{c}</option>)}</select><div className="flex flex-wrap gap-2" style={{marginTop:10}}><button className="btn" disabled={!campo} onClick={revisar}>Conferir lotes e vértices</button><button className="btn" onClick={()=>{setLido(null);setPrevia(null);}}>Cancelar importação</button>{previa&&<button className="btn btn-primario" disabled={salvando} onClick={salvar}>Confirmar importação de {feicoes.length} feições</button>}</div></div>}
    {!!feicoes.length&&<div className="rolagem" style={{marginTop:12}}><table className="tab"><thead><tr><th>Código</th><th>Vértices</th><th>Área m²</th><th>Perímetro m</th><th>Destino</th><th>Ação</th></tr></thead><tbody>{feicoes.map(f=><tr key={f.id} style={f.id===selecionada?{background:'rgba(26,154,146,.1)'}:{}}><td><strong>{f.codigo}</strong></td><td>{f.vertices.length}</td><td>{formatarMedida(f.area)}</td><td>{formatarMedida(f.perimetro)}</td><td>{f.vinculo?.nome||'A vincular'}</td><td><button className="btn btn-sm" onClick={()=>selecionar(f)}><MapPin size={13}/>Conferir {f.codigo}</button></td></tr>)}</tbody></table></div>}
    {feicao&&<div style={{marginTop:16}}><h4>{feicao.codigo} — vértices e lados</h4><div className="rolagem"><table className="tab"><thead><tr>{['Estação','Vante','Este (E)','Norte (N)','Longitude','Latitude','Azimute','Distância (m)'].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{feicao.vertices.map((v,i)=><tr key={i}><td>{v.nome}</td><td>{feicao.vertices[(i+1)%feicao.vertices.length].nome}</td><td>{formatarCoordenada(v.e)}</td><td>{formatarCoordenada(v.n)}</td><td>{v.longitude}</td><td>{v.latitude}</td><td>{v.azimute}</td><td>{formatarMedida(v.distancia)}</td></tr>)}</tbody></table></div>
      {!previa&&!feicao.vinculo&&pode&&<div style={{marginTop:12}}><label className="rot" htmlFor="destino-feicao">Vincular {feicao.codigo} a</label><select className="inp" id="destino-feicao" value={destino} onChange={e=>{setDestino(e.target.value);setConfirma(null);}}><option value="">Escolha o destino</option><optgroup label="Clientes — unidade imobiliária">{unidades.map(u=><option key={u.id} value={`unidade:${u.id}`}>{u.codigo} — {u.requerente} — {u.lote?`Lote ${u.lote}`:u.loteQuadra||'lote não informado'}</option>)}</optgroup><optgroup label="Núcleo e outras áreas"><option value="nucleo">Contorno do núcleo</option>{TIPOS_AREA_PRF.map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</optgroup></select>{destino&&!destino.startsWith('unidade:')&&<><label className="rot" htmlFor="nome-area-geojson">Nome da área</label><input className="inp" id="nome-area-geojson" value={nome} onChange={e=>{setNome(e.target.value);setConfirma(null);}}/></>}<button className="btn" style={{marginTop:10}} disabled={!destino} onClick={prepararVinculo}>Revisar vínculo</button></div>}
      {feicao.vinculo&&<p role="status">Vinculado a {feicao.vinculo.nome}, por {feicao.vinculo.por}, em {new Date(feicao.vinculo.em).toLocaleString('pt-BR')}.</p>}
      {(confirma||feicao.vinculo)&&<section style={{marginTop:16,padding:18,background:'var(--bg)',borderRadius:12}} aria-label="Memorial descritivo"><h4>{feicao.vinculo?'Memorial gerado':'Prévia do memorial descritivo'}</h4><p className="ajuda">{confirma?.alvo.nome||feicao.vinculo?.nome} · Área {formatarMedida(feicao.area)} m² · Perímetro {formatarMedida(feicao.perimetro)} m</p><p style={{lineHeight:1.8}}>{textoMemorial}</p><p className="ajuda">Os confrontantes podem ser complementados em Memoriais. As medidas e o texto alimentam o PRF do destino confirmado.</p>{feicao.vinculo&&onMemoriais&&<button className="btn" onClick={onMemoriais}>Abrir Memoriais</button>}</section>}
      {confirma&&<div role="region" aria-label="Confirmar vínculo" style={{marginTop:12,padding:12,border:'1px solid var(--border)',borderRadius:8}}><p><strong>{confirma.feicao.codigo} → {confirma.alvo.nome}</strong></p><p>Serão preenchidos os vértices, área, perímetro e texto do memorial deste destino. {confirma.anterior?.memorial||confirma.anterior?.texto?'O memorial existente será substituído.':'Os demais dados do cadastro serão preservados.'}</p><div className="flex gap-2"><button className="btn btn-primario" disabled={salvando} onClick={vincular}>Confirmar vínculo e preencher memorial</button><button className="btn" onClick={()=>setConfirma(null)}>Cancelar</button></div></div>}
    </div>}
    {erro&&<p className="msg-erro" role="alert">{erro}</p>}
  </section>;
}

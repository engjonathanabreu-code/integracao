import {useRef,useState} from 'react';
import {Upload} from 'lucide-react';
import {lerKMLGeografico,salvarPerimetroGeografico,LIMITES_GEOGRAFIA,poligonosDaGeometria} from './geometria-geografica.js';
import PreviaGeometria from './PreviaGeometria.jsx';
import {criarConfirmacaoRetomavel} from './confirmacao-retomavel.js';

export default function ImportadorPerimetro({n,podeImportar=false,mutar,por,setToast=()=>{},aoSalvar=()=>{},renderPrevia,extrairKMZ}){
  const entrada=useRef(null),ocupado=useRef(false);
  const [confirmacao]=useState(criarConfirmacaoRetomavel);
  const [previa,setPrevia]=useState(null),[selecionadas,setSelecionadas]=useState([]),[confirmado,setConfirmado]=useState(false),[erro,setErro]=useState(''),[salvando,setSalvando]=useState(false);
  const substitui=!!(previa?.anterior?.poligonos?.length||previa?.anterior?.geojson?.features?.length);
  const escolhidas=previa?{type:'FeatureCollection',features:previa.geojson.features.filter((_,i)=>selecionadas.includes(i))}:null;
  const ler=async arquivo=>{
    if(!arquivo||!podeImportar||ocupado.current)return;
    confirmacao.invalidar();
    setErro('');setPrevia(null);setConfirmado(false);
    try{
      if(!/\.km[lz]$/i.test(arquivo.name))throw new Error('Escolha um arquivo .kml ou .kmz.');
      if(arquivo.size>LIMITES_GEOGRAFIA.bytes)throw new Error('O KML deve ter até 10 MB.');
      const kmz=/\.kmz$/i.test(arquivo.name);
      if(kmz&&!extrairKMZ)throw new Error('Neste navegador, envie o KML descompactado.');
      const geojson=lerKMLGeografico(kmz?await extrairKMZ(arquivo):await arquivo.text());
      setPrevia({geojson,arquivo:arquivo.name,anterior:structuredClone(n.geo||null)});
      setSelecionadas(geojson.features.length===1?[0]:[]);
    }catch(e){setErro(e.message||'Não foi possível ler o KML.');}
    finally{if(entrada.current)entrada.current.value='';}
  };
  const salvar=async()=>{
    if(ocupado.current||!podeImportar||!escolhidas?.features.length||substitui&&!confirmado)return;
    ocupado.current=true;setSalvando(true);setErro('');
    try{
      await confirmacao.executar(JSON.stringify(['perimetro',n.id,previa.arquivo,previa.anterior,escolhidas,confirmado]),()=>mutar(d=>salvarPerimetroGeografico(d,n.id,escolhidas,{anterior:previa.anterior,confirmarSubstituicao:confirmado,arquivo:previa.arquivo,por}),'Perímetro do núcleo importado',{nucleoId:n.id,municipioId:n.municipioId,detalhe:`${previa.arquivo}: ${escolhidas.features.length} feições selecionadas`}));
      aoSalvar(escolhidas);setPrevia(null);setSelecionadas([]);setConfirmado(false);setToast('Perímetro salvo.');
    }catch(e){setErro(e.message||'Não foi possível salvar. A prévia foi mantida para tentar novamente.');}
    finally{ocupado.current=false;setSalvando(false);}
  };
  return <div style={{minWidth:0}}>
    <input ref={entrada} type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml" aria-label="Arquivo KML da área do núcleo" style={{display:'none'}} onChange={e=>ler(e.target.files?.[0])}/>
    <button className="btn btn-sm" disabled={!podeImportar||salvando} onClick={()=>entrada.current?.click()}><Upload size={13}/>Importar KML</button>
    {previa&&<section className="card" style={{padding:16,marginTop:12}} aria-label="Conferir importação do perímetro">
      <strong>{previa.arquivo}</strong>
      <p className="ajuda">Selecione os contornos que pertencem a este núcleo e confira a prévia. As áreas numéricas e os memoriais existentes serão preservados.</p>
      <div style={{maxHeight:240,overflow:'auto',marginBottom:12}}>{previa.geojson.features.map((f,i)=><label key={i} style={{display:'flex',gap:8,padding:'6px 0',alignItems:'flex-start'}}><input type="checkbox" disabled={salvando} checked={selecionadas.includes(i)} onChange={e=>{confirmacao.invalidar();setSelecionadas(xs=>e.target.checked?[...xs,i]:xs.filter(x=>x!==i));setConfirmado(false);}}/><span>{f.properties.nome||`Área ${i+1}`} — {poligonosDaGeometria(f.geometry).length} polígono(s)</span></label>)}</div>
      {escolhidas.features.length>0&&(renderPrevia?renderPrevia(escolhidas):<PreviaGeometria geojson={escolhidas}/>)}
      {substitui&&<label style={{display:'flex',gap:8,marginTop:12}}><input type="checkbox" disabled={salvando} checked={confirmado} onChange={e=>{confirmacao.invalidar();setConfirmado(e.target.checked);}}/><span>Confirmo substituir o perímetro atual deste núcleo ({previa.anterior.arquivo||'geometria existente'}) pelos contornos selecionados.</span></label>}
      <div className="flex flex-wrap gap-2" style={{marginTop:12}}><button className="btn btn-primario" disabled={salvando||!selecionadas.length||substitui&&!confirmado} onClick={salvar}>{salvando?'Salvando…':'Salvar perímetro selecionado'}</button><button className="btn" disabled={salvando} onClick={()=>{confirmacao.invalidar();setPrevia(null);setErro('');}}>Cancelar</button></div>
    </section>}
    {erro&&<p className="msg-erro" role="alert">{erro}</p>}
  </div>;
}

import { useState } from 'react';
import { INFRA_PRF, CRONOGRAMA_PRF } from './cadastros-prf.js';
import { unirCampos } from './persistencia-modulos.js';

function Escolha({valor,onChange,disabled,rotulo}) {
  return <label className="rot">{rotulo}<select className="inp" disabled={disabled} value={valor === true ? 'sim' : valor === false ? 'nao' : ''} onChange={e=>onChange(e.target.value === '' ? null : e.target.value === 'sim')}><option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>;
}
export function InfraestruturaPRF({dados={},onChange,disabled}) {
  return <section><h3>Infraestrutura do núcleo</h3><p className="ajuda">As respostas e descrições alimentam o PRF.</p>{INFRA_PRF.map(([id,nome])=><fieldset key={id} style={{border:'1px solid var(--line)',borderRadius:10,padding:12,marginBottom:10}}><legend>{nome}</legend>
    <Escolha rotulo={nome+' — existe / será executada?'} valor={dados[id]?.presente} disabled={disabled} onChange={presente=>onChange({...dados,[id]:{...dados[id],presente}})}/>
    {dados[id]?.presente === true && <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>{[['vias','Vias atendidas'],['via1','Via inicial'],['via2','Via final'],['descricao','Descrição para o PRF']].map(([campo,rotulo])=><label key={campo} className="rot">{rotulo}<textarea rows={campo==='descricao'?3:1} className="inp" disabled={disabled} value={dados[id]?.[campo] || ''} onChange={e=>onChange({...dados,[id]:{...dados[id],[campo]:e.target.value}})}/></label>)}</div>}
  </fieldset>)}</section>;
}
export function CronogramaFisico({n,perm,mutar,onFechar,Modal,setToast}) {
  const [dados,setDados]=useState(()=>structuredClone(n.cronograma || {}));
  const pode=perm.etapa('projeto') && n.etapa===2;
  const faltam=CRONOGRAMA_PRF.filter(([id])=>dados[id]===true && !String(dados[id+'Prazo'] || '').trim());
  const salvar=()=>{
    if(!pode || faltam.length)return;
    mutar(d=>{const atual=d.nucleos.find(x=>x.id===n.id);atual.cronograma=unirCampos(atual.cronograma,dados);return d;},'Cronograma físico atualizado',{nucleoId:n.id,municipioId:n.municipioId});
    setToast('Cronograma físico salvo.');onFechar();
  };
  return <Modal titulo="Cronograma Físico" largura={760} onFechar={onFechar} rodape={<button className="btn btn-primario" disabled={!pode || !!faltam.length} onClick={salvar}>Salvar cronograma</button>}>
    <p className="ajuda">{pode ? 'Marque Sim e informe o prazo para cada obra prevista. Itens marcados Não são retirados do PRF.' : 'Preenchimento pela equipe de Projeto ou Diretoria durante a etapa Projeto.'}</p>
    {CRONOGRAMA_PRF.map(([id,nome])=><fieldset key={id} style={{border:'1px solid var(--line)',padding:12,borderRadius:10,marginBottom:10}}><legend>{nome}</legend><Escolha rotulo={'Prever '+nome.toLowerCase()} valor={dados[id]} disabled={!pode} onChange={v=>setDados(d=>({...d,[id]:v}))}/>{dados[id]===true && <label className="rot">Prazo de execução<input className="inp" value={dados[id+'Prazo'] || ''} disabled={!pode} placeholder="Ex.: 12 meses após aprovação" onChange={e=>setDados(d=>({...d,[id+'Prazo']:e.target.value}))}/></label>}</fieldset>)}
    {!!faltam.length && <p role="alert">Informe o prazo: {faltam.map(([,nome])=>nome).join(', ')}.</p>}
  </Modal>;
}

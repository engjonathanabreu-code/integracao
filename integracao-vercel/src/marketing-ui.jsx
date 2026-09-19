import {useEffect,useRef} from 'react';
import {X,Trash2} from 'lucide-react';
import {CampoCRM,EstadoModulo} from './modulo-ui.jsx';
export const MESES_MARKETING=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export function JanelaMarketing({titulo,fechar,children}) {
 const ref=useRef(null);
 useEffect(()=>{const d=ref.current;d.showModal();return()=>d.close();},[]);
 return <dialog ref={ref} className="mkt-dialogo" aria-label={titulo} onCancel={e=>{e.preventDefault();fechar();}}><header><h2>{titulo}</h2><button className="btn mkt-icon-button" aria-label="Fechar janela" onClick={fechar}><X size={20}/></button></header>{children}</dialog>;
}
export function MunicipioMarketing({db,value,onChange,opcional=false}) {
 return <CampoCRM nome="Município"><select className="inp" required={!opcional} value={value||''} onChange={e=>onChange(e.target.value)}><option value="">{opcional?'Todos os municípios':'Selecione o município'}</option>{[...db.municipios].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(m=><option key={m.id} value={m.id}>{m.nome}/{m.uf}</option>)}</select></CampoCRM>;
}
export function RemoverMarketing({titulo,modulo,confirmar,fechar}) {
 return <JanelaMarketing titulo={`Remover ${titulo}`} fechar={fechar}><p>Este card sairá do quadro. Os dados e o histórico serão preservados.</p><EstadoModulo modulo={modulo}/><div className="mkt-form-acoes"><button className="btn" onClick={fechar}>Cancelar</button><button className="btn btn-perigo" disabled={modulo.ocupado} onClick={async()=>{if(await modulo.executar(confirmar))fechar();}}><Trash2 size={16}/> Confirmar remoção</button></div></JanelaMarketing>;
}
export const nomeMunicipio=(db,id)=>{const m=db.municipios.find(m=>m.id===id);return m?`${m.nome}/${m.uf}`:'Município não disponível';};
export const dataMarketing=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR'):'Sem prazo';

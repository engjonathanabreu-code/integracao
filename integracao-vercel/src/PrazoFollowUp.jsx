import {CampoCRM} from './modulo-ui.jsx';
import {PRAZOS_FOLLOWUP,MAX_DIAS_FOLLOWUP,dataPrazoFollowup,diasPrazoFollowup} from './crm-followup.js';
export default function PrazoFollowUp({nome='Prazo de FollowUp',value,onChange}){
 const dias=diasPrazoFollowup(value);
 return <div>
  <CampoCRM nome={nome}><select aria-label={nome} className="inp" required value={value.modo} onChange={e=>onChange({...value,modo:e.target.value})}>
   <option value="">Selecione o prazo</option>{PRAZOS_FOLLOWUP.map(d=><option key={d} value={d}>{d} {d===1?'dia':'dias'}</option>)}
   <option value="calendario">Personalizado: calendário</option><option value="personalizado">Personalizado: dias</option>
  </select></CampoCRM>
  {value.modo==='calendario'&&<CampoCRM nome="Data do próximo FollowUp"><input aria-label="Data do próximo FollowUp" className="inp" type="date" required min={dataPrazoFollowup(1)} max={dataPrazoFollowup(MAX_DIAS_FOLLOWUP)} value={value.data||''} onChange={e=>onChange({...value,data:e.target.value})}/></CampoCRM>}
  {value.modo==='personalizado'&&<CampoCRM nome="Quantidade de dias"><input aria-label="Quantidade de dias" className="inp" type="number" required min="1" max={MAX_DIAS_FOLLOWUP} step="1" value={value.dias||''} onChange={e=>onChange({...value,dias:e.target.value})}/></CampoCRM>}
  <p className="ajuda">Dias corridos, de 1 a {MAX_DIAS_FOLLOWUP}, no horário de Brasília. O próximo contato mantém o horário deste registro.{dias&&<> Data prevista: {dataPrazoFollowup(dias).split('-').reverse().join('/')}.</>}</p>
 </div>;
}

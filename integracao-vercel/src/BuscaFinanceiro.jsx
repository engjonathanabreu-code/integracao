import {useMemo,useState} from 'react';
import {CampoBusca} from './BuscaClientes.jsx';
import {useModulo,EstadoModulo} from './modulo-ui.jsx';
import {lerIndiceClientes} from './dados-compartilhados.js';
import {reunirClientes,filtrarClientes} from './busca-clientes.js';
import {normalizarCRM} from './crm-regras.js';

export default function BuscaFinanceiro({db,abrir}) {
 const [busca,setBusca]=useState('');
 const m=useModulo(()=>lerIndiceClientes(),[],['clientes']);
 const clientes=useMemo(()=>reunirClientes(m.dados?.clientes||[],m.dados?.complementos||[],db),[m.dados,db]);
 const termo=normalizarCRM(busca.trim());
 const locais=useMemo(()=>[
  ...db.municipios.map(m=>({tipo:'municipio',id:m.id,municipio:m.id,nome:m.nome,contexto:`Município · ${m.uf||''}`})),
  ...db.remessas.map(r=>({tipo:'remessa',id:r.id,municipio:r.municipioId,remessa:r.id,nome:r.titulo||r.codigo||`Remessa ${r.numero||''}`,contexto:`Remessa · ${db.municipios.find(m=>m.id===r.municipioId)?.nome||''}`})),
  ...db.nucleos.map(n=>({tipo:'nucleo',id:n.id,municipio:n.municipioId,remessa:n.remessaId||'',nucleo:n.id,nome:[n.codigo,n.nome].filter(Boolean).join(' '),contexto:`Núcleo · ${db.municipios.find(m=>m.id===n.municipioId)?.nome||''}`}))
 ],[db.municipios,db.remessas,db.nucleos]);
 const resultados=termo?[
  ...locais.filter(x=>normalizarCRM(x.nome+' '+x.contexto).includes(termo)),
  ...filtrarClientes(clientes,busca).filter(c=>c.financeiroRef).map(c=>({tipo:'cliente',id:c.financeiroRef,municipio:c.municipioId,remessa:c.remessaId||'',nucleo:c.nucleoId||'',nome:c.requerente?.nome,contexto:`Cliente · ${c.codigo||''} · ${db.municipios.find(m=>m.id===c.municipioId)?.nome||''}`}))
 ]:[];
 return <section className="card fin-busca" aria-label="Busca no financeiro">
  <CampoBusca autoFocus aria-label="Buscar no financeiro" placeholder="Município, remessa, núcleo, cliente ou código" value={busca} onChange={e=>setBusca(e.target.value)}/>
  <EstadoModulo modulo={m}/>
  <p className="ajuda" role="status">{termo?`${resultados.length} resultado(s)${resultados.length>60?' · Refine a busca para ver os demais':''}`:'Busque um local ou cliente para abrir seus dados financeiros.'}</p>
  <div className="fin-busca-resultados">{resultados.slice(0,60).map(r=><button key={`${r.tipo}:${r.id}`} className="item-busca" onClick={()=>abrir(r)}><strong>{r.nome}</strong><span className="ajuda">{r.contexto}</span></button>)}</div>
 </section>;
}

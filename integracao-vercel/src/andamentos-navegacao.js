import {agruparAndamentosMunicipios} from './andamentos-municipios.js';
import {referenciaNucleo} from './processo-etapas.js';
import {compararTextos} from './ordenacao.js';
const texto=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
// Projecao visual dos dados ja carregados: nenhuma consulta ou mudanca de escopo.
export function municipiosParaNavegacao(itens,db,{nucleo='',busca=''}={}) {
 const nucleos=new Map((db.nucleos||[]).map(n=>[referenciaNucleo(n),n]));
 const grupos=new Map((db.municipios||[]).map(m=>[m.id,{id:m.id,nome:(m.nome||'Município sem nome')+(m.uf?' / '+m.uf:''),itens:[],nucleos:0}]));
 for(const g of agruparAndamentosMunicipios(itens,db))grupos.set(g.id,{...g,nucleos:0});
 for(const n of nucleos.values()){const g=grupos.get(n.municipioId);if(g)g.nucleos++;}
 const termo=texto(busca),destino=nucleos.get(nucleo)?.municipioId;
 return [...grupos.values()].map(g=>{
  const porNucleo=g.itens.filter(a=>!nucleo||a.processo_id===nucleo),nomeCorresponde=texto(g.nome).includes(termo);
  const filtrados=nomeCorresponde?porNucleo:porNucleo.filter(a=>{const n=nucleos.get(a.processo_id);return texto([n?.codigo,n?.nome,a.descricao_cliente,a.status].filter(Boolean).join(' ')).includes(termo);});
  return {...g,itens:filtrados,total:g.itens.length,corresponde:(!nucleo||g.id===(destino||'municipio-indisponivel'))&&(!termo||nomeCorresponde||filtrados.length>0)};
 }).sort((a,b)=>(a.id==='municipio-indisponivel')-(b.id==='municipio-indisponivel')||compararTextos(a.nome,b.nome)||compararTextos(a.id,b.id));
}

import {igualSemantico as igual} from './igualdade-semantica.js';

const canonico='fin_receb_clientes',codigo='CLIENTE_SEM_VINCULO_CANONICO';
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const arquivosVazios=a=>a&&Object.getPrototypeOf(a)===Object.prototype&&Object.keys(a).length===0;

export function escopoRetomadaVinculo(item){
 const o=item?.original,ed=o?.intencao?.edicoes;
 if(o?.modulo!=='processos'||o.protocolo!==2||o.preparar!==true||o.legado||
    !Array.isArray(o.operacoes)||o.operacoes.length!==0||!arquivosVazios(o.intencao?.arquivos)||
    !Array.isArray(ed)||ed.length<1||ed.length>2)return null;
 const fichas=ed.filter(e=>e?.colecao==='processos');
 if(fichas.length!==1)return null;
 const [f]=fichas;
 if(typeof f.id!=='string'||!f.id||f.antes?.existe!==true||f.depois?.existe!==true||
    f.antes.valor?.id!==f.id||f.depois.valor?.id!==f.id||
    ['financeiroRef','municipioId','remessaId','codigo','docs','campo'].some(k=>!igual(f.antes.valor[k],f.depois.valor[k])))return null;
 if(ed.some(e=>e!==f&&(e?.colecao!=='auditoria'||typeof e.id!=='string'||!e.id||
    e.antes?.existe!==false||e.depois?.existe!==true||e.depois.valor?.id!==e.id||
    e.depois.valor?.acao!=='Cadastro alterado')))return null;
 return f;
}

export function podeRetomarVinculo(item){
 return item?.estado==='bloqueado_validacao'&&item.erro?.codigo===codigo&&
  item.fase==='preparacao'&&item.erro.fase==='preparacao'&&!item.vinculoCanonicoReavaliado&&
  item.payload==null&&item.preparado==null&&item.recibo==null&&item.enviadoEm==null&&item.confirmadoEm==null&&
  item.tentativas===0&&(item.tentativasTotais??0)===0&&!!escopoRetomadaVinculo(item);
}

export function vinculoConfirmadoParaRetomada(item,edicoes,remoto){
 const f=escopoRetomadaVinculo(item),base=remoto?.base;
 if(!f||!igual(edicoes,item.original.intencao.edicoes)||!Array.isArray(base?.fin_receb_clientes)||
    !Array.isArray(base.integracao_moradores))return false;
 const registros=base.integracao_moradores.filter(r=>r.colecao==='processos'&&r.registro_id===f.id);
 if(registros.length!==1)return false;
 const [r]=registros;
 if(r.referencia_tabela!==canonico||!uuid(r.referencia_id))return false;
 if(base.integracao_moradores.some(x=>x!==r&&x.colecao==='processos'&&x.referencia_id===r.referencia_id))return false;
 if(base.integracao_complementos?.some(x=>x.colecao==='processos'&&x._tabela!=='integracao_moradores'&&
    (x.registro_id===f.id||x.referencia_id===r.referencia_id)))return false;
 const clientes=base.fin_receb_clientes.filter(c=>c.id===r.referencia_id);
 const fichas=remoto.db?.processos?.filter(p=>p.id===f.id);
 return clientes.length===1&&fichas?.length===1&&fichas[0].financeiroRef===r.referencia_id
    ?{registro:f.id,referencia_tabela:canonico,referencia_id:r.referencia_id}:null;
}


// Assert the same relationship under the database row lock. These fields are
// in expected, never in changes; another session cannot silently redirect the
// edit between the fresh read and the write. A recovered request may update
// that complement (+ its initial audit) but not any other business record.
export function limitarOperacoesRetomada(item,pronto,vinculo){
 const escopo=escopoRetomadaVinculo(item);
 const auditoria=item.original.intencao.edicoes.find(e=>e.colecao==='auditoria')?.id;
 if(!escopo||!vinculo||!Array.isArray(pronto.operacoes))throw Error('Escopo de recuperação inválido.');
 const falha=()=>Object.assign(Error('A alteração precisa ser revisada para manter o vínculo da ficha.'),{code:codigo,status:422});
 if(Object.keys(pronto.sent||{}).length||Object.keys(pronto.identicos||{}).length)throw falha();
 return {...pronto,operacoes:pronto.operacoes.map(op=>{
  if(!op||op.action||op.tempId||op.remove)throw falha();
  if(op.table==='integracao_auditoria'&&auditoria&&op.insert===true&&
     igual(op.key,{colecao:'auditoria',registro_id:auditoria}))return op;
  if(op.table!=='integracao_moradores'||op.insert||
     !igual(op.key,{colecao:'processos',registro_id:escopo.id})||
     !Object.hasOwn(op.expected||{},'dados')||!Object.hasOwn(op.changes||{},'dados')||
     Object.keys(op.changes).some(k=>!['dados','updated_at'].includes(k)))throw falha();
  return {...op,expected:{...op.expected,referencia_tabela:vinculo.referencia_tabela,referencia_id:vinculo.referencia_id}};
 })};
}

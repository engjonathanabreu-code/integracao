// JSON objects are unordered; arrays, numeric types and null remain meaningful.
export function igualSemantico(a,b){
 if(a===b)return true;
 if(a===null||b===null||typeof a!==typeof b||typeof a!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>igualSemantico(v,b[i]));
 const ka=Object.keys(a),kb=Object.keys(b);
 return ka.length===kb.length&&ka.every(k=>Object.hasOwn(b,k)&&igualSemantico(a[k],b[k]));
}

// Contrato C4: exceções explícitas por coleção e caminho; igualSemantico continua
// estrita. `caminho` é relativo ao registro; '*' é a identidade de um item de lista.
// Cada entrada aponta a prova de que o servidor devolve a mesma intenção em outra forma.
// Campos financeiros não têm adaptador: usam a projeção de contrato-financeiro.js.
const ID_USUARIO=/^(?:erp_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TIPOS_ADAPTADOR=Object.freeze(['conjunto','nulo_vazio','numero','gerado_servidor']);
export const adaptadoresCampo=Object.freeze([
 // Linhas de meta_responsaveis; a leitura não preserva a ordem marcada. Dados
 // inválidos nunca provam um conjunto de identidades (contrato anterior).
 {colecao:'metas',caminho:['responsaveis'],tipo:'conjunto',elemento:ID_USUARIO,invalido:'diverge'},
 // Projeção [associacao_id]: conjunto de identidades de núcleo.
 {colecao:'metas',caminho:['nucleos'],tipo:'conjunto'},
 // etapa_responsaveis é lido com order=etapa_id,usuario_id (dados-compartilhados.js).
 {colecao:'planos',caminho:['etapas','*','responsaveis'],tipo:'conjunto'},
 // uuid[] de erp_eventos/erp_conversas: pertencimento, sem ordem de negócio.
 {colecao:'eventos',caminho:['participantes'],tipo:'conjunto'},
 {colecao:'conversas',caminho:['participantes'],tipo:'conjunto'},
 // Destinos e leitores. integracao_gravar acrescenta o leitor ao lidaPor atual
 // do servidor (migration 20260928164241), não à lista enviada.
 {colecao:'notificacoes',caminho:['usuarios'],tipo:'conjunto'},
 {colecao:'notificacoes',caminho:['setores'],tipo:'conjunto'},
 // Outro leitor simultâneo também é acrescentado: na confirmação o servidor pode
 // conter leitores a mais (aditivo), nunca a menos. A conciliação continua por conjunto.
 {colecao:'notificacoes',caminho:['lidaPor'],tipo:'conjunto',aditivo:true},
 // Chaves alternadas por includes() no calendário (alternarAgenda/ocultar em App.jsx).
 {colecao:'usuarios',caminho:['agendaPessoal'],tipo:'conjunto'},
 {colecao:'usuarios',caminho:['calendarioOculto'],tipo:'conjunto'},
 // O login grava setorERP:p.setor||'' e a projeção canônica devolve profiles.setor (null).
 {colecao:'usuarios',caminho:['setorERP'],tipo:'nulo_vazio'},
 // O encoder grava nullText('')=null e a projeção devolve r.descricao sem text().
 {colecao:'eventos',caminho:['descricao'],tipo:'nulo_vazio'},
 // Presença é local ao aparelho; prepararEdicao e complementos() nunca a gravam.
 {colecao:'usuarios',caminho:['online'],tipo:'gerado_servidor'},
 {colecao:'usuarios',caminho:['ultimaAtividade'],tipo:'gerado_servidor'},
].map(a=>Object.freeze({...a,caminho:Object.freeze(a.caminho)})));

const casa=(padrao,caminho)=>padrao.length===caminho.length&&padrao.every((p,i)=>p==='*'||p===caminho[i]);
const normalizar=caminho=>(caminho||[]).map(p=>p&&typeof p==='object'?'*':p);
// Sem coleção (conciliação de um registro avulso), só vale um caminho cuja regra
// de conjunto é a mesma em todas as coleções registradas.
export function adaptadorCampo(colecao,caminho){
 const c=normalizar(caminho);if(!c.length)return null;
 if(colecao!==undefined&&colecao!==null)return adaptadoresCampo.find(a=>a.colecao===colecao&&casa(a.caminho,c))||null;
 const achados=adaptadoresCampo.filter(a=>casa(a.caminho,c));
 return achados.length&&achados.every(a=>a.tipo==='conjunto'&&a.invalido===achados[0].invalido)?achados[0]:null;
}
export const conjuntoValido=(lista,adaptador)=>Array.isArray(lista)&&lista.every(x=>typeof x==='string'&&x!==''&&(!adaptador?.elemento||adaptador.elemento.test(x)))&&new Set(lista).size===lista.length;
const vazio=v=>v===null||v===undefined||v==='';
const numeroCanonico=v=>typeof v==='number'?v:typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;

// Compara um campo pelo adaptador registrado; sem adaptador, igualdade estrita.
// `confirmacao:true`: a é o valor lido do servidor e b o esperado.
export function igualCampo(colecao,caminho,a,b,{confirmacao=false}={}){
 const ad=adaptadorCampo(colecao,caminho);
 if(!ad)return igualSemantico(a,b);
 if(ad.tipo==='gerado_servidor')return true;
 if(ad.tipo==='nulo_vazio')return (vazio(a)&&vazio(b))||igualSemantico(a,b);
 if(ad.tipo==='numero'){const x=numeroCanonico(a);return Number.isFinite(x)&&x===numeroCanonico(b)||igualSemantico(a,b);}
 if(ad.tipo==='conjunto'){
  // Lista que não é conjunto de identidades: contrato estrito (ou divergência).
  if(!conjuntoValido(a,ad)||!conjuntoValido(b,ad))return ad.invalido==='diverge'?false:igualSemantico(a,b);
  const s=new Set(a);if(confirmacao&&ad.aditivo)return b.every(x=>s.has(x));
  return a.length===b.length&&b.every(x=>s.has(x));
 }
 return igualSemantico(a,b);
}

// IndexedDB mínimo em memória para testes unitários da fila de intenções.
// Cobre somente o que src/fila-intencoes.js usa: open/upgrade, object stores
// com keyPath composto, índice simples, get/put/add/getAll, transações
// serializadas com auto-commit e rollback em abort. Não é um polyfill geral.
const chave=(keyPath,valor)=>JSON.stringify(Array.isArray(keyPath)?keyPath.map(k=>valor[k]):valor[keyPath]);
const chaveDireta=(keyPath,k)=>JSON.stringify(Array.isArray(keyPath)?k:k);
const depois=fn=>setImmediate(fn);

class Loja{
 constructor(nome,{keyPath}){this.nome=nome;this.keyPath=keyPath;this.dados=new Map();this.indices=new Map();}
}
class Pedido{constructor(){this.result=undefined;this.error=null;this.onsuccess=null;this.onerror=null;}}
class Transacao{
 constructor(banco,nomes,modo){
  this.banco=banco;this.nomes=nomes;this.modo=modo;this.fila=[];this.pendentes=0;this.ativa=false;this.fim=false;
  this.oncomplete=null;this.onabort=null;this.onerror=null;this.error=null;
  banco._agendar(this);
 }
 objectStore(nome){
  const loja=this.banco.lojas.get(nome);if(!loja||!this.nomes.includes(nome))throw new DOMException('Loja ausente','NotFoundError');
  const tx=this;
  const api={
   get:k=>tx._pedido(()=>structuredClone(loja.dados.get(chaveDireta(loja.keyPath,k)))),
   put:v=>tx._pedido(()=>{tx._escrita();loja.dados.set(chave(loja.keyPath,v),structuredClone(v));return JSON.parse(chave(loja.keyPath,v));}),
   add:v=>tx._pedido(()=>{tx._escrita();const k=chave(loja.keyPath,v);if(loja.dados.has(k))throw new DOMException('Chave existente','ConstraintError');loja.dados.set(k,structuredClone(v));return JSON.parse(k);}),
   index:nomeIndice=>{
    const campo=loja.indices.get(nomeIndice);if(!campo)throw new DOMException('Índice ausente','NotFoundError');
    return {getAll:valor=>tx._pedido(()=>[...loja.dados.values()].filter(r=>r[campo]===valor).map(r=>structuredClone(r)))};
   },
  };
  return api;
 }
 _escrita(){if(this.modo!=='readwrite')throw new DOMException('Somente leitura','ReadOnlyError');}
 _pedido(op){
  if(this.fim)throw new DOMException('Transação encerrada','TransactionInactiveError');
  const p=new Pedido();this.pendentes++;
  const executar=()=>queueMicrotask(()=>{
   if(this.fim)return;
   try{p.result=op();this.pendentes--;p.onsuccess?.({target:p});}
   catch(e){this.pendentes--;p.error=e;p.onerror?.({target:p});this.error=e;this._abortar();return;}
   this._conferir();
  });
  if(this.ativa)executar();else this.fila.push(executar);
  return p;
 }
 _iniciar(){
  this.ativa=true;
  this.copia=new Map([...this.banco.lojas].map(([n,l])=>[n,new Map(l.dados)]));
  for(const f of this.fila.splice(0))f();
  this._conferir();
 }
 _conferir(){depois(()=>{if(this.fim||!this.ativa||this.pendentes)return;this.fim=true;this.oncomplete?.();this.banco._proxima();});}
 _abortar(){
  if(this.fim)return;this.fim=true;
  if(this.copia)for(const [n,m] of this.copia)this.banco.lojas.get(n).dados=m;
  depois(()=>{this.onabort?.();this.banco._proxima();});
 }
 abort(){if(this.fim)throw new DOMException('Transação encerrada','InvalidStateError');this._abortar();}
}
class Banco{
 constructor(nome){this.nome=nome;this.lojas=new Map();this.txs=[];this.corrente=null;this.onversionchange=null;this.fechado=false;}
 createObjectStore(nome,opcoes){const loja=new Loja(nome,opcoes);this.lojas.set(nome,loja);return {createIndex:(n,campo)=>loja.indices.set(n,campo)};}
 transaction(nomes,modo='readonly'){return new Transacao(this,Array.isArray(nomes)?nomes:[nomes],modo);}
 _agendar(tx){this.txs.push(tx);if(!this.corrente)this._proxima();}
 _proxima(){this.corrente=this.txs.shift()||null;if(this.corrente)queueMicrotask(()=>this.corrente._iniciar());}
 close(){this.fechado=true;}
}
export function criarIndexedDBMemoria(){
 const bancos=new Map();
 const indexedDB={
  open(nome,versao=1){
   const p=new Pedido();p.onupgradeneeded=null;p.onblocked=null;
   depois(()=>{
    let banco=bancos.get(nome);const novo=!banco;
    if(novo){banco=new Banco(nome);bancos.set(nome,banco);}
    p.result=banco;
    if(novo)p.onupgradeneeded?.({target:p,oldVersion:0,newVersion:versao});
    p.onsuccess?.({target:p});
   });
   return p;
  },
 };
 // Acesso direto para montar estados históricos (ex.: itens gravados por versões antigas).
 const registros=(nome,loja='intencoes')=>bancos.get(nome)?.lojas.get(loja)?.dados;
 const editar=(nome,conta,id,fn,loja='intencoes')=>{
  const dados=registros(nome,loja),k=JSON.stringify([conta,id]),atual=dados?.get(k);
  if(!atual)throw new Error(`Registro ${id} ausente no banco ${nome}`);
  const copia=structuredClone(atual),novo=fn(copia)||copia;dados.set(k,structuredClone(novo));return novo;
 };
 const ler=(nome,conta,id,loja='intencoes')=>structuredClone(registros(nome,loja)?.get(JSON.stringify([conta,id])));
 return {indexedDB,registros,editar,ler};
}

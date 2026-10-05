// Logica pura do Dashboard comercial: so calculo, sem React, sem rede e sem gravacao.
// O tempo (hoje, agora) sempre entra por parametro. Nenhuma funcao altera as entradas.
import {reais} from './crm-negociacao.js';

export const LIMITE_DIAS=366;
const DIA_MS=86400000;
const SEM_RESPONSAVEL='__sem__';
const ETAPAS=['Cliente novo','Negociação','Contrato','Cliente ativo','Perdido'];
const ABERTAS=['Cliente novo','Negociação','Contrato'];
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const FORMATO_DIA=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});

// ---------- numeros ----------
// Os RPCs podem devolver numerico como texto ou null: valor ausente ou invalido conta como zero.
const num=x=>{const v=Number(x||0);return Number.isFinite(v)?v:0;};
// Media do RPC: null/vazio/invalido continua sendo "sem dado" (nao vira zero).
const media=x=>{if(x==null||x==='')return null;const v=Number(x);return Number.isFinite(v)?v:null;};
// Valor de cartao: so numero finito conta; o resto e "sem valor".
const valorDe=x=>{if(x==null||x==='')return null;const v=Number(x);return Number.isFinite(v)?v:null;};
const centavos=v=>Math.round(v*100)/100;
const umaCasa=v=>Math.round(v*10)/10;
const formatar=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1});
const lista=x=>Array.isArray(x)?x:[];
const comparar=(a,b)=>String(a).localeCompare(String(b),'pt-BR');

// ---------- datas (YYYY-MM-DD, calendario civil; 12:00 UTC evita qualquer efeito de horario de verao) ----------
function lerDia(d){
 if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return NaN;
 const t=Date.parse(`${d}T12:00:00Z`);
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d?t:NaN;
}
function textoDia(t){
 const d=new Date(t).toISOString().slice(0,10);
 return Number.isNaN(lerDia(d))?null:d;
}
const br=d=>d.split('-').reverse().join('/');

export function diasDoPeriodo(inicio,fim){
 const a=lerDia(inicio),b=lerDia(fim);
 return Number.isNaN(a)||Number.isNaN(b)?NaN:Math.round((b-a)/DIA_MS)+1;
}
// Mesma regra do dashboard atual: fim >= inicio e diferenca de ate 366 dias (nao apertar para nao criar regressao).
export function periodoValido(inicio,fim){
 const a=lerDia(inicio),b=lerDia(fim);
 return !Number.isNaN(a)&&!Number.isNaN(b)&&b>=a&&(b-a)/DIA_MS<=LIMITE_DIAS;
}
// Mesma duracao, terminando no dia anterior ao inicio. Periodo invalido: null.
export function periodoAnterior(inicio,fim){
 if(!periodoValido(inicio,fim))return null;
 const dias=diasDoPeriodo(inicio,fim),fimAnterior=lerDia(inicio)-DIA_MS,inicioAnterior=fimAnterior-(dias-1)*DIA_MS;
 const i=textoDia(inicioAnterior),f=textoDia(fimAnterior);
 return i&&f?{inicio:i,fim:f}:null;
}
export function periodosRapidos(hoje){
 const t=lerDia(hoje);
 if(Number.isNaN(t))return [];
 const ano=Number(hoje.slice(0,4)),mes=Number(hoje.slice(5,7))-1;
 const faixa=(id,rotulo,inicio,fim)=>({id,rotulo,inicio:textoDia(inicio),fim:textoDia(fim)});
 return [
  faixa('mes-atual','Este mês',Date.UTC(ano,mes,1,12),t),
  faixa('mes-anterior','Mês anterior',Date.UTC(ano,mes-1,1,12),Date.UTC(ano,mes,0,12)),
  faixa('ultimos-30','Últimos 30 dias',t-29*DIA_MS,t),
  faixa('ultimos-90','Últimos 90 dias',t-89*DIA_MS,t),
  faixa('ano','Este ano',Date.UTC(ano,0,1,12),t)
 ];
}
export function rotuloPeriodo(inicio,fim){
 return Number.isNaN(lerDia(inicio))||Number.isNaN(lerDia(fim))?'':`${br(inicio)} a ${br(fim)}`;
}

// ---------- indicadores do periodo (agentes[] do RPC integracao_crm_dashboard) ----------
export function taxaConversao(conversoes,perdas){
 const c=num(conversoes),p=num(perdas);
 return c+p===0?null:Math.round(100*c/(c+p));
}
export function taxaNoPrazo(noPrazo,feitos){
 const f=num(feitos);
 return f===0?null:Math.round(100*num(noPrazo)/f);
}
// Media ponderada por followups_feitos. Agente sem media ou com peso zero nao entra; sem nenhum, null.
function mediaPonderada(agentes,campo){
 let soma=0,peso=0;
 for(const a of agentes){const m=media(a[campo]),p=num(a.followups_feitos);if(m!=null&&p>0){soma+=m*p;peso+=p;}}
 return peso>0?umaCasa(soma/peso):null;
}
const CAMPOS_SOMA=['carteira','movimentacoes','conversoes','perdas','sem_followup','pendentes','atrasados','followups_feitos','no_prazo','atendimentos_chatwoot','mensagens_enviadas','conversas_carteira','atendimentos_manuais'];
// carteira, pendentes, atrasados e sem_followup sao somas simples e incluem Perdido e Cliente ativo (como o RPC entrega).
export function totaisAgentes(agentes,filtroId=''){
 const escolhidos=lista(agentes).filter(a=>a&&(!filtroId||a.id===filtroId));
 const t={agentes:escolhidos.length};
 for(const campo of CAMPOS_SOMA)t[campo]=escolhidos.reduce((s,a)=>s+num(a[campo]),0);
 t.taxaConversao=taxaConversao(t.conversoes,t.perdas);
 t.taxaNoPrazo=taxaNoPrazo(t.no_prazo,t.followups_feitos);
 t.tempo_medio_horas=mediaPonderada(escolhidos,'tempo_medio_horas');
 t.atraso_medio_horas=mediaPonderada(escolhidos,'atraso_medio_horas');
 return t;
}
export function periodoAnteriorTemDados(totais){
 if(!totais)return false;
 return num(totais.movimentacoes)+num(totais.followups_feitos)+num(totais.atendimentos_chatwoot)+num(totais.atendimentos_manuais)>0;
}

const SEM_BASE={tipo:'sem-base',tom:'neutro',texto:'Sem dados no período anterior'};
// O texto sempre diz Subiu ou Caiu: o sentido nunca depende so da cor (tom).
export function variacao(atual,anterior,{menorEMelhor=false,unidade='numero'}={}){
 const lido=x=>x==null||x===''?null:Number(x);
 let a=lido(atual),b=lido(anterior);
 if(a==null||b==null||!Number.isFinite(a)||!Number.isFinite(b))return {...SEM_BASE};
 const pontos=unidade==='pontos';
 if(pontos){a=Math.round(a);b=Math.round(b);}
 const antes=pontos?`${b}%`:formatar(b);
 if(a===b)return {tipo:'igual',tom:'neutro',texto:`Igual ao período anterior (${antes})`};
 const subiu=a>b;
 const tom=subiu!==menorEMelhor?'positivo':'negativo';
 let texto;
 if(pontos)texto=`${subiu?'Subiu':'Caiu'} ${Math.abs(a-b)} p.p. (antes: ${antes})`;
 else if(b===0)texto=`${subiu?'Subiu':'Caiu'} de 0 para ${formatar(a)}`;
 else{
  const p=Math.round(100*Math.abs(a-b)/Math.abs(b));
  texto=`${subiu?'Subiu':'Caiu'} ${p<1?'menos de 1':p}% (antes: ${antes})`;
 }
 return {tipo:subiu?'subiu':'caiu',tom,texto};
}

// ---------- situacao de hoje (Items de cartoes; fotografia atual, nao depende do periodo) ----------
const idsDe=item=>[...new Set(lista(item.responsaveis).filter(Boolean))];
const ehCartaoAberto=i=>i&&i.tipo==='card'&&ABERTAS.includes(i.etapa);
function acumular(alvo,item){
 const passo=item.passo?.tipo||'sem',valor=valorDe(item.valor);
 alvo.andamento++;
 if(passo==='atrasado')alvo.atrasados++;
 if(passo==='sem')alvo.semProximoPasso++;
 if(valor==null)alvo.semValor++;else alvo.valorAberto+=valor;
}
const zerado=()=>({andamento:0,atrasados:0,semProximoPasso:0,valorAberto:0,semValor:0});
const fechar=t=>({...t,valorAberto:centavos(t.valorAberto)});
function nomeDoResponsavel(id,usuarios){
 if(id===SEM_RESPONSAVEL)return 'Sem responsável';
 const u=lista(usuarios).find(x=>x&&(x.erpRef||x.id)===id);
 return u?`${u.nome||'Sem nome'}${u.ativo===false?' (inativo)':''}`:'Responsável removido';
}
// Cartao com varios responsaveis conta em cada linha; o total conta cada cartao uma vez (por chave).
export function atencaoPorComercial(itens,usuarios){
 const porId=new Map(),total=zerado(),vistos=new Set();
 for(const item of lista(itens)){
  if(!ehCartaoAberto(item))continue;
  const ids=idsDe(item);
  for(const id of ids.length?ids:[SEM_RESPONSAVEL]){
   if(!porId.has(id))porId.set(id,zerado());
   acumular(porId.get(id),item);
  }
  const chave=item.chave??item.id??item;
  if(!vistos.has(chave)){vistos.add(chave);acumular(total,item);}
 }
 const linhas=[...porId].map(([id,t])=>({id,nome:nomeDoResponsavel(id,usuarios),...fechar(t)}))
  .sort((a,b)=>b.atrasados-a.atrasados||comparar(a.nome,b.nome));
 return {linhas,total:fechar(total)};
}
// Fotografia dos cartoes de hoje (nao e funil de periodo). valor/semValor so nas tres etapas abertas.
export function funilAtual(itens){
 const linhas=ETAPAS.map(etapa=>({etapa,quantidade:0,valor:0,semValor:0}));
 for(const item of lista(itens)){
  if(!item||item.tipo!=='card')continue;
  const linha=linhas.find(l=>l.etapa===item.etapa);
  if(!linha)continue;
  linha.quantidade++;
  if(ABERTAS.includes(item.etapa)){const v=valorDe(item.valor);if(v==null)linha.semValor++;else linha.valor+=v;}
 }
 return linhas.map(l=>({...l,valor:centavos(l.valor)}));
}
export function filtrarPorComercial(itens,id){
 const todos=lista(itens).filter(Boolean);
 if(!id)return [...todos];
 if(id===SEM_RESPONSAVEL)return todos.filter(i=>i.tipo!=='cadastro'&&!idsDe(i).length);
 return todos.filter(i=>idsDe(i).includes(id));
}

// ---------- tabela por comercial e metas ----------
// "semLinhaComoZero": quando os itens ja foram carregados, comercial sem cartao em andamento tem 0 (e nao "sem dado").
export function linhasComparativo(agentes,atencao,filtroId='',{semLinhaComoZero=false}={}){
 const linhasAtencao=Array.isArray(atencao)?atencao:lista(atencao?.linhas);
 return lista(agentes).filter(a=>a&&(!filtroId||a.id===filtroId)).map(a=>{
  const hoje=linhasAtencao.find(l=>l&&l.id===a.id)||(semLinhaComoZero?{andamento:0,atrasados:0,semProximoPasso:0}:null);
  return {
   id:a.id,nome:a.nome,ativo:a.ativo!==false,
   conversoes:num(a.conversoes),perdas:num(a.perdas),taxaConversao:taxaConversao(a.conversoes,a.perdas),
   followups_feitos:num(a.followups_feitos),no_prazo:num(a.no_prazo),taxaNoPrazo:taxaNoPrazo(a.no_prazo,a.followups_feitos),
   andamento:hoje?hoje.andamento:null,atrasados:hoje?hoje.atrasados:null,semProximoPasso:hoje?hoje.semProximoPasso:null
  };
 });
}
// Novo array; null por ultimo nos dois sentidos; empate mantem a ordem original (estavel).
export function ordenarLinhas(linhas,chave,dir='desc'){
 const vazio=v=>v==null||(typeof v==='number'&&Number.isNaN(v));
 const lido=v=>typeof v==='boolean'?Number(v):v;
 const sinal=dir==='asc'?1:-1;
 return [...lista(linhas)].sort((x,y)=>{
  const a=lido(x?.[chave]),b=lido(y?.[chave]);
  if(vazio(a)&&vazio(b))return 0;
  if(vazio(a))return 1;
  if(vazio(b))return -1;
  const c=typeof a==='number'&&typeof b==='number'?a-b:comparar(a,b);
  return c===0?0:sinal*(c<0?-1:1);
 });
}
// So metas ativas e vigentes hoje. O realizado vem pronto do RPC integracao_crm_metas_painel e nunca e recalculado.
export function resumoMetas(metas,hoje){
 if(Number.isNaN(lerDia(hoje)))return [];
 const dia=v=>String(v??'').slice(0,10),texto=(v,unidade)=>unidade==='valor'?reais(v):String(Number(v));
 return lista(metas).filter(m=>m&&m.status==='ativa'&&dia(m.inicio)<=hoje&&hoje<=dia(m.fim)).map(m=>{
  const alvo=num(m.alvo),realizado=num(m.realizado),unidade=m.unidade;
  return {
   id:m.id,titulo:m.titulo,escopo:m.escopo,setor:m.setor,unidade,alvo,realizado,
   percentual:alvo>0?Math.round(100*realizado/alvo):null,
   inicio:dia(m.inicio),fim:dia(m.fim),semValor:num(m.sem_valor),
   textoRealizado:texto(realizado,unidade),textoAlvo:texto(alvo,unidade),
   participantes:lista(m.por_usuario).filter(Boolean).map(u=>({id:u.id,nome:u.nome,realizado:num(u.realizado)}))
  };
 }).sort((a,b)=>comparar(a.fim,b.fim)||comparar(a.titulo,b.titulo));
}
export function movimentosDoComercial(movs,agenteId){
 return lista(movs).filter(x=>x&&(!agenteId||x.autor_id===agenteId));
}

// ---------- evolucao mensal de clientes ativados (rows de integracao_crm_relatorio_ativacoes) ----------
// Meses em America/Sao_Paulo, do mais antigo ao mes de "hoje"; todos os meses aparecem, mesmo com zero.
// Ativacoes 'estimado' (cartoes ja ativos antes do registro) sao separadas para nao parecerem resultado real do mes.
export function evolucaoMensal(ativacoes,hoje,meses=6){
 if(Number.isNaN(lerDia(hoje)))return [];
 const n=Number.isInteger(meses)&&meses>0?Math.min(meses,60):6,ano=Number(hoje.slice(0,4)),mes=Number(hoje.slice(5,7))-1;
 const linhas=[],porMes=new Map();
 for(let i=n-1;i>=0;i--){
  const d=new Date(Date.UTC(ano,mes-i,1,12)),chave=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  const linha={mes:chave,rotulo:`${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`,total:0,registro:0,historico:0,estimado:0,valor:0,semValor:0};
  linhas.push(linha);porMes.set(chave,linha);
 }
 for(const a of lista(ativacoes)){
  const t=a?Date.parse(a.ativado_em):NaN;
  if(Number.isNaN(t))continue;
  const p=Object.fromEntries(FORMATO_DIA.formatToParts(new Date(t)).map(x=>[x.type,x.value]));
  const linha=porMes.get(`${p.year}-${p.month}`);
  if(!linha)continue;
  linha.total++;
  if(a.origem==='registro'||a.origem==='historico'||a.origem==='estimado')linha[a.origem]++;
  const v=valorDe(a.valor);
  if(v==null)linha.semValor++;else linha.valor+=v;
 }
 return linhas.map(l=>({...l,valor:centavos(l.valor)}));
}

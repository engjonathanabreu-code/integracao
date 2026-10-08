// Lógica pura da aba Hoje e do funil do CRM: etapa de exibição, urgência do próximo passo, fila do dia,
// totais e decisão de movimento. Sem React, sem rede e sem gravação: só calcula o que a tela mostra.
// Todo tempo entra por parâmetro (agora, padrão Date.now()). Nenhuma entrada é alterada.
import {normalizarCRM,ETAPAS_FUNIL} from './crm-regras.js';
import {CAMPOS_NEGOCIACAO,formularioNegociacao,prepararNegociacao} from './crm-negociacao.js';
import {exigeDocumentoCRM} from './crm-edicao.js';
import {diaFollowup} from './crm-followup.js';

// As 5 etapas aceitas pelo banco (CHECK integracao_crm_cards_status_check). Só estas são gravadas.
export const ETAPAS_EXIBICAO=['Cliente novo','Negociação','Contrato','Cliente ativo','Perdido'];
export const ETAPAS_ABERTAS=ETAPAS_FUNIL;
export const VISOES_FUNIL=['reduzido','semi','detalhada'];
export const SEM_RESPONSAVEL='__sem__';
// Só leitura da preferência salva; quem grava continua gravando um dos 3 valores.
export const normalizarVisao=v=>VISOES_FUNIL.includes(v)?v:'reduzido';

// Mapeamento SOMENTE PARA EXIBIÇÃO (nunca é gravado). Chave: texto normalizado por normalizarCRM.
const MAPA=new Map([
 ['cliente novo','Cliente novo'],['novo','Cliente novo'],
 ['contato feito','Cliente novo'], // premissa a confirmar com o dono: contato feito ainda não é negociação
 ['negociacao','Negociação'],['proposta enviada','Negociação'],
 ['contrato','Contrato'],['cliente ativo','Cliente ativo'],['perdido','Perdido']
]);
const SITUACOES_INATIVAS=['inativo','cancelado','banido'];
const DIA_MS=86400000;
const colador=new Intl.Collator('pt-BR',{sensitivity:'base'});
const texto=v=>String(v??'').trim();
const lista=v=>Array.isArray(v)?v:[];
const porChave=(a,b)=>a.chave<b.chave?-1:a.chave>b.chave?1:0;
const porNome=(a,b)=>colador.compare(a.nome,b.nome)||porChave(a,b);
const agoraMs=a=>{const t=a==null?NaN:a instanceof Date?a.getTime():Number(a);return Number.isFinite(t)?t:Date.now();};
const tempo=v=>{const t=v instanceof Date?v.getTime():typeof v==='number'?v:typeof v==='string'&&v.trim()?Date.parse(v):NaN;return Number.isFinite(t)&&Math.abs(t)<=8.64e15?t:NaN;};
// Dia civil de São Paulo (via diaFollowup), memorizado por hora UTC: os fusos de São Paulo são sempre de horas inteiras,
// então uma hora UTC nunca cruza a meia-noite local. Evita criar um Intl.DateTimeFormat por cartão a cada renderização.
const diasEmCache=new Map();
const diaCivil=ms=>{
 const hora=Math.floor(ms/3600000);
 let dia=diasEmCache.get(hora);
 if(dia===undefined){dia=diaFollowup(new Date(ms));if(diasEmCache.size>5000)diasEmCache.clear();diasEmCache.set(hora,dia);}
 return dia;
};
const diasEntre=(de,ate)=>Math.round((Date.parse(`${ate}T12:00:00Z`)-Date.parse(`${de}T12:00:00Z`))/DIA_MS);
const semPasso=()=>({tipo:'sem',previsto_em:null,dias:null});
const aberto=i=>!!i&&i.tipo==='card'&&ETAPAS_ABERTAS.includes(i.etapa);

// 1) Etapa de exibição. mapeado = o texto não era exatamente um dos 5 valores do banco.
export function etapaDeExibicao(status){
 const original=String(status??''),etapa=MAPA.get(normalizarCRM(status));
 return {etapa:etapa||'Cliente novo',original,reconhecido:!!etapa,mapeado:!ETAPAS_EXIBICAO.includes(original)};
}

// 2) Tempo do próximo passo (dia civil sempre em America/Sao_Paulo).
function passoEm(followup,agora,hoje){
 if(!followup||followup.status!=='pendente')return semPasso();
 const t=tempo(followup.previsto_em);
 if(!Number.isFinite(t))return semPasso();
 const dif=diasEntre(hoje,diaCivil(t));
 if(!Number.isFinite(dif))return semPasso();
 const previsto_em=typeof followup.previsto_em==='string'?followup.previsto_em:new Date(t).toISOString();
 if(t<agora)return {tipo:'atrasado',previsto_em,dias:Math.max(0,-dif)};
 return dif<=0?{tipo:'hoje',previsto_em,dias:0}:{tipo:'futuro',previsto_em,dias:dif};
}
export function situacaoDoPasso(followup,agora=Date.now()){
 const ms=agoraMs(agora);
 return passoEm(followup,ms,diaCivil(ms));
}
export function rotuloPasso(passo){
 const dias=passo?.dias;
 switch(passo?.tipo){
  case 'atrasado':return {texto:dias>=1?`Atrasado há ${dias} ${dias===1?'dia':'dias'}`:'Venceu hoje',tom:'atrasado'};
  case 'hoje':return {texto:'Hoje',tom:'hoje'};
  case 'futuro':return {texto:dias===1?'Amanhã':`Em ${dias} dias`,tom:'futuro'};
  default:return {texto:'Sem próximo passo',tom:'sem'};
 }
}

// 3) Montagem dos itens (um por cartão e um por cadastro sem cartão).
const responsaveisDe=c=>[...new Set((Array.isArray(c.responsaveis_ids)?c.responsaveis_ids:[c.responsavel_id]).filter(Boolean))];
const arquivadoCadastro=a=>a===true||(!!a&&typeof a==='object'&&a.ativo===true); // mesma regra de arquivamento.js: restaurado (ativo:false) continua visível
const prazoValido=p=>{
 if(typeof p!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p))return false;
 const t=Date.parse(`${p}T12:00:00Z`);
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===p;
};

function etapaPendencias(e){
 if(e.reconhecido)return [];
 return [texto(e.original)?`Etapa "${e.original}" tratada como Cliente novo`:'Sem etapa definida'];
}
function itemDeCard(c,i,passo,tarefa){
 const e=etapaDeExibicao(c.status),nome=c.nome||c.lead_nome||'Contato',municipio=texto(c.municipio||c.lead_cidade),telefone=texto(c.telefone||c.lead_telefone),cpf=texto(c.cpf_cnpj);
 const valor=c.valor_total==null||c.valor_total===''||!Number.isFinite(Number(c.valor_total))?null:Number(c.valor_total);
 const municipioId=c.municipio_id||c.lead_municipio_id||null,responsaveis=responsaveisDe(c);
 const pendencias=[...etapaPendencias(e)];
 if(!telefone)pendencias.push('Sem telefone');
 if(!municipio&&!municipioId)pendencias.push('Sem município');
 if(!cpf&&['Contrato','Cliente ativo'].includes(e.etapa))pendencias.push('Sem CPF');
 if(valor==null&&['Negociação','Contrato'].includes(e.etapa))pendencias.push('Sem valor');
 if(!responsaveis.length)pendencias.push('Sem responsável');
 return {chave:c.id!=null?`c:${c.id}`:`c:sem-id-${i}`,tipo:'card',id:c.id??null,clienteId:c.cliente_id||null,registroId:null,municipioId,card:c,
  nome,municipio,telefone,cpf,codigo:c.codigo||'',valor,lead:!c.cliente_id,etapa:e.etapa,etapaOriginal:e.original,etapaReconhecida:e.reconhecido,
  responsaveis,passo,tarefa,movel:c.origem!=='vinculado'&&!c.arquivado_em,pendencias,
  textoBusca:normalizarCRM([nome,c.cpf_cnpj,c.telefone,c.lead_telefone,c.municipio,c.lead_cidade].join(' '))};
}
function itemDeCadastro(r,ref,reg,chave){
 const e=etapaDeExibicao(r.status_crm),nome=texto(r.nome)||'Cadastro sem nome',telefone=texto(r.telefone);
 return {chave,tipo:'cadastro',id:null,clienteId:ref||null,registroId:reg||null,municipioId:r.municipioId||null,card:null,
  nome,municipio:'',telefone,cpf:'',codigo:texto(r.codigo),valor:null,lead:false,etapa:e.etapa,etapaOriginal:e.original,etapaReconhecida:e.reconhecido,
  responsaveis:[],passo:semPasso(),tarefa:null,movel:false,pendencias:[...(telefone?[]:['Sem telefone']),...etapaPendencias(e)],
  textoBusca:normalizarCRM([nome,telefone].join(' '))};
}

// Cadastro do Integração que também existe em fin_receb_clientes: o nome e a situação vêm do financeiro, como no próprio Integração.
// Só completa o que falta ou o que o financeiro marca como inativo; nunca grava nada.
function completarCadastro(r,f){
 const inativo=f.ativo===false&&!SITUACOES_INATIVAS.includes(normalizarCRM(r.situacao));
 return {...r,nome:texto(f.nome)||texto(r.nome),codigo:texto(r.codigo)||texto(f.codigo),municipioId:r.municipioId||f.municipio_id||null,situacao:inativo?'Inativo':r.situacao};
}

// cards: linhas da view integracao_crm_funil; followups/tarefas: linhas pendentes/abertas; cadastros: leitura somente leitura
// de integracao_moradores (ou null quando não carregada); clientes: leitura somente leitura de fin_receb_clientes (id,nome,codigo,
// municipio_id,ativo) ou null. Um cliente que só existe no financeiro (sem linha em integracao_moradores e sem cartão) entra como
// cadastro sem etapa (Cliente novo, 'Sem etapa definida'), ou como inativo quando ativo=false. Devolve arrays novos; item.card é a
// mesma referência da entrada.
export function montarCarteira({cards=[],followups=[],tarefas=[],cadastros=null,clientes=null,agora=Date.now()}={}){
 const ms=agoraMs(agora),hoje=diaCivil(ms);
 const todos=lista(cards).filter(c=>c&&typeof c==='object');
 // Cartões ocultos (vinculado) também contam: o cliente tem cartão. Cartão arquivado não conta: nada ficaria visível.
 const clienteIds=new Set(todos.filter(c=>c.cliente_id&&!c.arquivado_em).map(c=>String(c.cliente_id)));
 const proximos=new Map(),abertas=new Map();
 for(const f of lista(followups)){
  if(!f||f.status!=='pendente'||f.card_id==null)continue;
  const t=tempo(f.previsto_em),atual=proximos.get(f.card_id);
  if(Number.isFinite(t)&&(!atual||t<atual.t))proximos.set(f.card_id,{f,t});
 }
 for(const t of lista(tarefas)){
  if(!t||t.concluida===true||t.card_id==null)continue;
  const atual=abertas.get(t.card_id);
  if(!atual||(prazoValido(t.prazo)&&(!prazoValido(atual.prazo)||t.prazo<atual.prazo)))abertas.set(t.card_id,t);
 }
 const vistos=new Set(),itens=[];
 todos.forEach((c,i)=>{
  if(c.origem==='vinculado'||c.arquivado_em)return;
  if(c.id!=null){if(vistos.has(c.id))return;vistos.add(c.id);}
  const t=abertas.get(c.id);
  itens.push(itemDeCard(c,i,passoEm(proximos.get(c.id)?.f,ms,hoje),t?{titulo:String(t.titulo??''),prazo:String(t.prazo??'')}:null));
 });
 const financeiro=new Map();
 for(const f of lista(clientes)){const id=f&&typeof f==='object'?texto(f.id):'';if(id&&!financeiro.has(id))financeiro.set(id,f);}
 const semCartao=[],inativos=[],divergencias=new Map(),chaves=new Set(),referencias=new Set();
 let arquivadosIgnorados=0;
 for(const linha of lista(cadastros)){
  if(!linha||typeof linha!=='object')continue;
  const ref=texto(linha.referencia_id),reg=texto(linha.registro_id);
  if(!ref&&!reg)continue;
  // Todo cadastro com linha em integracao_moradores (até o arquivado) já representa o cliente do financeiro: ele não volta como "só financeiro".
  if(ref)referencias.add(ref);
  if(reg)referencias.add(reg);
  const chave=`m:${reg||ref}`;
  if(chaves.has(chave))continue;
  chaves.add(chave);
  if(arquivadoCadastro(linha.arquivamento)){arquivadosIgnorados++;continue;}
  if(ref&&clienteIds.has(ref)){ // o cliente já aparece pelo cartão; só avisa se o cadastro marca outra etapa
   const marca=texto(linha.status_crm);
   if(marca&&!divergencias.has(ref))divergencias.set(ref,marca);
   continue;
  }
  const fin=financeiro.get(ref)||financeiro.get(reg),r=fin?completarCadastro(linha,fin):linha;
  (SITUACOES_INATIVAS.includes(normalizarCRM(r.situacao))?inativos:semCartao).push(itemDeCadastro(r,ref,reg,chave));
 }
 for(const [id,f] of financeiro){
  if(referencias.has(id)||clienteIds.has(id))continue;
  const inativo=f.ativo===false;
  (inativo?inativos:semCartao).push(itemDeCadastro({nome:f.nome,telefone:'',status_crm:'',situacao:inativo?'Inativo':'',municipioId:f.municipio_id,codigo:f.codigo},id,id,`m:${id}`));
 }
 for(const i of itens){
  const marca=i.clienteId&&divergencias.get(String(i.clienteId));
  if(marca&&etapaDeExibicao(marca).etapa!==i.etapa)i.pendencias.push(`Cadastro marca "${marca}"`);
 }
 return {cards:itens,semCartao:semCartao.sort(porNome),inativos:inativos.sort(porNome),arquivadosIgnorados};
}

export function filtrarItens(itens,{busca='',responsavel=''}={}){
 const termo=normalizarCRM(busca);
 return lista(itens).filter(i=>{
  if(!i||(termo&&!String(i.textoBusca||'').includes(termo)))return false;
  if(!responsavel)return true;
  if(responsavel===SEM_RESPONSAVEL)return i.tipo==='card'&&!lista(i.responsaveis).length;
  return lista(i.responsaveis).includes(responsavel);
 });
}

// Extras para o select de comerciais: quem tem cartão mas não está entre os comerciais ativos, e 'Sem responsável'.
// Passe os itens da carteira sem filtro, para as opções não sumirem ao buscar.
export function opcoesResponsavel(itens,usuarios){
 const todos=lista(usuarios).filter(Boolean),ativos=new Set(todos.filter(u=>u.ativo&&u.tipoERP==='Comercial').map(u=>u.erpRef));
 const extras=new Map();let sem=false;
 for(const i of lista(itens)){
  if(!i||i.tipo!=='card')continue;
  if(!lista(i.responsaveis).length){sem=true;continue;}
  for(const id of i.responsaveis){
   if(ativos.has(id)||extras.has(id))continue;
   const u=todos.find(x=>(x.erpRef||x.id)===id);
   extras.set(id,u?.nome?`${u.nome} (inativo ou sem perfil comercial)`:'Responsável removido');
  }
 }
 const opcoes=[...extras].map(([valor,rotulo])=>({valor,rotulo})).sort((a,b)=>colador.compare(a.rotulo,b.rotulo)||(a.valor<b.valor?-1:1));
 return sem?[...opcoes,{valor:SEM_RESPONSAVEL,rotulo:'Sem responsável'}]:opcoes;
}

// 4) Fila do dia. Só cartões em etapas abertas. A urgência é recalculada com 'agora' quando o item tem data;
// se o passo recalculado difere do item, o item devolvido é uma cópia rasa com o passo atualizado (o card segue a mesma referência).
function reclassificar(i,agora,hoje){
 const p=i.passo;
 if(!p||p.previsto_em==null||p.previsto_em==='')return p?i:{...i,passo:semPasso()};
 const novo=passoEm({status:'pendente',previsto_em:p.previsto_em},agora,hoje);
 return novo.tipo===p.tipo&&novo.dias===p.dias?i:{...i,passo:novo};
}
const maisAntigo=(a,b)=>{const x=tempo(a.passo.previsto_em),y=tempo(b.passo.previsto_em);return (Number.isNaN(x)-Number.isNaN(y))||x-y||porNome(a,b);};
const maiorValor=(a,b)=>(a.valor==null)-(b.valor==null)||(b.valor??0)-(a.valor??0)||porNome(a,b);
export function filaDoDia(itens,agora=Date.now()){
 const ms=agoraMs(agora),hoje=diaCivil(ms),fila={atrasados:[],hoje:[],sem:[]};
 for(const original of lista(itens)){
  if(!aberto(original))continue;
  const i=reclassificar(original,ms,hoje),tipo=i.passo.tipo;
  if(tipo==='atrasado')fila.atrasados.push(i);else if(tipo==='hoje')fila.hoje.push(i);else if(tipo==='sem')fila.sem.push(i);
 }
 fila.atrasados.sort(maisAntigo);fila.hoje.sort(maisAntigo);fila.sem.sort(maiorValor);
 return fila;
}
function somarValores(itens){
 let centavos=0,semValor=0;
 for(const i of itens){if(i.valor==null)semValor++;else centavos+=Math.round(i.valor*100);}
 return {valor:centavos/100,semValor};
}
export function resumoDoDia(itens,agora=Date.now()){
 const f=filaDoDia(itens,agora),emAndamento=lista(itens).filter(aberto),{valor,semValor}=somarValores(emAndamento);
 return {atrasados:f.atrasados.length,hoje:f.hoje.length,sem:f.sem.length,pendentes:f.atrasados.length+f.hoje.length,andamento:emAndamento.length,valorAberto:valor,semValor};
}
// Cabeçalho da coluna do funil. Cadastros sem cartão ficam fora dos totais.
export function totaisColuna(itens){
 const cartoes=lista(itens).filter(i=>i&&i.tipo!=='cadastro'),{valor,semValor}=somarValores(cartoes);
 return {quantidade:cartoes.length,valor,semValor};
}

// 5) Movimentos (arrastar e Avançar). Estas funções nunca gravam: quem grava é a página, com m.executar + salvarNegociacaoCRM.
const SEQUENCIA=['Cliente novo','Negociação','Contrato','Cliente ativo'];
export const proximaEtapa=etapa=>{const n=SEQUENCIA.indexOf(etapa);return n>=0&&n<SEQUENCIA.length-1?SEQUENCIA[n+1]:null;};
// Mesmo ciclo da ficha de negociação: valor, forma, parcelas, desconto e entrada são preservados; só o status muda.
export function dadosMovimento(card,destino){
 if(!card||typeof card!=='object')return {ok:false,erro:'Cartão indisponível para esta ação.'};
 try{prepararNegociacao(formularioNegociacao(card));return {ok:true,dados:{status:destino,...Object.fromEntries(CAMPOS_NEGOCIACAO.map(k=>[k,card[k]==null?null:k==='forma_negociacao'?card[k]:Number(card[k])]))}};}
 catch(e){return {ok:false,erro:e?.message||String(e)};}
}
const decisao=(acao,mensagem='',etapaSugerida=null)=>({acao,mensagem,etapaSugerida});
export function decidirMovimento(item,destino){
 if(!item||item.tipo!=='card')return decisao('nenhuma','Este cadastro ainda não tem cartão no CRM e não muda de etapa por aqui.');
 if(!item.movel)return decisao('nenhuma','Este cartão não pode mudar de etapa por aqui.');
 if(!ETAPAS_EXIBICAO.includes(destino)||destino===item.etapa)return decisao('nenhuma');
 const ficha=mensagem=>decisao('abrir-ficha',mensagem,destino);
 // Cliente ativo e Perdido não são colunas abertas do funil (um ativo só aparece na coluna Follow Up). Tirá-los desse estado desfaz a ativação
 // ou a perda, então nunca é um único gesto de arrastar: a ficha abre com a etapa escolhida e a gravação só acontece em Salvar.
 if(!ETAPAS_ABERTAS.includes(item.etapa))return ficha(`Este cliente está em ${item.etapa}. Para mudar a etapa, confira o Status na ficha e salve.`);
 if(item.lead&&['Contrato','Cliente ativo'].includes(destino))return ficha(`Para levar este lead a ${destino}, confirme o município e a remessa na ficha.`);
 if(destino==='Cliente ativo'&&item.etapa!=='Contrato')return ficha('Passe primeiro por Contrato ou conclua a ativação na ficha.');
 if(exigeDocumentoCRM(destino)&&!texto(item.cpf))return ficha('Este cliente está sem CPF. Confira os dados na ficha antes de salvar a etapa.');
 const r=dadosMovimento(item.card,destino);
 if(!r.ok)return ficha(r.erro);
 if(destino==='Cliente ativo')return decisao('confirmar',`${item.nome} passará a Cliente ativo e sairá do funil. A ativação fica registrada nos relatórios. Confirmar?`);
 return decisao('gravar');
}

// 6) Tarefas abertas por prazo. hojeISO = diaFollowup() calculado por quem chama. Prazo inválido vai para o fim de 'proximas'.
export function agruparTarefas(tarefas,hojeISO=diaFollowup()){
 const grupos={atrasadas:[],hoje:[],proximas:[]},validas=new Set();
 for(const t of lista(tarefas)){
  if(!t)continue;
  if(!prazoValido(t.prazo)){grupos.proximas.push(t);continue;}
  validas.add(t);
  (t.prazo<hojeISO?grupos.atrasadas:t.prazo===hojeISO?grupos.hoje:grupos.proximas).push(t);
 }
 const ordem=(a,b)=>{const va=validas.has(a),vb=validas.has(b);if(va!==vb)return va?-1:1;return va?(a.prazo<b.prazo?-1:a.prazo>b.prazo?1:0):0;};
 for(const g of Object.values(grupos))g.sort(ordem);
 return grupos;
}

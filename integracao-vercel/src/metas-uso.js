// Melhorias derivadas do histórico de uso das Metas (onda 1 do pente fino).
// Só regras puras: a tela chama estas funções e continua dona da gravação.
import {diaCivilEvento} from './calendario-ocorrencias.js';
import {identidadeMeta,responsavelMeta} from './metas-identidade.js';
import {ideiaPlanejamento} from './planejamento-metas.js';

const somarDias=(dia,n)=>{const d=new Date(`${dia}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

// USO-M1 — o prazo médio dado era de 8 dias e o tempo real de 11 a 14.
// A meta nova já abre com duas semanas; quem cria continua livre para trocar.
export const PRAZO_SUGERIDO_DIAS=14;
export function prazoSugeridoMeta(agora=new Date()){
 const hoje=diaCivilEvento(agora);
 return hoje?somarDias(hoje,PRAZO_SUGERIDO_DIAS):'';
}

// USO-M2 — aviso de meta vencida para os responsáveis e a Diretoria.
//
// Vários aparelhos ficam abertos ao mesmo tempo e qualquer um pode perceber o
// vencimento. Para que a mesma meta não vire um aviso por aparelho nem um por
// dia, o aviso inteiro é função só da meta: id, data, título, texto e
// destinatários saem de (meta, prazo, título, responsáveis). Dois aparelhos
// produzem o mesmo registro, byte a byte. No banco, integracao_notificacoes tem
// chave (colecao, registro_id) e integracao_gravar insere com ON CONFLICT DO
// NOTHING: a segunda gravação idêntica não cria linha nem conflito.
// O aviso não leva `lidaPor`: um campo ausente nunca diverge do que já está
// gravado; a leitura fica nas preferências de cada usuário.
const DIA=/^\d{4}-\d{2}-\d{2}$/;
const FINAIS=['Concluído','Cancelado','Aguardando aprovação'];
const dataBR=dia=>`${dia.slice(8,10)}/${dia.slice(5,7)}/${dia.slice(0,4)}`;
const resumo32=(texto,semente)=>{
 let h=semente>>>0;
 for(let i=0;i<texto.length;i++){h^=texto.charCodeAt(i);h=Math.imul(h,16777619);}
 h^=h>>>16;h=Math.imul(h,2246822507);h^=h>>>13;h=Math.imul(h,3266489909);h^=h>>>16;
 return (h>>>0).toString(16).padStart(8,'0');
};
// Identificador estável em formato de UUID (o mesmo formato dos demais avisos).
export function idDeterministico(chave){
 const h=[2166136261,0x9e3779b9,0x85ebca6b,0xc2b2ae35].map((s,i)=>resumo32(`${i}|${chave}`,s)).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
export const metaVencidaParaAviso=(meta,hoje)=>!!meta&&!ideiaPlanejamento(meta)&&DIA.test(meta.prazo||'')&&DIA.test(hoje||'')&&
 meta.prazo<hoje&&!FINAIS.includes(meta.status)&&typeof meta.id==='string'&&!!meta.id;
export function avisoMetaVencida(meta){
 const titulo=String(meta.titulo||'').trim();
 const usuarios=[...new Set((meta.responsaveis||[]).filter(x=>typeof x==='string'&&x))].sort();
 const chave=['meta-vencida',identidadeMeta(meta.id),meta.prazo,titulo,usuarios.join(',')].join('|');
 return {id:idDeterministico(chave),data:`${somarDias(meta.prazo,1)}T03:00:00.000Z`,
  titulo:`Meta vencida: ${titulo}`,texto:`O prazo era ${dataBR(meta.prazo)} e a meta continua aberta.`,
  rota:{pag:'metas'},setores:['diretoria'],usuarios};
}
// Só quem recebe o aviso o gera: responsáveis da meta e a Diretoria.
export function avisosMetasVencidas(db,usuario,hoje){
 if(!db||!usuario||usuario.ativo===false)return [];
 const existentes=new Set((db.notificacoes||[]).map(n=>n.id)),vistos=new Set(),avisos=[];
 for(const meta of db.metas||[]){
  if(!metaVencidaParaAviso(meta,hoje)||!(usuario.setor==='diretoria'||responsavelMeta(meta,usuario)))continue;
  const aviso=avisoMetaVencida(meta);
  if(existentes.has(aviso.id)||vistos.has(aviso.id))continue;
  vistos.add(aviso.id);avisos.push(aviso);
 }
 return avisos;
}
// Mutação pura, aplicada pelo mesmo `mutar` das demais notificações.
// Não recorta a lista: um aviso antigo cortado aqui pareceria ausente e seria
// gerado de novo na mesma sessão.
export function registrarAvisosMetasVencidas(d,avisos){
 const existentes=new Set((d.notificacoes||[]).map(n=>n.id));
 const novos=(avisos||[]).filter(a=>a&&!existentes.has(a.id)&&existentes.add(a.id));
 if(novos.length)d.notificacoes=[...novos.map(a=>structuredClone(a)),...(d.notificacoes||[])];
 return d;
}

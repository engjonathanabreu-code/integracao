// Apoio compartilhado pelos testes de reprodução sync-c1..c6.
// Somente dados fictícios; nenhuma rede ou armazenamento real.
import {abrirFilaIntencoes} from '../src/fila-intencoes.js';
import {criarIndexedDBMemoria} from './apoio-indexeddb-memoria.js';

export const CONTA='conta-fixture';
export const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

export function novaFila({inicio=1_000_000,aleatorio=()=>1}={}){
 const mem=criarIndexedDBMemoria(),relogio={agora:inicio};
 const nome='fila-teste-'+Math.random().toString(36).slice(2);
 const abrir=()=>abrirFilaIntencoes({indexedDB:mem.indexedDB,nome,agora:()=>relogio.agora,aleatorio});
 const fila=abrir();
 return {fila,abrir,mem,relogio,nome,
  ler:id=>mem.ler(nome,CONTA,id),
  editar:(id,fn)=>mem.editar(nome,CONTA,id,fn)};
}

export const edicaoMeta=(id,de,para)=>({colecao:'metas',id,antes:{existe:true,valor:{id,titulo:de}},depois:{existe:true,valor:{id,titulo:para}}});

export function enfileirarMeta(fila,{id=crypto.randomUUID(),metaId=uuid(1),de='Antes',para='Depois',dependencias=[]}={}){
 const edicao=edicaoMeta(metaId,de,para);
 return fila.enfileirar({conta:CONTA,id,unidade:JSON.stringify(['metas',metaId]),recursos:[JSON.stringify(['metas',metaId])],modulo:'metas',
  dependencias,operacoes:[],preparar:true,base:{},intencao:{edicoes:[edicao],arquivos:{}}});
}

export const erroCom=(mensagem,props)=>Object.assign(new Error(mensagem),props);

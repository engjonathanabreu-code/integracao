import {visible,flags} from './mailing-store.js';
import {SETORES} from './permissoes.js';
export function sectorAccounts(users){return [...new Set(users.filter(u=>u.ativo!==false).map(u=>u.setor).filter(s=>s&&s!=='consulta'))].map(sector=>({id:'sector:'+sector,nome:SETORES[sector]?.nome||sector,setor:sector,ativo:true,mailbox:true}));}
export function allowedMailboxes(user,users){if(user.ativo===false)return [];return [{id:user.id,nome:'Minha caixa'},...sectorAccounts(users).filter(s=>user.setor==='diretoria'||s.setor===user.setor)];}
export function mailboxCounts(state,id){const received=(state?.messages||[]).filter(m=>visible(m,id,'inbox'));return {received:received.length,unread:received.filter(m=>!flags(m,id).read).length};}

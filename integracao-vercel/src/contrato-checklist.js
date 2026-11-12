// Timestamp contract shared by checklist encoding and read-back. PostgreSQL
// stores microseconds; compare those exactly instead of truncating to JS ms.
export function instanteChecklist(valor) {
 const iso=typeof valor==='string'&&valor.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/);
 if(!iso||Number(iso[2])>23||Number(iso[3])>59||Number(iso[4])>59)return null;
 const instante=Date.parse(valor);
 if(!Number.isFinite(instante)||new Date(iso[1]+'T00:00:00Z').toISOString().slice(0,10)!==iso[1])return null;
 return BigInt(instante)*1000n+BigInt((iso[5]||'').padEnd(6,'0').slice(3));
}
export function horarioNovoChecklist(valor) {
 if(valor==null||valor==='')return null;
 if(instanteChecklist(valor)===null)throw Object.assign(new Error('O horário de conclusão do checklist é inválido. Revise o item; o original foi preservado.'),{code:'22007',status:422});
 return valor;
}

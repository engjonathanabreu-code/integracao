export function municipioDaRota(db,r) {
  if(r.pag==='municipio')return r.id;
  if(r.pag==='processo')return db.processos.find(p=>p.id===r.id)?.municipioId;
  if(r.pag==='remessa')return db.remessas.find(x=>x.id===r.id)?.municipioId;
  if(['nucleo','campo','prf'].includes(r.pag)){
    const n=db.nucleos.find(x=>x.id===(r.nucleoId||r.id));
    return n?.municipioId||db.remessas.find(x=>x.id===(r.semNucleo||r.remessaId))?.municipioId;
  }
  return null;
}

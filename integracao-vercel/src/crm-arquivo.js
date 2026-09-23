// Quoted CSV fields still need formula neutralization when opened in spreadsheets.
export function csvArquivo(registros,nomeUsuario){
 const celular=v=>{const s=String(v??'');return '"'+(/^[\s]*[=+\-@]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};
 const cabecalho=['Nome','Telefone','Município','Status anterior','Valor negociado','Responsáveis','Motivo','Arquivado em','Arquivado por','Restaurado em','Restaurado por','Histórico de FollowUp'];
 const linhas=registros.map(r=>{const d=r.dados;return [d.lead_nome,d.lead_telefone,d.municipio||d.lead_cidade,d.status,d.valor_total,[d.responsavel_id,...(d.comerciais_adicionais||[])].filter(Boolean).map(nomeUsuario).join(', '),r.motivo,r.arquivado_em,nomeUsuario(r.arquivado_por),r.restaurado_em,r.restaurado_por?nomeUsuario(r.restaurado_por):'',(d.followups||[]).filter(f=>f.resumo).map(f=>`${f.concluido_em}: ${f.resumo}`).join('\n')];});
 return '\ufeff'+[cabecalho,...linhas].map(l=>l.map(celular).join(';')).join('\r\n');
}

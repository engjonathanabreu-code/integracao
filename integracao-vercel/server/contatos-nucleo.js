export class ErroContatos extends Error {constructor(message,status=400){super(message);this.status=status;}}
const uuid=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||'');
export function celulaCSV(value){let s=String(value??'');if(/^[\s\uFEFF]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function csvContatos(rows){return '\uFEFF'+[['Núcleo','Código','Nome','Telefone','WhatsApp','E-mail'],...rows.map(r=>[r.nucleo,r.codigo,r.nome,r.telefone,r.whatsapp,r.email])].map(row=>row.map(celulaCSV).join(';')).join('\r\n');}
export function contatosDaCarga(carga,aliases,nucleo) {
  const clientes=new Map(carga.clientes.map(c=>[c.id,c])),rows=new Map(),ids=new Set(aliases);
  for(const e of carga.complementos){const d=e.dados||{};if(!ids.has(d.nucleoId))continue;if(e.referencia_id&&!clientes.has(e.referencia_id))continue;const c=clientes.get(e.referencia_id)||{},p=d.requerente||{};
    const id=e.referencia_id||e.registro_id;if(!id)continue;
    rows.set(id,{nucleo:nucleo.nucleo,codigo:c.codigo||d.codigo||'',nome:c.nome||p.nome||'',telefone:p.telefone||c.telefone||'',whatsapp:p.whatsapp||'',email:p.email||c.email||''});
  }
  return [...rows.values()].sort((a,b)=>String(a.codigo).localeCompare(String(b.codigo),'pt-BR',{numeric:true})||a.nome.localeCompare(b.nome,'pt-BR'));
}
export async function carregarContatosNucleo({nucleoId,authorization,fetchImpl=fetch,url=process.env.VITE_ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co',apikey=process.env.VITE_ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4'}) {
  if(!uuid(nucleoId))throw new ErroContatos('Selecione um NUI válido e confirme o registro.',400);
  if(!/^Bearer \S+$/.test(authorization||''))throw new ErroContatos('Entre novamente para exportar.',401);
  const headers={apikey,Authorization:authorization,'Content-Type':'application/json'};
  const request=async(path,body)=>{const r=await fetchImpl(url+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new ErroContatos(r.status===401?'Sua sessão expirou.':r.status===403?'Seu acesso não autoriza esta consulta.':'Não foi possível consultar os registros.',r.status===401?401:r.status===403?403:503);return r.json();};
  // All reads carry the caller's token. No service role, account substitution or data writes.
  const auth=await request('/auth/v1/user');if(!uuid(auth?.id))throw new ErroContatos('Sessão inválida.',401);
  const profiles=await request('/rest/v1/profiles?select=ativo&id=eq.'+encodeURIComponent(auth.id));if(!profiles.some(p=>p.ativo===true))throw new ErroContatos('Conta sem acesso ativo.',403);
  const nucleos=await request('/rest/v1/processos_kanban?select=id,nucleo,municipio,estado&id=eq.'+encodeURIComponent(nucleoId));
  if(nucleos.length!==1||nucleos[0].id!==nucleoId)throw new ErroContatos('NUI não encontrado no seu acesso. Confirme a seleção.',404);const nucleo=nucleos[0];
  if(!nucleo.municipio||!nucleo.estado)throw new ErroContatos('Confirme o município e a UF do NUI no cadastro antes de exportar.',409);
  const municipios=await request('/rest/v1/fin_receb_municipios?select=id,nome,uf&nome=eq.'+encodeURIComponent(nucleo.municipio)+'&uf=eq.'+encodeURIComponent(nucleo.estado||'SC'));
  if(municipios.length!==1)throw new ErroContatos('Não foi possível identificar um único município autorizado para este NUI.',409);
  const extras=await request('/rest/v1/integracao_nucleos?select=registro_id&colecao=eq.nucleos&referencia_tabela=eq.processos_kanban&referencia_id=eq.'+encodeURIComponent(nucleoId));
  const aliases=[nucleoId,...extras.map(e=>e.registro_id)];const pagina=inicio=>request('/rest/v1/rpc/integracao_moradores_carga',{municipio:municipios[0].id,resumo:false,inicio});
  const carga=await pagina(0);if(!Array.isArray(carga.clientes)||!Array.isArray(carga.complementos)||!Number.isInteger(carga.total)||carga.total<0||carga.total>200000)throw new ErroContatos('Carga incompleta ou fora do limite; nenhum arquivo foi gerado.',503);
  for(let inicio=500;inicio<carga.total;inicio+=500){const next=await pagina(inicio);if(!Array.isArray(next.complementos)||!next.complementos.length)throw new ErroContatos('Uma página não foi confirmada. Tente novamente; nenhum arquivo parcial foi gerado.',503);carga.complementos.push(...next.complementos);}
  const unique=new Map(carga.complementos.map(e=>[e.registro_id,e]));if(unique.size!==carga.total)throw new ErroContatos('Os registros mudaram durante a leitura. Tente novamente; nenhum arquivo parcial foi gerado.',409);
  carga.complementos=[...unique.values()];return {nucleo,rows:contatosDaCarga(carga,aliases,nucleo)};
}

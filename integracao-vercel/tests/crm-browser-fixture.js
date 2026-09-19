// Isolated browser fixture: no production data or requests.
import {id} from './fixture.js';
export function instalarCRMFixture(base) {
 base.profiles.push({id:id(70),nome:'Ana Comercial',tipo:'Comercial',ativo:true},{id:id(71),nome:'Bia Comercial',tipo:'Comercial',ativo:true});
 const card={id:id(200),cliente_id:id(4),responsavel_id:id(70),status:'Cliente novo',nome:'Morador Teste',cpf_cnpj:'52998224725',telefone:'47999990000',municipio:'Município teste',municipio_id:id(2),remessa_id:id(3),remessa:'Remessa teste',origem:'manual'};
 base.integracao_crm_cards=[card,{id:id(201),lead_nome:'Lead de demonstração',lead_telefone:'47988880000',responsavel_id:id(70),status:'Cliente novo',origem:'chatwoot'}];
 base.integracao_crm_tarefas=[];base.integracao_crm_atendimentos=[];base.integracao_crm_conversas=[];base.integracao_crm_mensagens=[];base.integracao_crm_agentes=[];
 base.integracao_semanal_municipios=[{id:id(210),municipio_id:id(2),nucleo_id:id(5),semana_padrao:1,ativo:true,telefone:'4733330000',observacoes:'Retorno semanal'}];
 for(const t of ['semanas','registros','arquivos','exclusoes'])base['integracao_semanal_'+t]=[];
 base.integracao_marketing_etapas=[{id:id(220),fase_numero:1,fase_nome:'Boas-vindas',codigo:'M1',ordem:1,titulo:'Apresentar equipe',descricao:'Mensagem inicial no grupo de moradores.'},{id:id(221),fase_numero:2,fase_nome:'Acompanhamento',codigo:'M2',ordem:1,titulo:'Atualizar moradores'}];
 base.integracao_marketing_projetos=[{id:id(222),nucleo_id:id(5),ativo:true}];base.integracao_marketing_progresso=[];base.integracao_nucleo_ia=[];
 base.processos_kanban_andamentos=[{id:id(230),processo_id:id(5),status:'Topografia',status_operacional:'Em andamento',descricao_cliente:'Levantamento em conferência.',observacao_interna:'Nota interna de teste',data_atualizacao:'2026-09-19',visivel_ia:false}];
 return (url,options,json)=>{
  const table=url.pathname.split('/').at(-1),method=options.method||'GET';
  if(table==='integracao_crm_transferir'){const p=JSON.parse(options.body);base.integracao_crm_cards.find(c=>c.id===p.card).responsavel_id=p.destino;return json(null);}
  if(table==='integracao_semanal_decidir'){const p=JSON.parse(options.body),r=base.integracao_semanal_exclusoes.find(r=>r.id===p.pedido);r.status=p.aprovar?'aprovado':'recusado';if(p.aprovar)base.integracao_semanal_municipios.find(c=>c.id===r.municipio_id).ativo=false;return json(null);}
  if(!/^(integracao_crm_|integracao_semanal_|integracao_marketing_|integracao_nucleo_ia|processos_kanban_andamentos)/.test(table))return undefined;
  let rows=table==='integracao_crm_funil'?base.integracao_crm_cards:base[table];if(!rows)return json({message:'Tabela não simulada'},400);
  const matches=r=>[...url.searchParams].every(([k,v])=>v.startsWith('eq.')?String(r[k])===v.slice(3):v.startsWith('in.(')?v.slice(4,-1).split(',').includes(String(r[k])):true);
  if(method==='POST'){const r={id:crypto.randomUUID(),created_at:new Date().toISOString(),concluida:false,concluido:false,ativo:true,responsavel_id:id(1),...JSON.parse(options.body)};rows.push(r);return json([r]);}
  if(method==='PATCH'){const found=rows.filter(matches);found.forEach(r=>Object.assign(r,JSON.parse(options.body)));return json(found);}
  const offset=Number(url.searchParams.get('offset')||0);return json(rows.filter(matches).slice(offset,offset+500));
 };
}

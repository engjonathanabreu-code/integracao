import {tabelasProprias} from '../src/persistencia-modulos.js';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function fixture() {
  const tables=['profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','processos_kanban','processos_kanban_andamentos','processos_kanban_observacoes','processos_kanban_historico','meta_setores','metas','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','ordens_servico','ordem_servico_comentarios','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','projetos','erp_agendas','erp_eventos','erp_evento_respostas','erp_conversas','erp_mensagens','integracao_complementos'];
  const b=Object.fromEntries([...tables,...tabelasProprias,'integracao_arquivos','meta_arquivos','erp_exclusoes_chat','documentos'].map(t=>[t,[]]));
  b.profiles=[{id:id(1),nome:'Equipe Teste',tipo:'Administrador',ativo:true,email:'teste@example.invalid'}];
  b.fin_receb_municipios=[{id:id(2),nome:'Município teste',uf:'SC',prefixo:'TST'}];
  b.fin_receb_remessas=[{id:id(3),municipio_id:id(2),codigo:'TST01',nome:'Remessa teste'}];
  b.fin_receb_clientes=[{id:id(4),municipio_id:id(2),remessa_id:id(3),codigo:'TST01_001',nome:'Morador Teste',cpf_cnpj:'',ativo:true}];
  b.processos_kanban=[{id:id(5),municipio:'Município teste',estado:'SC',nucleo:'NUI01',etapa_atual:'Topografia',responsavel_id:id(1),prioridade:'Normal',pendencia:'',observacao_interna:'',sla_prazo:null}];
  b.meta_setores=[{id:id(6),nome:'Topografia',ativo:true}];
  b.metas=[{id:id(7),titulo:'Meta Teste',status:'Em andamento',setor_id:id(6),associacao_tipo:'avulsa',associacao_id:null,created_by:id(1),observacoes:'',semana_inicio:'2026-09-14',created_at:'2026-09-14T12:00:00Z',prazo:'2026-10-01'}];
  b.meta_responsaveis=[{meta_id:id(7),usuario_id:id(1)}];
  b.planos_trabalho=[{id:id(8),titulo:'Plano Teste',status:'Em andamento'}];
  b.etapas_plano=[{id:id(9),plano_id:id(8),titulo:'Etapa teste',status:'Pendente',ordem:0,prioridade:'Normal',prazo:null}];
  b.entregaveis=[{id:id(10),etapa_id:id(9),titulo:'Entregável teste',concluido:false,concluido_em:null}];
  return b;
}
export const blank=()=>({municipios:[],remessas:[],processos:[],nucleos:[],usuarios:[],setoresMeta:[],metas:[],ordensServico:[],planos:[],agendas:[],eventos:[],conversas:[],auditoria:[],campos:{lista:[]},regrasIA:[]});

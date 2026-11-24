import {codificarNumeroFinanceiro} from './contrato-financeiro.js';
// Only schema metadata observed in the database is retained. PostgreSQL details
// can contain a complete failing row; messages/details never enter the journal.
// `orientacoes` is also the allowlist accepted by the remote-support SQL
// (20261112202826_suporte_remoto_exclusivo.sql): never extend it without a migration.
const orientacoes={
 fin_receb_clientes_dia_vencimento_check:'O dia de vencimento deve estar entre 1 e 31.',
 fin_receb_clientes_numero_parcelas_check:'O número de parcelas deve ser positivo ou estar ausente.',
 integracao_moradores_colecao_check:'O vínculo do morador deve pertencer à coleção de processos.',
 integracao_moradores_dados_check:'Os dados do morador devem estar no formato de objeto.',
 processos_kanban_etapa_atual_check:'Revise a etapa do núcleo entre as opções disponíveis.',
 processos_kanban_etapa_prefeitura_check:'Revise a etapa da prefeitura entre as opções disponíveis.',
 processos_kanban_prioridade_check:'Revise a prioridade entre as opções disponíveis.',
 profiles_tipo_check:'Revise o perfil entre as opções autorizadas.'
};
export const restricaoPermitida=v=>typeof v==='string'&&Object.hasOwn(orientacoes,v)?v:null;
export const orientacaoRestricao=v=>orientacoes[restricaoPermitida(v)]||null;
export function restricaoDaFalha(e){
 const vistos=new Set();
 while(e&&!vistos.has(e)){
  vistos.add(e);
  if(e.code==='23514'){
   const nome=restricaoPermitida(e.constraint)||restricaoPermitida(typeof e.message==='string'?e.message.match(/\bcheck constraint "([a-z][a-z0-9_]{0,62})"/)?.[1]:null);
   if(nome)return nome;
  }
  e=e.cause;
 }
 return null;
}

// Local rules (field + guidance) for 23514/23P01/P0001. Keys are fixed and
// local-only; the server text is matched, never stored or shown.
const ETAPAS_PREFEITURA=Object.freeze(['Parecer Social','Notificações','Parecer setor Planejamento','Parecer setor Meio Ambiente','Parecer setor Defesa Civil','Despacho de Saneamento','CRF']);
const FLUXOS_HISTORICO=Object.freeze(['interno','prefeitura']);
export const REGRAS_VALIDACAO=Object.freeze({
 // 23514 (nomes da allowlist acima, com o campo do modelo).
 fin_receb_clientes_dia_vencimento_check:{campo:'comercial.diaVencimento',orientacao:orientacoes.fin_receb_clientes_dia_vencimento_check},
 fin_receb_clientes_numero_parcelas_check:{campo:'comercial.parcelas',orientacao:orientacoes.fin_receb_clientes_numero_parcelas_check},
 integracao_moradores_colecao_check:{campo:'colecao',orientacao:orientacoes.integracao_moradores_colecao_check},
 integracao_moradores_dados_check:{campo:'dados',orientacao:orientacoes.integracao_moradores_dados_check},
 processos_kanban_etapa_atual_check:{campo:'etapaProcesso',orientacao:orientacoes.processos_kanban_etapa_atual_check},
 processos_kanban_etapa_prefeitura_check:{campo:'etapaPrefeitura',orientacao:orientacoes.processos_kanban_etapa_prefeitura_check},
 processos_kanban_prioridade_check:{campo:'prioridade',orientacao:orientacoes.processos_kanban_prioridade_check},
 profiles_tipo_check:{campo:'tipoERP',orientacao:orientacoes.profiles_tipo_check},
 processos_kanban_historico_fluxo_check:{campo:'historicoEtapas.fluxo',orientacao:'O fluxo da etapa deve ser interno ou prefeitura.'},
 // 23P01: compartilhamento.sql, EXCLUDE (agenda_id =, tstzrange(inicio,fim,'[)') &&) com status ativo.
 integracao_reserva_sem_sobreposicao:{campo:'inicio',orientacao:'Já existe uma reserva ativa nesta agenda no mesmo horário. Escolha outro horário ou outra agenda.'},
 // P0001 de integracao_validar_evento e integracao_gravar.
 evento_participante_invalido:{campo:'participantes',orientacao:'Há participante sem perfil ativo no ERP. Remova-o ou escolha outra pessoa.'},
 evento_reserva_publica:{campo:'publico',orientacao:'Reservas de agenda precisam ser públicas para a equipe.'},
 evento_cor_administracao:{campo:'cor',orientacao:'Somente a administração pode alterar a cor deste evento.'},
 identidade_imutavel:{campo:'id',orientacao:'A identidade do registro não pode ser alterada. Crie um novo registro.'},
 registro_indisponivel:{campo:null,orientacao:'O registro foi removido ou não está mais acessível para você. Recrie-o ou descarte esta alteração.'},
 exclusao_nao_permitida:{campo:null,orientacao:'Este registro não pode ser excluído por esta tela.'},
});
const P0001=[
 [/^Participante inválido/,'evento_participante_invalido'],
 [/^Reservas de ativos devem ser públicas/,'evento_reserva_publica'],
 [/^Somente a administração pode alterar cores/,'evento_cor_administracao'],
 [/^Identidade do registro não pode ser alterada/,'identidade_imutavel'],
 [/^Registro indisponível ou sem permissão/,'registro_indisponivel'],
 [/^Exclusão (não permitida nesta tabela|não autorizada)/,'exclusao_nao_permitida'],
];
const nomeRestricao=e=>typeof e.constraint==='string'?e.constraint:typeof e.message==='string'?e.message.match(/\b(?:check|exclusion) constraint "([a-z][a-z0-9_]{0,62})"/)?.[1]:null;
// -> null | {codigo:'23514'|'23P01'|'P0001', regra, campo, orientacao}
export function regraDaFalha(e){
 const vistos=new Set();
 while(e&&!vistos.has(e)){
  vistos.add(e);
  const nome=nomeRestricao(e);
  if((e.code==='23514'||e.code==='23P01')&&nome&&Object.hasOwn(REGRAS_VALIDACAO,nome))return {codigo:e.code,regra:nome,...REGRAS_VALIDACAO[nome]};
  if(e.code==='P0001'&&typeof e.message==='string'){
   const regra=P0001.find(([re])=>re.test(e.message))?.[1];
   if(regra)return {codigo:'P0001',regra,...REGRAS_VALIDACAO[regra]};
  }
  e=e.cause;
 }
 return null;
}
export const orientacaoRegra=regra=>typeof regra==='string'&&Object.hasOwn(REGRAS_VALIDACAO,regra)?REGRAS_VALIDACAO[regra].orientacao:null;

// Pure pre-checks for forms (A5). Each returns a list of problems
// {regra,campo,mensagem}; an empty list means the server rule is not violated.
const problema=(regra,extra={})=>({regra,campo:REGRAS_VALIDACAO[regra]?.campo??null,mensagem:REGRAS_VALIDACAO[regra]?.orientacao??'',...extra});
const instante=v=>typeof v==='string'||v instanceof Date?Date.parse(v instanceof Date?v.toISOString():v):NaN;
const ativo=e=>(e?.status??'ativo')==='ativo';

// Mirrors integracao_reserva_sem_sobreposicao: same agendaId, status 'ativo',
// half-open [inicio,fim). Only expanded occurrences present in `eventos` are checked.
export function validarSobreposicaoEvento(evento,eventos=[]){
 if(!evento?.agendaId||!ativo(evento))return [];
 const i=instante(evento.inicio),f=instante(evento.fim);
 if(!Number.isFinite(i)||!Number.isFinite(f))return [];
 if(f<i)return [{regra:'evento_intervalo_invalido',campo:'fim',mensagem:'O fim do evento deve ser posterior ao início.'}];
 const conflitos=(eventos||[]).filter(o=>o&&o.id!==evento.id&&o.agendaId===evento.agendaId&&ativo(o)&&instante(o.inicio)<f&&i<instante(o.fim)).map(o=>o.id);
 return conflitos.length?[problema('integracao_reserva_sem_sobreposicao',{conflitos})]:[];
}

// Event rules enforced by integracao_validar_evento (P0001) plus the overlap.
// `perfisAtivos`: ids (raw or erp_) of active profiles; omitted = not checked.
export function validarRegrasEvento(evento,{eventos=[],perfisAtivos,anterior,administrador=false}={}){
 const lista=[...validarSobreposicaoEvento(evento,eventos)];
 if(evento?.agendaId&&evento.publico===false)lista.push(problema('evento_reserva_publica'));
 if(perfisAtivos){
  const ativos=new Set([...perfisAtivos].map(x=>String(x).replace(/^erp_/,'')));
  const invalidos=(evento?.participantes||[]).filter(p=>!ativos.has(String(p).replace(/^erp_/,'')));
  if(invalidos.length)lista.push(problema('evento_participante_invalido',{participantes:invalidos}));
 }
 if(anterior&&!administrador&&anterior.cor!==evento?.cor)lista.push(problema('evento_cor_administracao'));
 return lista;
}

// Checks proven in the repository (fin_receb_clientes and processos_kanban).
// `processo`: morador (collection processos); `nucleo`: núcleo (processos_kanban).
// etapa_atual/prioridade lists live in the ERP schema: pass them to check.
export function validarRestricoesProcesso({processo,nucleo}={},{etapasProcesso,prioridades}={}){
 const lista=[];
 const c=processo?.comercial;
 if(c&&Object.hasOwn(c,'diaVencimento')){
  const dia=codificarNumeroFinanceiro('diaVencimento',c.diaVencimento);
  if(dia!==null&&!(Number.isInteger(dia)&&dia>=1&&dia<=31))lista.push(problema('fin_receb_clientes_dia_vencimento_check'));
 }
 if(c&&Object.hasOwn(c,'parcelas')){
  const n=codificarNumeroFinanceiro('parcelas',c.parcelas);
  if(n!==null&&!(Number.isFinite(n)&&n>0))lista.push(problema('fin_receb_clientes_numero_parcelas_check'));
 }
 if(nucleo){
  if(nucleo.etapaPrefeitura&&!ETAPAS_PREFEITURA.includes(nucleo.etapaPrefeitura))lista.push(problema('processos_kanban_etapa_prefeitura_check'));
  if(etapasProcesso&&nucleo.etapaProcesso!=null&&!etapasProcesso.includes(nucleo.etapaProcesso))lista.push(problema('processos_kanban_etapa_atual_check'));
  if(prioridades&&nucleo.prioridade!=null&&!prioridades.includes(nucleo.prioridade))lista.push(problema('processos_kanban_prioridade_check'));
  if((nucleo.historicoEtapas||[]).some(h=>h&&h.fluxo!=null&&!FLUXOS_HISTORICO.includes(h.fluxo)))lista.push(problema('processos_kanban_historico_fluxo_check'));
 }
 return lista;
}

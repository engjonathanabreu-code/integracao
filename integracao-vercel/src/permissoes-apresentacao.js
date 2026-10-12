import {permissoes,podeUsarAgentes} from './permissoes.js';
import {acessoCRM} from './crm-regras.js';
import {podeEditarOficios} from './oficios-permissoes.js';
// Representação somente de leitura das funções existentes. Não concede acesso.
export function representarPermissoes(usuario,{gerenciaMetas}={}) {
  const p=permissoes(usuario),crm=acessoCRM(usuario);
  const rows=[
    ['editarClientes','Clientes','Editar clientes',p.editarClientes],['criarMoradores','Clientes','Criar moradores',p.criarMoradores],
    ['criarNucleosRemessas','Núcleos e remessas','Criar',p.criarNucleosRemessas],
    ['cadastro','Dados cadastrais','Editar seção',p.cadastro],['social','Cadastro social','Editar seção',p.social],['imovel','Imóvel','Editar seção',p.imovel],
    ['validarDocs','Documentos','Validar',p.validarDocs],['juridico','Jurídico','Editar seção',p.juridico],
    ['campo','Campo','Editar levantamento',p.campo],['campoOffline','Campo offline','Abrir',p.campoOffline],
    ['prf','PRF','Editar',p.prf],['modeloPRF','PRF','Editar modelo',p.modeloPRF],
    ['financeiro','Financeiro','Operar',p.financeiro],['planos','Planos de trabalho','Gerenciar',p.planos],
    ['usuarios','Usuários e setores','Gerenciar',p.usuarios],['config','Configurações','Gerenciar',p.config],['importar','Importação','Executar',p.importar],
    ['crm','CRM','Área comercial',crm.comercial],['marketing','Marketing','Abrir',crm.marketing],['pos','Gestão semanal','Abrir',crm.pos],
    ['agentes','Agentes IA','Abrir',podeUsarAgentes(usuario)],['oficios','Ofícios','Editar',podeEditarOficios(usuario)],
  ];
  if(gerenciaMetas)rows.push(['metas','Metas','Gerenciar e aprovar',gerenciaMetas(usuario)]);
  return rows.map(([chave,recurso,acao,permitido])=>({chave,recurso,acao,permitido:!!permitido}));
}

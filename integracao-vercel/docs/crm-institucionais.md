# Clientes institucionais no CRM

O botão Clientes institucionais abre negócios com prefeituras e órgãos públicos. Nome, contato, produto/serviço, valor e prazo inicial de FollowUp (1, 2 ou 4 dias corridos) são obrigatórios. A diretoria pode escolher o responsável; o comercial cadastra para si.

Os negócios usam tabelas próprias, sem vínculo ou escrita em fin_receb_clientes, integracao_moradores ou integracao_crm_cards. Permanecem exclusivamente nesta área do CRM, inclusive quando ganhos. Os indicadores do dashboard anterior continuam relativos ao funil de clientes individuais; o total de valor em negociação institucional aparece na própria área.

Status: Em negociação, Ganho ou Perdido. A perda exige resumo de 5 a 2000 caracteres. Encerrar o negócio cancela apenas o FollowUp pendente; os concluídos e a auditoria permanecem. Ao reabrir um negócio, é possível agendar um novo FollowUp na ficha. Concluir FollowUp exige confirmação, resumo e novo prazo, em operação atômica com proteção contra repetição e conflito.

RLS e operações protegidas permitem acesso ao responsável e à diretoria. Escritas diretas nas tabelas pelo navegador são bloqueadas. A versão do negócio impede sobrescrita de uma ficha desatualizada. Alterações de status, motivo e responsável ficam na auditoria.

## Correção do carregamento

O leitor genérico ordenava integracao_crm_chatwoot_resumo por id. A visão tem card_id como chave. A ordenação agora usa card_id, inclusive em páginas subsequentes. A simulação de navegador rejeita a coluna inexistente e o teste de transporte percorre duas páginas para evitar regressão.

## Verificação

Testes PostgreSQL isolados cobrem permissões, criação sem clientes, conclusão e cancelamento de FollowUp, motivo obrigatório, transferência, auditoria e concorrência. Testes de navegador em 1440 e 390 px cobrem o fluxo completo. Consultas no banco real validam a ordenação do resumo e as novas operações, com rollback dos dados de teste.

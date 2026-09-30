# Concorrência e recuperação de rascunhos

O checklist canônico ainda rejeitava a mesma conclusão gravada por outra pessoa. A gravação compartilhada também comparava documentos inteiros em alguns módulos, falhava quando dois clientes criavam o mesmo complemento e reenviava referências antigas após uma rejeição.

## Comportamento

- Todas as tabelas da função `integracao_gravar` conciliam campos independentes e aceitam valores já aplicados. Objetos JSON são conciliados recursivamente; listas com IDs únicos são conciliadas por item. Listas sem identidade e exclusões versus edições continuam exigindo revisão quando incompatíveis.
- Conclusões repetidas de checklist mantêm o autor e o horário da primeira conclusão. A criação concorrente do mesmo complemento conserva os campos dos dois clientes, sem substituir a identidade do registro.
- O navegador relê os registros, inclusive moradores fora do município ativo, antes de preparar outro envio. Preserva o rascunho e arquiva as versões antes da conciliação. Respostas perdidas continuam usando o mesmo pedido: só uma rejeição explícita permite gerar um novo envio.
- Campos realmente divergentes têm uma revisão com escolhas local/remota. Uma escolha só vale para a versão exibida; outra mudança no servidor exige nova revisão. Não há sobrescrita silenciosa.
- Negociação, conversão de lead, edição de parcela e institucional conciliam seus campos e mantêm validação de domínio, CAS ou bloqueio de linha. Os endpoints financeiros anteriores mantêm o controle de versão para clientes que não enviam referência anterior.
- Importação financeira aceita a referência original de cada parcela sem perder a atomicidade do lote. Reordenação já aplicada é aceita. Responsáveis de leads são conciliados como conjunto de inclusões e remoções. FollowUps iguais convergem sem duplicar o agendamento, com recibo durável para reenvios posteriores.
- Decisões diferentes de prazo, pagamento, edição/exclusão e correção de ponto não são consideradas equivalentes. A proteção contra perda de dados permanece.

## Validação

558 testes automatizados passaram, incluindo PostgreSQL isolado, idempotência, autoria, listas identificadas, criação concorrente, rollback de lote, permissões e recuperação. Compilação de produção aprovada.

Navegador isolado: oito cenários de conciliação desktop/mobile com F5 e revisão; seis cenários institucionais na interface completa; 16 cenários anteriores de sincronização; negociação e institucional desktop/mobile; financeiro com cinco perfis. Nenhuma credencial real foi usada.

As três migrações foram executadas em subtransação contra a estrutura real de produção e revertidas antes da aplicação definitiva. Auditoria de 17 contas: 15 checklists repetidos aceitos, 158 conciliações JSON aceitas, duas contas inativas bloqueadas, 49 casos sem autorização de edição e 18 sem amostra. Os 49 casos incluem restrições esperadas de confirmação de leitura, auditoria imutável e políticas de edição; não representam testes aprovados de escrita. Nenhum conflito falso foi identificado nos casos editáveis. Dados dos cenários, recibos e alterações de esquema foram revertidos.

`validar.sql` repete a auditoria com rollback. `reverter.sql` preserva os corpos anteriores das funções e remove os novos endpoints; exige restaurar a versão anterior da aplicação primeiro. Nenhuma política RLS nem permissão de tabela foi ampliada.

## Atualização de navegadores

Recarregar normalmente obtém a versão nova. Rascunhos antigos são retomados; não limpar o armazenamento do navegador. Uma divergência real será apresentada para escolha, mantendo uma cópia anterior.

# Revisão de sincronização de Metas

Correções isoladas a partir de `67969bf`, preservando a integração do PR 110. Não há migration, ampliação de permissões, restauração, limpeza de filas ou mecanismo de suporte remoto neste conjunto. Todos os reprodutores usam dados fictícios.

| Achado reproduzido | Mudança e limite |
| --- | --- |
| Um horário de checklist em `Z` divergia da representação PostgreSQL do mesmo instante | Compara microssegundos apenas no campo e na operação original da mesma identidade; valores, autores e identidades distintos continuam divergentes. |
| O quadro vazio de vendas era confundido com a listagem operacional | Explicita o caráter comercial e oferece a rota existente de Metas, mantendo seus filtros e permissões. |
| Reabrir checklist limpava o formulário com vazio e gravava `NULL` | Aceita somente a atualização explícita `concluido:false`/`concluido_em:null`, confirmada na própria linha. Nulo, ausência e vazio não se tornam equivalentes globalmente. |
| Responsáveis iguais podiam ser lidos em ordem diferente | Trata exclusivamente essa coleção de IDs válidos e únicos como conjunto exato. IDs extras, ausentes ou duplicados continuam divergentes. |
| Checklist inserido já concluído perdia seu horário; checklist inicial adquiria defaults de leitura | Envia o horário original validado, sem inventar autoria ou instante. Confere filhos por identidade e campos enviados; horário de INSERT exige vínculo à própria meta e operação. |
| Remover metadados do anexo apagava bytes usados por intenção anterior | Preserva os bytes locais; remove apenas metadados. Não implementa coletor ou segundo uploader. |
| A cópia de recuperação omitia bytes locais de anexos de Metas | Exporta em campo próprio apenas referências das intenções atuais e sinaliza ausentes/leitura indisponível como cópia parcial. Mudança de sessão interrompe a cópia. Não varre arquivos históricos. |
| Leitura global de preparação podia depender de falha em tabela alheia | Somente intenções exclusivas de Metas e auditoria usam os grupos Metas, usuários e auxiliar, mantendo contrato/perfis frescos e todos os filhos/anexos. Outras intenções e refresh geral preservam leitura completa. Falhas de contrato, perfil, checklist ou sessão continuam impedindo a operação. |

## Evidências e limites

Os reprodutores de comparação usam o encoder e a projeção reais, com casos negativos de identidade, autor, horário, ausência, nulo, operações diferentes e divergências de conteúdo. A jornada de duas contas usa o hook e IndexedDB reais: confirma por leitura um pedido com recibo, libera a sucessora da mesma meta, envia essa sucessora uma vez e a segunda conta observa a gravação ao reler o servidor fictício. O primeiro pedido não é reenviado. A jornada também confirma reabertura e reload sem repetição.

A interface foi exercitada com perfil Projetos em desktop e celular. Remoção e cópia de anexos foram exercitadas pelo formulário, armazenamento e hook reais; a cópia completa contém os bytes e a cópia parcial mantém originais e informa a falha permitida. O teste captura o Blob produzido pelo caminho de download para inspecionar seu conteúdo, sem usar arquivos de pessoas reais.

Essas evidências comprovam defeitos e correções com fixtures. Não identificam qual intenção está pendente em um aparelho real e não comprovam que outro aparelho recebeu dados. Uma fila real continua exigindo seu pedido, recibo e releitura na instalação correspondente; nenhuma pendência de colaborador é declarada resolvida por este relatório.

## Revisão e reversão

Os ajustes estão separados em commits para seleção e reversão. A branch possui deploy automático desativado nos dois arquivos Vercel. A publicação e qualquer ativação dependem de autorização específica; abrir PR de revisão não autoriza produção. A reversão é de código do cliente, preservando IndexedDB, arquivos, originais, pedidos, recibos e auditoria; não apague armazenamento para voltar uma versão. Os adaptadores de leitura antigos podem voltar a mostrar divergências já corrigidas. Os bytes retidos exigem futura análise de alcance para limpeza segura, fora deste escopo.

## Verificações locais desta revisão

O build integrado passou com 1.300 testes, nenhuma falha, e bundle Vite concluído. Mantém o aviso existente de chunk grande, sem falha de compilação. Não há scripts de lint ou tipos declarados no pacote. A suíte completa de navegador está em execução no momento deste registro; seu resultado e o da CI devem ser consultados antes de qualquer decisão de publicação. Os testes focados anteriores passaram: 48 de confirmação/encoder/projeção, nove de recuperação/cópia e 12 do seletor e dependências de leitura. Jornadas focadas já aprovadas incluem duas contas com recibo/sucessora/reabertura, vazio comercial em desktop/celular, remoção e exportação de anexo, e os sete cenários de leitura restrita descritos em `metas-leitura-escopo-20261112.md`.

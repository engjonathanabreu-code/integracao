# Ajustes de moradores e documental

Branch: `codex/moradores-documental-beneficiario`, baseada em `8728baa`.

## Campos e compatibilidade

- `conjuge.beneficiarioTitulo`: `sim`, `nao` ou vazio (não informado), inclusive nos cônjuges dos outros requerentes. Campo separado do antigo `beneficiario`, que recebia `sim` automaticamente mesmo sem seleção. O valor antigo permanece intacto. Sem o novo campo, `beneficiario=nao` continua como Não, pois nunca foi padrão automático. `beneficiario=sim` fica Não informado: o cadastro anterior não guardava proveniência que distinguisse um Sim intencional do padrão. A equipe deve reconfirmar; não existe inferência segura a partir desse valor isolado. Uma seleção explícita no campo novo prevalece, inclusive o vazio escolhido pela equipe.
- `extras.observacoesDocumental`: texto livre editável na seção Documental da guia Documentos. Usa o rascunho e o botão **Salvar alterações**, com descarte e aviso de alterações pendentes.
- Ambos usam o complemento JSON de `integracao_moradores.dados` e o armazenamento local existente. Nenhuma nova coluna, alteração de permissões ou carga de dados é necessária.
- A qualificação simples de posse inclui cônjuges somente com `beneficiarioTitulo = sim`. A qualificação civil completa mantém a identificação conjugal; a exigência documental de identidade também continua independente da condição de beneficiário.

## Upload e códigos

O cadastro inicial e a guia Documentos usam o mesmo componente de arrastar/selecionar arquivos e a mesma validação: formatos existentes, até 20 MiB por arquivo e 12 por lote. O botão nativo permite seleção pelo teclado. Soltar arquivo apenas seleciona; a análise continua dependente da ação explícita, permissões, sessão, cancelamento, processamento e tratamento de erro já existentes. Arquivos recusados geram mensagem e arquivos aceitos continuam disponíveis para análise.

Novos códigos no navegador usam pelo menos quatro dígitos. Prefixo, remessa, cálculo da sequência, arquivo completo e bloqueio de duplicidade continuam existentes. `9999` passa para `10000`, sem truncar. Nenhum código salvo é reformatado por este ajuste.

## Migração e concorrência

`20261019235636_moradores_codigo_quatro_digitos.sql` modifica a expressão de formatação dentro da definição vigente de `integracao_crm_privado.converter_lead`. Preserva validações, advisory lock, regras financeiras, atributos e ACL. Evita substituir a função por uma cópia antiga e sobrepor outras frentes do CRM. A migração aborta se não reconhecer o formato esperado.

A inspeção somente de leitura no ERP INTEGRAL Interno confirmou ausência de índice único de código e 112 grupos de códigos repetidos legados (igualdade após trim/maiúsculas). Por isso, somente mudar `padStart` não basta. A migração também cria a tabela privada `integracao_crm_privado.codigos_moradores_reservados`, com chave primária de código normalizado, RLS e nenhum acesso direto concedido à aplicação. Carrega uma reserva por código existente, sem atualizar/excluir moradores duplicados, e instala trigger antes de INSERT/alteração de código. A função privada do trigger usa SECURITY DEFINER somente para a reserva interna; a autorização da gravação do morador continua nas políticas e triggers existentes. Os REVOKE da migração atingem somente os dois objetos novos; não altera ACL, cargos, credenciais ou políticas existentes.

A chave equipara `_001` e `_0001`, ignora diferenças de caixa/espaços nas extremidades e não converte o sufixo para inteiro. A chave primária da reserva arbitra gravações concorrentes: apenas um morador pode reivindicar um código novo. O outro recebe erro 23505 e deve atualizar os dados e tentar novamente. Alterações sem mudar o código normalizado continuam permitidas para todos os legados duplicados. Códigos abandonados por renomeação ficam reservados para evitar reutilização silenciosa. O lock de remessa existente na conversão de leads é mantido. O teste com Promise.all em PGlite verifica duas requisições disputando o mesmo código, embora PGlite serialize consultas numa conexão; a garantia entre sessões vem da chave primária transacional do PostgreSQL.

A instalação segura adquire `SHARE ROW EXCLUSIVE` na tabela de clientes durante a carga inicial e criação do trigger, bloqueando escritas concorrentes por esse intervalo. Leituras continuam possíveis. A transação inteira reverte se ocorrer erro; nenhum registro original é renumerado ou removido.

Reversibilidade: o frontend anterior consegue ler os JSONs novos e mantém os valores extras. O formatador pode ser revertido de quatro para três dígitos com patch da definição vigente, sem reformatar códigos já gravados. A proteção de reserva pode permanecer durante rollback do frontend (recomendado). Removê-la exige remover apenas o trigger/função novos; manter a tabela de reservas conserva o histórico de códigos. Não se deve apagar moradores ou corrigir duplicatas como parte do rollback. A autorização posterior do usuário para aplicar quando pronto cobre a publicação após validação; registrar os resultados finais da aplicação separadamente.

## Verificação

Testes automatizados com dados sintéticos cobrem persistência e reabertura, edição de Sim/Não, legado com `beneficiario=sim` automático, qualificação de posse, sufixos e sequência, upload e bloqueios, cache, repetição e falhas da análise. A migração é executada em PostgreSQL isolado (PGlite), incluindo a conversão real de leads e preservação das condições financeiras; também há verificação de ACL e reaplicação.

Não foram enviados documentos reais nem feitas chamadas pagas à IA. A validação de análise usa respostas simuladas. A homologação visual local usa `tests/browser.html?moradoresAjustes`, banco/autenticação/realtime/IA simulados e persistência da fixture sintética entre recarregamentos. Confirmados criação com `TST01_0002`, seleção Sim/Não, observações salvas/reabertas, evento drop com DataTransfer sintético, recusa de formato e bloqueio durante análise com erro controlado e arquivo preservado. O botão nativo abre o seletor; preencher o seletor automaticamente foi bloqueado pela extensão do Opera, que exige acesso a URLs de arquivo. Essa permissão não foi alterada. O arraste por mouse do arquivo gerado pelo harness não transportou o File no Opera; o evento de drop sintético e seus handlers reais foram verificados. O build pode reportar os avisos de chunks grandes/importações mistas já existentes no projeto.

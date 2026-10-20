# Ajustes de moradores e documental

Branch: `codex/moradores-documental-beneficiario`, baseada em `8728baa`.

## Campos e compatibilidade

- `conjuge.beneficiarioTitulo`: `sim`, `nao` ou vazio (não informado), inclusive nos cônjuges dos outros requerentes. Campo separado do antigo `beneficiario`, que recebia `sim` automaticamente mesmo sem seleção. O valor antigo não é usado para inferir a opção nova.
- `extras.observacoesDocumental`: texto livre editável na seção Documental da guia Documentos. Usa o rascunho e o botão **Salvar alterações**, com descarte e aviso de alterações pendentes.
- Ambos usam o complemento JSON de `integracao_moradores.dados` e o armazenamento local existente. Nenhuma nova coluna, alteração de permissões ou carga de dados é necessária.
- A qualificação simples de posse inclui cônjuges somente com `beneficiarioTitulo = sim`. A qualificação civil completa mantém a identificação conjugal; a exigência documental de identidade também continua independente da condição de beneficiário.

## Upload e códigos

O cadastro inicial e a guia Documentos usam o mesmo componente de arrastar/selecionar arquivos e a mesma validação: formatos existentes, até 20 MiB por arquivo e 12 por lote. O botão nativo permite seleção pelo teclado. Soltar arquivo apenas seleciona; a análise continua dependente da ação explícita, permissões, sessão, cancelamento, processamento e tratamento de erro já existentes. Arquivos recusados geram mensagem e arquivos aceitos continuam disponíveis para análise.

Novos códigos no navegador usam pelo menos quatro dígitos. Prefixo, remessa, cálculo da sequência, arquivo completo e bloqueio de duplicidade continuam existentes. `9999` passa para `10000`, sem truncar. Nenhum código salvo é reformatado por este ajuste.

## Migração preparada, não aplicada

`20261019235636_moradores_codigo_quatro_digitos.sql` modifica somente a expressão de formatação dentro da definição vigente de `integracao_crm_privado.converter_lead`. Preserva validações, advisory lock, regras financeiras, atributos e ACL. Evita substituir a função por uma cópia antiga e sobrepor outras frentes do CRM. A migração aborta se não reconhecer o formato esperado; nesse caso deve ser revisada contra a função vigente, sem forçar a aplicação. Não atualiza linhas de moradores nem muda permissões.

Antes de disponibilizar os ajustes, revisar e aplicar a migração em ambiente de homologação. Até lá, a conversão de leads no banco mantém a formatação antiga. Produção exige autorização separada.

## Verificação

Testes automatizados com dados sintéticos cobrem persistência e reabertura, edição de Sim/Não, legado com `beneficiario=sim` automático, qualificação de posse, sufixos e sequência, upload e bloqueios, cache, repetição e falhas da análise. A migração é executada em PostgreSQL isolado (PGlite), incluindo a conversão real de leads e preservação das condições financeiras; também há verificação de ACL e reaplicação.

Não foram enviados documentos reais nem feitas chamadas pagas à IA. A validação de análise usa respostas simuladas. A homologação visual com sessão autorizada e banco de testes continua recomendada antes de produção. O build pode reportar os avisos de chunks grandes/importações mistas já existentes no projeto.

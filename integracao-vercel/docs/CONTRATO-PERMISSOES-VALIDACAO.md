# Contrato específico — validação local e ordem de aplicação

Base oficial incorporada: `cd35fcdb524b5a8e16590e4521255862cf37adec`. Esta branch contém os nove ajustes publicados e a continuação específica de permissões. Não contém contas, hashes de perfis, escolhas pessoais ou script de atribuições. A migração ainda não foi aplicada ao banco oficial e não existem contratos efetivos em produção na última consulta de leitura.

## Servidor e escopo

O contrato efetivo fica separado dos rascunhos. Ausência de contrato retorna herança das regras atuais, inclusive para perfis inativos fora do conjunto; os endpoints novos exigem sessão/perfil ativo. Só as contas explicitamente selecionadas passam pelos novos validadores de mutação. Não há alteração de cargo, setor ou concessão de administração/Financeiro/agentes.

O servidor avalia os requisitos reais de Topografia/Projeto antes de avançar morador ou núcleo. Resolve configuração municipal e campos/checklist no banco, exige o núcleo na etapa correspondente, deriva contagem de moradores ativos e desconsidera resumos enviados pelo cliente. Bloqueia requisitos automáticos forjados, salto de etapa, requisito de outro setor, retrocesso sem motivo novo e aprovação documental por edição de cadastro. O município canônico prevalece sobre o JSON. A rota legada de complementos é protegida junto às tabelas modulares. Aprovação negada de Metas também protege o status nos complementos.

Morador e núcleo usam o mesmo lock transacional por NUI. A tentativa concorrente falha com PT409 para recarregar, evitando aguardar locks em ordem inversa. Os outros perfis mantêm o fluxo anterior.

Planos: criação própria e edição somente no plano já acessível; projeto deve ser visível com o RLS do usuário; autoria não pode ser transferida. Responsáveis devem ser perfis ativos visíveis. Atribuir/remover um responsável altera o acesso somente ao plano correspondente. Não foi criado aprovador de Plano nem comando de exclusão.

## Inventário de exportações

| Caminho existente | Verificação antes de gerar/obter o arquivo |
|---|---|
| Contatos CSV por NUI | Clientes + Núcleos no servidor, antes da carga; sessão e RLS do NUI, paginação e filtro atuais |
| Pendências CSV | Clientes; Núcleos/Remessas quando presentes no contexto |
| Documentos de cliente, PDF/Word | Clientes + Documentos; helpers comuns também exigem Documentos |
| Memoriais de núcleo/unidades | Núcleos + Documentos |
| PRF Word/HTML | Núcleos + Documentos |
| Fotos de morador | Clientes + Documentos, antes de obter bytes |
| Geometria KML | Núcleos |
| Anexos de Metas | Metas + Documentos |
| Documentos de Plano | Planos, com ID/RLS do plano, + Documentos |
| Anexos do Chat | Chat, mantendo participação/storage atuais |

Histórico administrativo CSV e módulos não abrangidos continuam com os gates anteriores; não receberam concessões novas. Ler conteúdo continua permitindo cópia manual: bloquear comandos oficiais de exportação não constitui DRM nem nova restrição de leitura/storage. Prévias de documentos seguem como leitura.

Sem operação equivalente: excluir Plano, editar mensagem já enviada e comandos não existentes de exclusão de Clientes/Núcleos/Remessas ficam pendentes. Arquivar não foi reinterpretado como excluir. Aprovar Plano/Documento não foi criado; o fluxo documental existente continua separado. Solicitar exclusão de grupo não equivale a aprovar/excluir.

## Evidências

- 871 testes e build Vite aprovados após as correções funcionais; teste adicional de visibilidade por responsabilidade aprovado separadamente, sem alterar código funcional.
- 192 comparações do avaliador de morador e 128 do núcleo contra funções reais da interface, incluindo opcionais, configurações municipais, campos extras e requisitos automáticos.
- UPDATEs reais em PostgreSQL isolado: avanço incompleto/núcleo atrasado/inativo/auto-check/município forjado/rota legada/salto/retrocesso/aprovação de Meta negados; caminhos completos permitidos.
- Planos: projeto/plano alheio e autoria negados; responsabilidade inativa negada; efeito de atribuição/remoção restrito ao plano correspondente.
- Edge local 1440/390: 34 escolhas herdadas, autoedição negada, rascunho salvo/reaberto sem concessão efetiva. PDF/Word negados antes de qualquer download, zero erros JS.
- PostgreSQL 18.4 temporário local, duas conexões reais: concorrência entre morador e núcleo rejeitada com PT409, sem deadlock; morador pendente continua impedindo o núcleo após commit. Produção é PostgreSQL 17.6; não houve teste de mutação em produção.
- Script privado: fonte autorizada verificada por SHA-256 e cada regra comparada à escolha original; exatamente três alvos; CAS de 17 revisões; idempotência; auditoria com executor real e origem; nenhuma identidade humana simulada. Testado com perfis fictícios. Os outros 14 permaneceram iguais. Consulta oficial somente leitura confirmou as 17 revisões ainda iguais.

## Aplicação, interrupção e reversão

1. Obter a aprovação separada de produção e conferir novamente o HEAD, os 17 perfis e os checks. Abortar se houver diferença.
2. Aplicar a migração genérica, ainda sem contratos efetivos. Confirmar schema, funções, privilégios, advisors e perfis/políticas anteriores preservados.
3. Publicar o código validado e confirmar o deployment. O frontend depende do RPC novo: não publicá-lo antes da migração. Preview sem essa migração não comprova login funcional.
4. Executar o script privado dos três contratos, com CAS na mesma transação. Divergência ou contrato preexistente diferente aborta tudo; não remover o CAS. Conferir três contratos e ausência de mudanças nos demais perfis.
5. QA de leitura/navegação com sessão já autorizada; nenhuma exclusão ou mutação real para testar direitos.

Reversão: o script privado de rollback remove apenas os três contratos com a origem esperada, preservando auditoria e todos os dados de negócio. Isso restaura herança das regras anteriores. Reverter também o deployment se necessário; não apagar schema/auditoria nem reaplicar migrações cegamente. Os scripts privados não estão no Git.

Publicação permanece pendente: a revisão automática de aprovação rejeitou o merge do PR de correção do Financeiro por falta de aprovação separada. Nenhuma migração ou concessão efetiva desta continuação foi aplicada. O navegador conectado falha com MXC 0x80070003, portanto QA autenticado de produção segue bloqueado; não foi substituído por sessão fabricada.

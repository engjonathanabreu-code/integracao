# Edição do cadastro de clientes pelo Comercial

Correção aplicada em 23/09/2026 pela migração `20260923182216_clientes_edicao_comercial`.

O Comercial já possuía consulta a todos os moradores, e a interface de Clientes permite edição cadastral e comercial. A política UPDATE vigente, porém, dependia da existência de um cartão CRM visível ao usuário. O `SELECT ... FOR UPDATE` de `integracao_gravar` retornava zero linhas para clientes sem esse vínculo, gerando “Registro indisponível ou sem permissão: fin_receb_clientes”.

A política adicional permite UPDATE ao perfil Comercial ativo, reutilizando `public.is_comercial()`, com USING e WITH CHECK. Nenhuma política de exclusão, inserção, parcelas financeiras ou outros perfis foi alterada. A função de gravação mantém RLS, transação atômica, chave de idempotência e checagem de concorrência.

Reprodução em produção, sob papel authenticated e perfil Comercial ativo: antes, consulta=1 e bloqueio para edição=0; depois, ambos=1 e a RPC de gravação retornou sucesso. O teste real foi executado com o mesmo nome já existente e rollback, sem conservar alteração nos dados ou nos recibos.

Teste PGlite: reproduz a falha e confirma edição cadastral/entrada por Comercial ativo, sem liberar exclusão; Comercial inativo, Topografia, Projetos, Jurídico e anônimo continuam sem essa edição. Auditoria de segurança antes/depois sem novos apontamentos.

A correção é no banco e já vale para as versões abertas. Quando houver uma edição pendente, o usuário pode clicar em “Tentar salvar novamente”; não é necessário apagar dados locais, descartar a fila ou refazer o cadastro. Registros excluídos e conflitos reais continuam protegidos.

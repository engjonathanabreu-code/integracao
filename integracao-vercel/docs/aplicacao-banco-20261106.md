# Aplicação do banco — 06/11/2026

Projeto Supabase: `ycdsyilyvaxslkwbkxyo`. Aplicação autorizada pelo solicitante sem confirmação de backup recuperável, após aviso de risco. As três migrações foram aplicadas com sucesso pelo conector. Nenhum teste DML foi executado em registros reais.

| Arquivo local | Versão registrada no servidor | Nome |
|---|---|---|
| 20261106151450_projetos_geometrias_codigos_oficios.sql | 20261106170036 | projetos_geometrias_codigos_oficios |
| 20261106151525_documentos_observacoes.sql | 20261106170046 | documentos_observacoes |
| 20261106151603_termos_municipais_qualificacoes.sql | 20261106170055 | termos_municipais_qualificacoes |

O conector atribuiu os horários do servidor. Não reaplicar os arquivos locais como migrações pendentes; reconciliar esse mapeamento antes de futuro `db push`.

## Verificação

Preflight confirmou colunas e tipos das tabelas dependentes, RLS ativo, dependências de autorização e revisão existentes e ausência de colisão dos novos objetos. As definições de `oficio_registrar_v1`, `pode_editar_oficios` e `proteger_mutacao` coincidem por MD5 com as definições capturadas nos testes.

Após aplicação: RLS ativo nas quatro tabelas públicas novas; oito políticas presentes; quatro triggers de proteção de campos/código; quatro RPCs com EXECUTE para authenticated e sem EXECUTE para anon. Assinaturas dos RPCs confirmadas.

Contagens e assinaturas agregadas de todas as linhas permaneceram idênticas antes e depois:

| Tabela | Quantidade | MD5 agregado antes = depois |
|---|---:|---|
| integracao_moradores | 11431 | b0f5f266c9e5dfbd56482986a79b0f4d |
| integracao_nucleos | 733 | aa98c1d42eede57e764c7dd80d1b907b |
| fin_receb_clientes | 11509 | cb0b02b1e419467a9375a979158a2aa0 |
| profiles | 18 | 897a0742a9afa0bdbbe7cdf5ba5d00ce |

Isso comprova preservação dessas quatro tabelas durante a janela da implantação, sem divulgar conteúdos pessoais. Não é backup nem prova de recuperação por restauração.

## Reversão operacional

Os scripts de reversão em `supabase/operacoes` desabilitam as novas gravações/capacidades, preservando tabelas, documentos, histórico, guards, reservas e sequências. A reversão é funcional e conservadora; não restaura integralmente o schema anterior.

Para ofícios, manter o frontend novo capaz de consumir reservas existentes e suspender novas reservas conforme o script. Não restaurar indiscriminadamente a função antiga de registro e não retroceder a sequência anual. A interface de contingência não foi entregue como produto separado; o procedimento depende de manter a versão nova compatível.

Publicação do frontend e validação visual são etapas separadas e devem ser registradas pelo integrador. Este relatório comprova apenas a aplicação e as verificações de banco descritas.

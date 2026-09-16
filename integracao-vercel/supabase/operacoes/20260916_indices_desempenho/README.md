# PR 1 — índices do Integração

Somente os quatro índices solicitados. Produção **não alterada**; a execução foi validada primeiro em PostgreSQL 17.6 local, com dados sintéticos. PRs 2 e 3 aguardam revisão e aprovação deste PR.

## Execução sem transação

Inspecionados o package.json, README e a árvore do repositório em `a71def418a2cecb77c2c0ddf0636628993a87c8b`: não há executor de migrações configurado nos scripts npm nem workflow de migração. As migrações SQL históricas incluem `SET LOCAL`, compatível com execução transacional. Não presumimos que um executor de migrações permita CONCURRENTLY.

Por isso esta operação fica **fora de supabase/migrations**, em `supabase/operacoes`, e deve ser executada por uma conexão PostgreSQL administrativa direta (ou pooler de sessão), em autocommit. Não usar `supabase db push`, MCP apply_migration, BEGIN/COMMIT, `psql -1` nem um único `psql -c` contendo os quatro comandos. O deploy do frontend não aplica estes arquivos.

A validação local enviou cada comando separadamente pelo cliente PostgreSQL `pg`, sem BEGIN. Para a aplicação operacional, use psql:

```sh
# Executar dentro desta pasta, com PGHOST/PGPORT/PGDATABASE/PGUSER e
# credencial administrativa via .pgpass ou outro mecanismo seguro.
# Conferir host e banco antes de continuar. Não usar service role key.
psql -X -v ON_ERROR_STOP=1 -c 'select current_database(), inet_server_addr(), version();'
psql -X -v ON_ERROR_STOP=1 -f verificar.sql
psql -X -v ON_ERROR_STOP=1 -v AUTOCOMMIT=on -f aplicar.sql
psql -X -v ON_ERROR_STOP=1 -f verificar.sql
```

Antes da aplicação, os quatro nomes devem estar ausentes ou corresponder exatamente às definições deste PR, com `indisvalid` e `indisready` verdadeiros. Se houver definição diferente, parar. `IF NOT EXISTS` não verifica equivalência nem repara índice inválido.

Após a aplicação, devem existir exatamente quatro índices válidos e prontos. O arquivo aplica ANALYZE às duas tabelas. A consulta global de índices inválidos deve ser comparada ao inventário anterior; nunca remover índices de outras tarefas.

Se a criação falhar, pare e execute verificar.sql. Para um índice **criado por esta execução**, inválido e com a definição esperada, execute isoladamente `DROP INDEX CONCURRENTLY public.nome_exato_do_indice;`, usando somente um dos quatro nomes deste PR, e reaplique. Não faça limpeza global. Nenhum índice inválido foi encontrado na inspeção de produção nem no teste local.

Depois de aprovado e aplicado em produção, repetir a consulta abaixo com o mesmo núcleo medido antes e anexar a saída ao PR:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT registro_id, dados FROM public.integracao_moradores
WHERE (dados->>'nucleoId') = '<id-do-nucleo-medido>';
```

## Reversão

```sh
psql -X -v ON_ERROR_STOP=1 -v AUTOCOMMIT=on -f reverter.sql
psql -X -v ON_ERROR_STOP=1 -f verificar.sql
```

Remove exclusivamente os quatro índices deste PR, um comando por vez e fora de transação. Não reverta índices preexistentes que não tenham sido criados por esta operação. Reversão e reaplicação foram testadas. Nenhuma linha é alterada.

## Medições de 16/09/2026

| Ambiente | Antes | Depois | Blocos na execução |
|---|---:|---:|---|
| Produção, análise fornecida pelo solicitante | 2.850 ms | pendente de aprovação/aplicação | 34.055 antes |
| Produção, consulta de leitura desta revisão | 301,323 ms | pendente de aprovação/aplicação | 33.985 shared hit antes |
| Desenvolvimento local, dados sintéticos | 11,175 ms | 0,013 ms | 33.314 → 3 |

O teste local passou de Seq Scan para **Bitmap Index Scan + Bitmap Heap Scan**, com 24 resultados e uma página de heap. Não foi necessário forçar o planejador. A reversão voltou ao Seq Scan. Os planos completos estão em medicao-desenvolvimento.txt.

Dados locais: 11.063 moradores, 709 núcleos, média de 7.129,85 caracteres de JSON por morador, 93.528.064 bytes de relação total. JSON sintético pouco compressível, distribuição com 24 moradores consecutivos no núcleo alvo. Não é cópia de produção: compressibilidade, distribuição física, hardware, carga, cache e RLS diferem. O teste isola o custo do filtro; não mede a tela, a transferência/serialização do JSON nem promete esses tempos em produção. A variação da medição de produção em relação aos 2.850 ms informados é compatível com cache/carga diferentes; a varredura continua presente.

Plano de produção coletado somente por leitura; identificador do núcleo omitido:

```text
Seq Scan on integracao_moradores  (cost=0.00..444.94 rows=55 width=100) (actual time=95.468..301.203 rows=24 loops=1)
  Filter: ((dados ->> 'nucleoId'::text) = '<id-do-nucleo-medido>'::text)
  Rows Removed by Filter: 11039
  Buffers: shared hit=33985
Planning:
  Buffers: shared hit=119
Planning Time: 1.692 ms
Execution Time: 301.323 ms
```

## Reprodução em desenvolvimento

`fixture-desenvolvimento.sql` é **exclusivamente para um banco local descartável vazio**. Não é migração: cria somente duas tabelas sintéticas do Integração, sem tabelas canônicas. O teste cria um banco novo e não apaga bancos existentes. A fixture não reproduz policies, triggers ou a autenticação; não pretende validar RLS.

Com PostgreSQL local iniciado e Node disponível, instale o cliente somente em diretório temporário (nenhuma dependência adicionada ao aplicativo):

```sh
pasta_scripts="$PWD"
pasta_teste="$(mktemp -d)"
npm install --prefix "$pasta_teste" --no-audit --no-fund pg@8.23.0
cp testar-desenvolvimento.mjs "$pasta_teste/"
PGHOST=/caminho/do/socket/local node "$pasta_teste/testar-desenvolvimento.mjs" "$pasta_scripts"
```

O teste exige socket Unix local, cria um banco com prefixo `integracao_indices_pr1_dev_`, usa usuário local postgres, grava os planos e verifica: quatro índices válidos/prontos, nenhum inválido, 24 resultados, idempotência, reversão, preservação dos seis índices anteriores e hash do conteúdo integral das duas tabelas antes/depois. O cliente é ferramenta de teste, não caminho de escrita da aplicação. Nenhuma fixture deve rodar no Supabase de produção.

## Investigação: qualificacao.desatualizada

Na inspeção de metadados de produção, nenhuma função em public contém `desatualizada` no corpo. Os triggers encontrados nas tabelas integracao_* são os de proteção de representantes e validação de leitura; nenhum marca essa propriedade.

No App.jsx, `atualizarQualificacao` começa com false e só marca true quando a origem de simples/completa é `editada` ou `migrada` e `forcar` é falso. O salvamento do formulário do morador chama esse helper. Portanto há lógica no cliente, não um gatilho de banco; alterações externas não passam automaticamente por ela. O fato relatado de 10.384 registros sem true não demonstra sozinho que o helper nunca roda: para origem gerada ele mantém false por definição. Não foi alterado esse comportamento nem criado gatilho. Não houve comparação ou decisão sobre fontes de qualificação.

## Escopo e pendências

- Somente arquivos novos nesta pasta; nenhum arquivo existente alterado.
- Nenhuma escrita, índice ou política em tabela canônica do ERP.
- Nenhuma mudança no JSONB, RPC, aplicação, RLS ou estrutura de coluna.
- Nenhum índice antigo removido; nenhum trabalho do PR 2 ou PR 3 antecipado.
- Produção: aplicação e medição posterior pendentes de revisão; abrir este PR não aplica DDL.
- Build de frontend não executado: não há mudança em código, dependências ou configuração do frontend.

Referência: [PostgreSQL 17 — CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html), seção Building Indexes Concurrently.

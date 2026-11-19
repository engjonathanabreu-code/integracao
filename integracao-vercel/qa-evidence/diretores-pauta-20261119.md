# Diretoria: pauta de gestão local

Base: b1070cc. Escopo: AgentesPanorama, novo componente e função pura.

## Comportamento
- Preparar e copiar uma pauta dos dados já consultados no panorama autorizado.
- Ordenar aprovação, atraso, tempo prolongado na etapa e prazo próximo; manter homônimos distintos.
- Mostrar evidência, responsável registrado, fonte, data de leitura, data-base e espaço para decisão/responsável/prazo acordados.
- Mostrar limites: listas parciais, até 100 registros avaliados por lista, 10 itens exibidos, leitura não é atualização individual.
- Bloquear preparo/cópia em nova consulta, erro ou resposta de filtro anterior.
- Não executar decisões, criar metas, enviar mensagens, consultar chats, ampliar dados enviados à IA ou mudar permissões.

## Validações
- 8 testes focados: decisões representativas com fixtures sintéticas, ausência versus zero, homônimos, status, data-base, preservação da entrada, comercial sem conteúdo privado, interação React de preparar/copiar/fallback/bloqueio, chave completa da consulta.
- Benchmark sintético: 20 execuções com entrada de 10 mil registros e textos grandes em ~14,5 ms total; saída ~9,3 KB. Não é benchmark de latência do modelo nem do banco.
- Build Vite: aprovado, 24,06 s. Aviso preexistente de bundle grande permanece.
- Revisão independente: sem bloqueador de segurança; incorporados aviso de tempo na etapa e proteção contra consulta anterior.

## Limites e reversão
- Sem execução de LLM ao vivo, browser real ou produção; não afirmamos melhora da qualidade do modelo.
- Teste da troca de filtro combina asserção da chave no panorama com teste montado do componente bloqueado; não é E2E de rede.
- Sem migração, escrita ou novo endpoint. Reverter este commit remove o recurso sem alterar dados.
- PR, CI remota e deploy aguardam coordenação.

Resultado global: `npm run build` concluiu com 1400/1400 testes aprovados (194,95 s) e build final aprovado (15,12 s). A descoberta da suíte ocorreu antes da inclusão dos dois testes de UI e do caso adicional de status; os 8 testes finais focados foram executados separadamente e passaram. Logs locais: `/tmp/diretores-build.log`, `/tmp/diretores-vite.log` (não incluem dados de produção).

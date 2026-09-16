# Item 5 — impacto em 16/09/2026

Leitura agregada em produção, sem alterar registros. Considerada a situação do complemento e o ativo do cliente canônico quando necessário (LEFT JOIN somente leitura).

- 3.058 moradores ativos na Análise Documental: todos com checks.parecer ausente/falso.
- Os mesmos 3.058 também estão sem extras.cp_familia preenchido. Esse grupo repetível está ativo e obrigatório na documental na configuração atual. Não foram encontrados ajustesRequisitos globais desativando-o.
- Assim, **zero desses moradores têm apenas o parecer como impedimento**: todos permanecem com pelo menos a pendência de composição familiar após a mudança. Não é necessário expor cadastros pessoais para concluir isso.
- Prefeitura: 50 moradores ativos, dos quais 49 sem parecer. Esses 49 passam a exigir o parecer para concluir a etapa; o já marcado continua válido.

## Comportamento proposto para revisão

**Nenhum avanço automático**, alteração de etapa persistida ou reescrita de histórico. As pendências são recalculadas pela mesma regra compartilhada da tela e do resumo. O responsável continua clicando em concluir etapa, quando todos os requisitos estiverem satisfeitos. Moradores em etapas posteriores não são retrocedidos nem têm histórico alterado.

É necessário confirmar esse efeito na revisão antes de aplicar. Nenhuma alteração em produção foi feita por este PR.

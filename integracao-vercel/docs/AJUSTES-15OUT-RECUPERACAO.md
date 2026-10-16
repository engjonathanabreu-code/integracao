# Recuperação de sincronização e nuvem — 15/10/2026

Solicitação: executar os problemas da página “Ajustes no Integração”, preservar dados/funções/UI Guide, permitir ao Comercial cadastrar/mover municípios e resolver conflitos pelo valor mais recente.

## Alterações

- Conciliação automática por campo, usando datas de atualização e histórico disponíveis. Na ausência de datas confiáveis ou em empate, prevalece o valor recém-lido do servidor. Campos compatíveis e registros distintos são mantidos. As versões conflitantes são arquivadas no armazenamento do navegador antes da substituição.
- Pedidos com rejeição definitiva são reconstruídos sobre os dados atuais. Respostas de gravação desconhecidas continuam usando o mesmo pedido/recibo, evitando duplicação.
- Recuperação de registros ausentes em rascunhos cujas exclusões foram recusadas. Evita que uma cópia incompleta esconda clientes ou tente excluí-los repetidamente.
- Municípios restaurados de rascunhos são marcados para recarga. A retomada recupera somente fichas editadas e não comprova que todos os clientes foram carregados: abrir remessa/núcleo agora busca a coleção municipal completa, preservando as edições conciliadas.
- Metas já concluídas no servidor deixam de manter solicitações antigas de conclusão.
- Uma nova reserva recusada por sobreposição é preservada integralmente em cópia local exportável. A reserva confirmada permanece; as demais alterações podem sincronizar.
- Diretoria: leitura/edição de calendário alinhada à permissão já oferecida pela tela. Exclusão de evento vira cancelamento, conservando o histórico.
- Comercial: criação/movimentação municipal restrita ao registro de configuração do funil, com proteção dos núcleos, identificadores e histórico. Botão “Adicionar município” visível na nuvem, formulário em diálogo e classes/tokens existentes da UI Guide.
- Verificação humana: a tabela e a ação usam o mesmo documento mais recente da pessoa correta. Não são removidas exigências documentais nem aprovadas exceções automaticamente.

## Evidência

- Consulta sob o papel autenticado de cada um dos 15 usuários ativos retornou os mesmos 21 clientes de Penha, 21 complementos e 21 vínculos válidos com núcleos. Os 21 cards estão como `Cliente ativo`; seus cadastros canônicos também estão ativos. Distribuição: Osmar 5, Leticia 3, Rosani 3, Sônia 2, Walter 2, Valmira 5 e Área Amarela 1. Não há arquivamento dos clientes ou núcleos consultados. Nenhum cadastro precisou ser recriado ou movido.
- Regressão reproduzida no hook React: sessão com município anteriormente aberto e uma edição pendente devolvia somente a ficha editada ao reabrir o núcleo. O teste falhou antes da correção (1 cliente em vez de 2) e passou após marcar o município restaurado para recarga; a edição original permaneceu e a leitura não gerou gravações adicionais.
- As duas metas mencionadas na página já estavam `Concluído` no servidor; não foi necessário alterar seus status.
- Migração aplicada no ERP `ycdsyilyvaxslkwbkxyo`, versão remota `20261015234900`, nome `recuperar_sincronizacao_e_nuvem_comercial`. A diferença entre o horário do arquivo gerado e o registro remoto segue o padrão existente do repositório.
- Testes reais de cadastro/movimentação comercial e edição de calendário pela Diretoria executados dentro de transações revertidas. Nenhum município/evento de teste foi persistido.
- Verificação de segurança do Supabase: nenhum apontamento envolvendo as políticas/tabelas/função alteradas.
- Suíte existente com 885 testes aprovada, build Vite concluído. Testes adicionais cobrem UI comercial, RLS e seis cenários do hook React: divergência, igualdade, edições independentes, exclusão recusada, resposta perdida e reserva recusada.

## Limites operacionais

Rascunhos pendentes vivem no IndexedDB de cada navegador. A recuperação roda quando o usuário abre a versão atualizada e autentica; o servidor não permite processar remotamente o armazenamento de computadores desligados. Documentos que realmente descumprem regras e reservas incompatíveis não são aprovados artificialmente. O arquivo integral da reserva recusada fica disponível para consulta/novo agendamento.

A instalação local de navegador de teste não ficou disponível. A UI foi verificada por renderização React e o ciclo de sincronização foi exercitado com React DOM/LinkeDOM, sem tráfego de teste para serviços externos.

# Viagens do Financeiro no calendário

## Escopo

O Financeiro Integral e o Integração usam `ycdsyilyvaxslkwbkxyo`. Esta entrega é uma projeção somente leitura das solicitações de viagem aprovadas com carro e viagem reciprocamente vinculada. Não copia registros para `erp_eventos`, não altera aprovações, não dispara convites/e-mails e não grava preferências com conteúdo financeiro.

O calendário consulta `integracao_viagens_financeiro()` ao abrir, a cada 60 segundos, no foco e após reconexão. Uma falha limpa as viagens derivadas e avisa que a agenda está incompleta. A troca de conta/inativação continua validada no servidor e pelo escopo da sessão. Nenhuma credencial adicional é necessária.

## Dados e segurança

- Somente sessão com perfil ativo, mesma regra das agendas compartilhadas existentes.
- Retorno limitado a identificadores da solicitação/carro/solicitante, nome do solicitante, datas e status. Sem destino, conteúdo da solicitação, anexos ou valores.
- Vínculo pelo `requesterId` canônico, não por coincidência de nome/email.
- Exige status aprovado e revisão registrada, vínculo recíproco exclusivo com a viagem, veículo válido e datas válidas.
- Solicitação cancelada, devolvida, excluída, veículo divergente, identificadores duplicados ou vínculo ausente não entram. Arquivamento por si só não cancela aprovação.
- Período vem de `trips.start/end`, inclusive; `neededAt` serve apenas quando ambos estão ausentes. Não inventa horário: aparece como dia inteiro em todos os dias do período.
- Concluídas permanecem no histórico; não geram alerta de disponibilidade.

## Agendas e disponibilidade

A agenda HB20 existente foi confirmada como `ee6fe017-981f-406a-9813-0eea37877543`. O mapeamento usa ID, não nome editável. Gol não tem agenda persistente: aparece como agenda virtual, sem botão editar. Não permite criar eventos manuais nessa agenda virtual. Configuração em `src/calendario-viagens.js` deve ser revista caso cadastros mudem, nunca adivinhar por nome.

Sobreposições com eventos manuais ou outras viagens ativas são sinalizadas no período/filtros visíveis. A projeção **não é trava transacional de reservas**. A restrição existente em `erp_eventos` não cobre os JSONs do Financeiro. Não aplicar trigger que possa impedir aprovação financeira por sobreposição de registros históricos.

Alterar/cancelar continua exclusivamente no Financeiro. O modal é somente leitura; atualização substitui o resultado anterior sem duplicação e fecha detalhes de item que deixou de existir. O feed Google/ICS e notificações por e-mail não incluem esta projeção nesta entrega; por isso o botão adicionar à agenda pessoal não é oferecido para essas viagens.

## Inspeção de 18/11/2026

11 solicitações aprovadas com veículo (9 HB20/2 Gol), 9 aprovadas sem veículo. Dez das onze com veículo têm vínculo recíproco; uma Gol órfã fica fora. Não foram atribuídos veículos nem corrigidos vínculos por inferência. Isso é diagnóstico pontual, não contagem fixa do recurso.

## Aplicação, validação e rollback

Nenhum SQL foi executado no banco hospedado e nenhum deploy/merge foi feito para preparar esta entrega. Após autorização específica e revisão, registrar/aplicar a operação versionada `supabase/operacoes/calendario-viagens-financeiro.sql` pelo fluxo oficial de migrations do projeto e depois publicar o frontend. CLI Supabase não estava instalado neste executor, então não foi inventado nome timestamp de migration.

A operação cria somente schema privado e três funções, sem escrita em registros, mudança de RLS existente ou publicação Realtime. A função privada tem `SECURITY DEFINER` deliberado para retornar o mínimo sem conceder acesso aos JSONs financeiros, `search_path=''`, validação de conta ativa e grants fechados. Wrapper público é `SECURITY INVOKER`. Verificar advisors e chamada autenticada após aplicação.

Rollback: reverter frontend primeiro, depois executar `supabase/rollback/calendario-viagens-financeiro.sql`; remove só funções dessa projeção, sem CASCADE e sem apagar dados/eventos. Como não há gravações de sincronização, não existe backfill a desfazer.

Validação local: testes Node de projeção, período, não-mutação, vínculo canônico, mudanças/cancelamento, colisões e isolamento; PGlite com papéis ativo/inativo/anon, payload mínimo, lifecycle, dados ambíguos e rollback. Teste browser usa fixtures sem rede de produção. Conferir relatório/CI para resultados finais.

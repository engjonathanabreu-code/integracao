# Integração, REURB da Integral

Sistema de regularização fundiária da Integral Soluções em Engenharia: clientes, núcleos, processos, metas, planos, calendário, chat, campo offline, documentos com IA, mapa e PRF.

Feito em React com Vite. Roda na Vercel, com uma função de servidor para a IA. Os dados ficam no aparelho (IndexedDB) enquanto a gravação no Supabase não é ligada.

## Publicar

1. **Criar o repositório**
   ```bash
   git init
   git add .
   git commit -m "Integração REURB"
   git branch -M main
   git remote add origin https://github.com/SUA-CONTA/integracao-reurb.git
   git push -u origin main
   ```
2. **Importar na Vercel:** New Project, escolher o repositório. O Vite é detectado sozinho: build `npm run build`, saída `dist`.
3. **Variáveis de ambiente** (Project Settings, Environment Variables), para Production e Preview:

   | Nome | Para que serve | Obrigatória |
   |---|---|---|
   | `OPENAI_API_KEY` | Análise de documentos pela IA | sim |
   | `OPENAI_MODEL` | Modelo da IA (padrão: gpt-6-astra) | não |
   | `VITE_ERP_SUPABASE_URL` | Endereço do Supabase do ERP | não |
   | `VITE_ERP_SUPABASE_KEY` | Chave publicável do ERP | não |
   | `VITE_DEMO` | `1` liga os dados de exemplo, para treinamento | não |
   | `ERP_SERVICE_ROLE_KEY` | Chave `service_role` do Supabase do ERP, usada só pelas rotas do calendário | para o calendário |
   | `RESEND_API_KEY` | Envio dos e-mails do calendário | para o calendário |
   | `CALENDARIO_REMETENTE` | Remetente, ex.: `Integração Integral <agenda@integralse.com.br>` | não |
   | `CRON_SECRET` | Autoriza os cron da Vercel (financeiro e resumo da agenda) | para os cron |
   | `INTEGRACAO_URL` | Endereço do sistema usado nos links dos e-mails | não |

4. **Proteger o acesso:** Settings, Deployment Protection, ligar Vercel Authentication. Só quem tem conta no time abre o sistema.
5. **Conferir:** entrar, ir em Configurações, Prévia com dados do ERP, e usar os botões "Testar o Supabase do ERP" e "Testar o agente de IA".

## Entrar no sistema

O acesso usa a **mesma conta e senha do ERP Integral**: o login consulta a autenticação do Supabase do ERP e traz o perfil, com setor e função já convertidos. Quem entra pela primeira vez é cadastrado no Integração na hora. Sem internet, quem já entrou naquele aparelho consegue abrir o sistema de novo.

O sistema começa vazio: nenhum município, núcleo, morador ou usuário de exemplo. Para treinar a equipe, ligue `VITE_DEMO=1` em um deploy de teste.

## Importar os dados do ERP

Configurações, aba **Prévia com dados do ERP**, botão "Carregar dados do ERP". Traz usuários com setor e função, municípios com o prefixo do financeiro, núcleos com a etapa no kanban, e os andamentos do CRM, as observações por setor e o histórico de etapas de cada processo. Como o ERP não guarda a remessa, os núcleos entram direto no município; as remessas são criadas depois e cada núcleo é movido para a sua. É só leitura: nada é gravado no ERP. Carregar substitui o que estiver no aparelho; "Restaurar dados de exemplo", na aba Histórico e dados, desfaz.

Moradores e unidades estão no CRM e entram em uma segunda etapa.

## Agente de IA

O navegador nunca vê a chave. Ele manda o pedido para `/api/ia`, e a função repassa à OpenAI Responses API, conferindo a origem e a sessão ativa do usuário. Cada pedido tem limite de 4,5 MB, por isso imagens grandes são reduzidas e convertidas no próprio navegador antes de subir.

## Mapa dos núcleos

Imagens de satélite do World Imagery (Esri), sem chave nem cadastro. O contorno vem de um KMZ ou KML exportado do Google Earth. Para usar as imagens do Google, troque o endereço dos blocos em `CAMADAS`, dentro de `src/App.jsx`, e use uma chave do Google Maps Platform.

## Agentes IA da diretoria

Dois analistas de plantão sobre os dados do próprio sistema, na aba **Agentes IA**. A aba só aparece para quem é da diretoria, e o bloqueio é do banco, não da tela: as funções `integracao_agente_tecnico` e `integracao_agente_comercial` conferem o cargo em `profiles` e recusam qualquer outra conta com erro 42501. A rota `/api/agentes` repassa o token do próprio usuário — nenhuma chave de serviço é usada ali.

O **Agente Técnico** olha os núcleos parados na mesma etapa, os andamentos travados em "Aguardando Prefeitura", "Aguardando Cartório", "Aguardando cliente" e "Pausado", as metas e etapas de planos vencidas, as devolutivas abertas e o ranking das falhas que mais voltam, por categoria da análise. O **Agente Comercial** olha o funil, o índice de fechamento, as ativações, o follow-up atrasado, os leads parados e os clientes que ficaram sem resposta.

Os números são apurados em SQL e entregues prontos ao modelo, que só lê e prioriza: ele não soma nem estima nada. O botão **Conferir os números** mostra as mesmas listas sem passar pela IA, para a diretoria checar a leitura. As funções são `STABLE`: o banco recusa qualquer escrita vinda delas, então os agentes observam e não alteram nada.

Duas decisões de contagem que valem saber: o índice de fechamento fica em branco quando há menos de cinco desfechos na janela, em vez de mostrar um número redondo sem base; e um card que vai de Contrato para Cliente ativo não conta como ganho de novo, porque é o mesmo negócio avançando. Cada painel termina com um bloco de **cobertura do cadastro** — quantos núcleos estão sem responsável, sem andamento ou sem SLA, quantos cards estão sem valor — porque campo vazio não é o mesmo que estar tudo em ordem, e o agente é instruído a dizer isso em vez de concluir do vazio.

Para ligar basta a `OPENAI_API_KEY` que a análise de documentos já usa, e a migration `20260925120000_agentes_diretoria.sql` aplicada no Supabase do ERP.

## Calendário no Google Agenda e no e-mail

O calendário do ERP continua sendo a fonte única: nada no ERP foi alterado. Quando um evento é criado, alterado ou cancelado, um gatilho no banco monta a fila `integracao_calendario_fila` com um convite por participante (e para quem criou), e a rota `/api/calendario-emails` entrega essa fila pela Resend. Mudança só de cor ou de visibilidade não gera e-mail, e os eventos que já existiam no ERP foram adotados em silêncio: o próximo ajuste neles sai como alteração, não como convite novo.

O e-mail leva o evento anexado (`METHOD:REQUEST`), que o Gmail, o Outlook e o iCloud colocam direto na agenda, com os botões de confirmar e recusar; a resposta vai para quem criou o evento. Cancelar o evento manda um `METHOD:CANCEL`, que retira o compromisso das agendas. Como o `UID` é o mesmo e a `SEQUENCE` sobe a cada mudança, nunca aparece um evento duplicado.

Em **Calendário**, o botão *Google Agenda e e-mail* abre o endereço particular de cada pessoa (`/api/calendario-ics?t=…`) para assinar no Google Agenda em **Outras agendas → Aceitar URL**. O endereço é uma senha: quem o tiver vê aqueles compromissos, e o botão *Gerar um novo endereço* invalida o anterior. Ali também ficam as duas opções de e-mail (convites e resumo da manhã); desligar vale só para quem desligou. O feed é pessoal — só o que a pessoa participa ou criou — e o Google o relê de tempo em tempo, então uma mudança pode levar horas para aparecer lá; no e-mail ela chega na hora.

O cron `/api/calendario-resumo` roda às 10h UTC (7h de Brasília), manda o resumo do dia para quem tem compromisso e ainda drena a fila, caso algum convite tenha ficado para trás. O dia começa e termina em Brasília, não no relógio UTC do servidor.

Para ligar: `ERP_SERVICE_ROLE_KEY`, `RESEND_API_KEY` e `CRON_SECRET` nas variáveis da Vercel, o domínio `integralse.com.br` verificado na Resend, e a migration `20260924210000_calendario_google_email.sql` aplicada no Supabase do ERP.

## Campo offline

Instalável como aplicativo pelo próprio navegador. Pré-carregue o núcleo ou a remessa com internet, trabalhe sem rede e sincronize ao voltar. Fotos e pacotes ficam no IndexedDB do aparelho.

## Rodar na sua máquina

```bash
npm install
npm run dev
```

A análise por IA só funciona publicada, porque depende da função `/api/ia`.

## Limites desta versão

- Os dados vivem no aparelho. A gravação no Supabase do Integração ainda não foi ligada.
- Moradores e unidades ainda não vêm do CRM.
- O mapa precisa de internet para carregar as imagens de satélite.

A rota antiga `/api/claude` é mantida somente por compatibilidade e também usa OpenAI. As variáveis Anthropic não são mais utilizadas. Configure `OPENAI_API_KEY` como segredo no servidor, sem prefixo `VITE_`, e faça novo deploy após salvar. A Responses API recebe textos, imagens e PDFs com `store: false`; respostas incompletas ou recusadas não são salvas como análises válidas.

O Leitor de Matrículas IA permanece separado: `/api/ler-matricula` encaminha a análise ao serviço `leitor-de-matriculas.vercel.app`, preservando sua configuração própria. A migração para OpenAI aplica-se aos demais recursos internos de IA (documentos, devolutivas e correções, modelos e ofícios).
